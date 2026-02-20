import { type Bot, type CommandContext, type Context, InlineKeyboard } from "grammy";
import type { InvestigationPipeline } from "../orchestrator/pipeline.js";
import type { InvestigationRepository } from "../db/investigation-repository.js";
import type { FeedbackRepository } from "../db/feedback-repository.js";
import type { GitHubIssueService } from "../services/github-issues.js";
import { StatusUpdater } from "./status-updater.js";
import { formatTelegramVerdict } from "../platforms/telegram/formatter.js";
import { detectUrl } from "../services/url-extractor.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

const FEEDBACK_MIN_LENGTH = 10;

/** Maximum time (ms) to wait for the pipeline before timing out. */
const PIPELINE_TIMEOUT_MS = 300_000;

/**
 * Wrap a promise with a timeout. Rejects with a clear error if the deadline is exceeded.
 */
function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Handles /bug or /feedback Telegram commands by saving feedback locally
 * and optionally creating a GitHub issue.
 */
async function handleFeedbackCommand(
  ctx: CommandContext<Context>,
  type: "bug" | "feedback",
  feedbackRepo: FeedbackRepository,
  githubService?: GitHubIssueService,
): Promise<void> {
  const description = ctx.match.trim();
  const chatId = ctx.chat.id;
  const typeLabel = type === "bug" ? "Bug report" : "Feedback";

  if (description.length < FEEDBACK_MIN_LENGTH) {
    await ctx.api.sendMessage(
      chatId,
      `Please include a description of at least 10 characters.\n\nUsage: /${type} <description>`,
    );
    return;
  }

  const telegramUsername = ctx.from?.username ?? undefined;
  const telegramUserId = ctx.from ? String(ctx.from.id) : undefined;

  const title = description.length <= 200
    ? description
    : description.slice(0, 197) + "...";

  const id = feedbackRepo.create({
    type,
    title,
    description,
    sourceChannel: "telegram",
    telegramUsername,
    telegramUserId,
  });

  logger.info({ id, type, chatId, telegramUsername }, `${typeLabel} created via Telegram`);

  let githubIssueUrl: string | undefined;

  if (githubService) {
    const typeEmoji = type === "bug" ? "🐛" : "💬";
    const body = [
      `**${typeEmoji} ${typeLabel}**`,
      "",
      description,
      "",
      "---",
      `**Source:** telegram`,
      `**Username:** ${telegramUsername ? `@${telegramUsername}` : "unknown"}`,
      `**User ID:** ${telegramUserId ?? "unknown"}`,
      `**Feedback ID:** ${id}`,
    ].join("\n");

    const labels = [type, "from-telegram", "triage"];

    const result = await githubService.createIssue({
      title: `[${type}] ${title}`,
      body,
      labels,
    });

    if (result.success && result.issueUrl && result.issueNumber) {
      githubIssueUrl = result.issueUrl;
      feedbackRepo.updateGitHubIssue(id, result.issueUrl, result.issueNumber);
      logger.info({ id, issueUrl: result.issueUrl }, "GitHub issue created for Telegram feedback");
    } else {
      logger.warn({ id, error: result.error }, "GitHub issue creation failed for Telegram feedback");
    }
  }

  if (githubIssueUrl) {
    await ctx.api.sendMessage(
      chatId,
      `${typeLabel} submitted! Track it here:\n${githubIssueUrl}`,
    );
  } else {
    await ctx.api.sendMessage(
      chatId,
      `${typeLabel} saved. Thanks for letting us know!`,
    );
  }
}

/**
 * Registers the message handler on the bot that wires incoming text messages
 * (forwarded or direct) to the InvestigationPipeline, and optionally registers
 * /bug and /feedback commands for the feedback pipeline.
 *
 * @param bot - Grammy Bot instance
 * @param pipeline - The investigation pipeline to run claims through
 * @param baseUrl - Base URL for the web server (used for "View Full Analysis" links)
 * @param repo - Investigation repository for marking failed investigations
 * @param feedbackRepo - Optional feedback repository for /bug and /feedback commands
 * @param githubService - Optional GitHub issue service for creating issues from feedback
 */
