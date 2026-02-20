import { Bot, type CommandContext, type Context, InlineKeyboard } from "grammy";
import type { PlatformAdapter, PlatformMessage } from "../types.js";
import { TelegramResponder } from "./responder.js";
import type { InvestigationPipeline } from "../../orchestrator/pipeline.js";
import type { InvestigationRepository } from "../../db/investigation-repository.js";
import type { FeedbackRepository } from "../../db/feedback-repository.js";
import type { GitHubIssueService } from "../../services/github-issues.js";
import { detectUrl } from "../../services/url-extractor.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

const FEEDBACK_MIN_LENGTH = 10;

/** Maximum time (ms) to wait for the pipeline before timing out. */
const PIPELINE_TIMEOUT_MS = 300_000;

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
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
    const typeEmoji = type === "bug" ? "Bug" : "Feedback";
    const body = [
      `**${typeEmoji}**`,
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
 * Telegram platform adapter that encapsulates Grammy bot setup,
 * message handler registration, and start/stop lifecycle.
 *
 * Implements PlatformAdapter so it can be managed alongside
 * other platform adapters (WhatsApp, Web).
 */
export class TelegramAdapter implements PlatformAdapter {
  readonly platform = "telegram";

  private readonly token: string;
  private readonly pipeline: InvestigationPipeline;
  private readonly baseUrl: string;
  private readonly repo: InvestigationRepository;
  private readonly feedbackRepo?: FeedbackRepository;
  private readonly githubService?: GitHubIssueService;
  private readonly bot: Bot;
  private responder: TelegramResponder | undefined;

  constructor(
    token: string,
    pipeline: InvestigationPipeline,
    baseUrl: string,
    repo: InvestigationRepository,
    feedbackRepo?: FeedbackRepository,
    githubService?: GitHubIssueService,
  ) {
    this.token = token;
    this.pipeline = pipeline;
    this.baseUrl = baseUrl;
    this.repo = repo;
    this.feedbackRepo = feedbackRepo;
    this.githubService = githubService;

    this.bot = new Bot(this.token);
    this.bot.catch((err) => {
      logger.error({ err: err.error }, "Telegram bot error");
    });

    this.registerHandlers();
  }

  /** Expose bot for testing purposes. */
  getBot(): Bot {
    return this.bot;
  }

  /** Get the bot username (available after start()). */
  getBotUsername(): string | undefined {
    return this.bot.botInfo?.username;
  }

  async start(): Promise<void> {
    this.responder = new TelegramResponder(this.bot.api);
    this.startBotWithRetry();
  }

  async stop(): Promise<void> {
    this.bot.stop();
  }

  private startBotWithRetry(retries = 5, delayMs = 3000): void {
    this.bot.start({
      onStart: (botInfo) => {
        logger.info(
          { username: botInfo.username, id: botInfo.id },
          "Telegram bot started",
        );
      },
    }).catch((err: unknown) => {
      const is409 =
        err instanceof Error &&
        (err.message.includes("409") || err.message.includes("Conflict"));
      if (is409 && retries > 0) {
        logger.warn(
          { retriesLeft: retries },
          "Telegram bot 409 conflict — old instance still polling, retrying...",
        );
        setTimeout(() => this.startBotWithRetry(retries - 1, delayMs * 2), delayMs);
      } else {
        logger.error({ err }, "Telegram bot polling failed — server continues without bot");
      }
    });
  }

  /**
   * Converts a Grammy message context into a PlatformMessage.
   */
  private toPlatformMessage(ctx: Context): PlatformMessage | null {
    const message = ctx.message;
    if (!message?.text) return null;

    return {
      platform: "telegram",
      chatId: String(message.chat.id),
      messageId: String(message.message_id),
      text: message.text,
      isForwarded: message.forward_origin !== undefined,
      sender: {
        id: String(message.from?.id ?? message.chat.id),
        username: message.from?.username,
        displayName: message.from?.first_name,
      },
      raw: message,
    };
  }

  /**
   * Registers all Grammy handlers: /start, /bug, /feedback, and message:text.
   */
  private registerHandlers(): void {
    // /start command
    this.bot.command("start", async (ctx) => {
      await ctx.api.sendMessage(
        ctx.chat.id,
        [
          "Hi there! I'm ForwardCheck — a fact-checking bot.",
          "Forward me a message or send me a claim, and I'll investigate whether it's true or false using multiple AI agents and web sources.",
          "Just paste or forward the claim you'd like me to check!",
        ].join("\n\n"),
      );
    });

    // /bug and /feedback commands
    if (this.feedbackRepo) {
      const feedbackRepo = this.feedbackRepo;
      const githubService = this.githubService;

      this.bot.command("bug", async (ctx) => {
        await handleFeedbackCommand(ctx, "bug", feedbackRepo, githubService);
      });

      this.bot.command("feedback", async (ctx) => {
        await handleFeedbackCommand(ctx, "feedback", feedbackRepo, githubService);
      });
    }

    // Main message handler
    this.bot.on("message:text", async (ctx) => {
      const platformMessage = this.toPlatformMessage(ctx);
      if (!platformMessage) return;

      await this.handleTextMessage(platformMessage, ctx);
    });
  }

  /**
   * Processes a text message through the investigation pipeline.
   */
  private async handleTextMessage(
    message: PlatformMessage,
    ctx: Context,
  ): Promise<void> {
    const chatId = message.chatId;

    logger.info(
      { chatId, isForwarded: message.isForwarded },
      message.isForwarded ? "Received forwarded message" : "Received direct text message",
    );

    // Detect URL in message
    const detectedUrl = detectUrl(message.text);
    if (detectedUrl) {
      logger.info({ url: detectedUrl, chatId }, "URL detected in message");
      await ctx.api.sendMessage(Number(chatId), "Reading article...");
    }

    // Create responder for this interaction if not yet created via start()
    const responder = this.responder ?? new TelegramResponder(this.bot.api);

    // Send initial status
    await responder.sendInitial(chatId);

    let investigationId: string | undefined;

    try {
      const pipelinePromise = this.pipeline.investigate(message.text, {
        onStatusUpdate: (stage) => responder.sendStatusUpdate(chatId, stage),
        onInvestigationCreated: async (id) => {
          investigationId = id;
          const liveUrl = `${this.baseUrl}/live/${id}`;
          await responder.sendLink(chatId, "Watch Live Investigation", liveUrl);
        },
        platform: "telegram",
        platformChatId: chatId,
        platformMessageId: message.messageId,
      });

      const result = await withTimeout(pipelinePromise, PIPELINE_TIMEOUT_MS, "Investigation pipeline");

      if (result.nonFactualResponse) {
        await responder.sendText(chatId, result.nonFactualResponse);
        return;
      }

      if (result.verdict) {
        const analysisUrl = `${this.baseUrl}/v/${result.investigationId}`;
        await responder.sendVerdict(chatId, result.verdict, analysisUrl);
      }
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error({ err: errMsg, chatId, investigationId }, "Pipeline failed for message");

      if (investigationId) {
        try {
          this.repo.updateStatus(investigationId, "failed");
        } catch (dbErr) {
          logger.error({ dbErr, investigationId }, "Failed to mark investigation as failed");
        }
      }

      const isTimeout = errMsg.includes("timed out");
      const userMessage = isTimeout
        ? "Sorry, this investigation is taking longer than expected. Please try again — some claims require more time."
        : "Sorry, an error occurred while investigating your claim. Please try again later.";

      await responder.sendText(chatId, userMessage);
    }
  }
}
