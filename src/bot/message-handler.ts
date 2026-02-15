import { type Bot, InlineKeyboard } from "grammy";
import type { InvestigationPipeline } from "../orchestrator/pipeline.js";
import { StatusUpdater } from "./status-updater.js";
import { formatTelegramVerdict } from "../formatter/telegram-formatter.js";
import { detectUrl } from "../services/url-extractor.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Registers the message handler on the bot that wires incoming text messages
 * (forwarded or direct) to the InvestigationPipeline.
 *
 * @param bot - Grammy Bot instance
 * @param pipeline - The investigation pipeline to run claims through
 * @param baseUrl - Base URL for the web server (used for "View Full Analysis" links)
 */
export function createMessageHandler(
  bot: Bot,
  pipeline: InvestigationPipeline,
  baseUrl: string,
): void {
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

    try {
      const result = await pipeline.investigate(text, {
        onStatusUpdate: (stage) => statusUpdater.update(stage),
        onInvestigationCreated: async (investigationId) => {
          const liveUrl = `${baseUrl}/live/${investigationId}`;
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
        telegramChatId: String(chatId),
        telegramMessageId: String(message.message_id),
      });

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
      logger.error({ err, chatId }, "Pipeline failed for message");
      await ctx.api.sendMessage(
        chatId,
        "Sorry, an error occurred while investigating your claim. Please try again later.",
      );
    }
  });
}