export function createMessageHandler(
  bot: Bot,
  pipeline: InvestigationPipeline,
  baseUrl: string,
  repo: InvestigationRepository,
  feedbackRepo?: FeedbackRepository,
  githubService?: GitHubIssueService,
): void {
  // Register /start command so it doesn't go through the pipeline
  bot.command("start", async (ctx) => {
    await ctx.api.sendMessage(
      ctx.chat.id,
      [
        "Hi there! I'm ForwardCheck — a fact-checking bot.",
        "Forward me a message or send me a claim, and I'll investigate whether it's true or false using multiple AI agents and web sources.",
        "Just paste or forward the claim you'd like me to check!",
      ].join("\n\n"),
    );
  });

  // Register /bug and /feedback commands BEFORE the message:text handler
  if (feedbackRepo) {
    bot.command("bug", async (ctx) => {
      await handleFeedbackCommand(ctx, "bug", feedbackRepo, githubService);
    });

    bot.command("feedback", async (ctx) => {
      await handleFeedbackCommand(ctx, "feedback", feedbackRepo, githubService);
    });
  }

  bot.on("message:text", async (ctx) => {
    const message = ctx.message;
    if (!message) return;

    const text = message.text;
    if (!text) return;

    const chatId = message.chat.id;
    const isForwarded = message.forward_origin !== undefined;

    logger.info(
      { chatId, isForwarded },
      isForwarded ? "Received forwarded message" : "Received direct text message",
    );

    // Detect URL in message — send "Reading article..." status before pipeline runs
    const detectedUrl = detectUrl(text);
    if (detectedUrl) {
      logger.info({ url: detectedUrl, chatId }, "URL detected in message");
      await ctx.api.sendMessage(chatId, "🔗 Reading article...");
    }

    // Send initial status and create updater for progress
    const statusUpdater = new StatusUpdater(ctx.api, chatId);
    await statusUpdater.sendInitial();

    // Track investigation ID so we can mark it failed on timeout/error
    let investigationId: string | undefined;

    try {
      const pipelinePromise = pipeline.investigate(text, {
        onStatusUpdate: (stage) => statusUpdater.update(stage),
        onInvestigationCreated: async (id) => {
          investigationId = id;
          const liveUrl = `${baseUrl}/live/${id}`;
          const isPublicUrl = liveUrl.startsWith("https://");

          if (isPublicUrl) {
            const keyboard = new InlineKeyboard().url(
              "Watch Live Investigation",
              liveUrl,
            );
            await ctx.api.sendMessage(
              chatId,
              "🔍 Watch your claim get investigated in real-time:",
              { reply_markup: keyboard },
            );
          } else {
            await ctx.api.sendMessage(
              chatId,
              `🔍 Watch your claim get investigated in real-time:\n${liveUrl}`,
            );
          }
        },
        platform: "telegram",
        platformChatId: String(chatId),
        platformMessageId: String(message.message_id),
      });

      const result = await withTimeout(pipelinePromise, PIPELINE_TIMEOUT_MS, "Investigation pipeline");

      // Non-factual short-circuit: send plain text response
      if (result.nonFactualResponse) {
        await ctx.api.sendMessage(chatId, result.nonFactualResponse);
        return;
      }

      // Factual claim with verdict
      if (result.verdict) {
        const analysisUrl = `${baseUrl}/v/${result.investigationId}`;
        const isPublicUrl = analysisUrl.startsWith("https://");
        const verdictHtml = formatTelegramVerdict(result.verdict);

        if (isPublicUrl) {
          const keyboard = new InlineKeyboard().url(
            "View Full Analysis",
            analysisUrl,
          );
          await ctx.api.sendMessage(chatId, verdictHtml, {
            parse_mode: "HTML",
            reply_markup: keyboard,
          });
        } else {
          // In dev, Telegram rejects non-HTTPS URLs in inline keyboards
          await ctx.api.sendMessage(
            chatId,
            `${verdictHtml}\n\n🔗 Full analysis: ${analysisUrl}`,
            { parse_mode: "HTML" },
          );
        }
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errMsg, chatId, investigationId }, "Pipeline failed for message");

      // Mark the investigation as failed in DB so it doesn't stay stuck at 'pending'
      if (investigationId) {
        try {
          repo.updateStatus(investigationId, "failed");
        } catch (dbErr) {
          logger.error({ dbErr, investigationId }, "Failed to mark investigation as failed");
        }
      }

      const isTimeout = errMsg.includes("timed out");
      const userMessage = isTimeout
        ? "Sorry, this investigation is taking longer than expected. Please try again — some claims require more time."
        : "Sorry, an error occurred while investigating your claim. Please try again later.";

      await ctx.api.sendMessage(chatId, userMessage);
    }
  });
}
