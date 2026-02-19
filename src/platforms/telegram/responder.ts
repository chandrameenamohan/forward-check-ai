import type { Api, RawApi } from "grammy";
import { InlineKeyboard } from "grammy";
import type { PlatformResponder, PipelineStage } from "../types.js";
import { PIPELINE_STAGES } from "../types.js";
import { formatTelegramVerdict } from "../../formatter/telegram-formatter.js";
import type { FinalVerdict } from "../../schemas/final-verdict.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Sends responses back to Telegram users via the Grammy API.
 * Implements PlatformResponder for the Telegram adapter.
 *
 * Status updates work by editing an initial "Investigating..." message
 * in-place, tracked via a Map keyed by chatId.
 */
export class TelegramResponder implements PlatformResponder {
  private readonly api: Api<RawApi>;
  /** Stores the initial status message ID per chatId for in-place editing. */
  private readonly statusMessageIds = new Map<string, number>();

  constructor(api: Api<RawApi>) {
    this.api = api;
  }

  async sendText(chatId: string, text: string): Promise<void> {
    try {
      await this.api.sendMessage(Number(chatId), text);
    } catch (err: unknown) {
      logger.error({ err, chatId }, "TelegramResponder: failed to send text");
    }
  }

  async sendVerdict(
    chatId: string,
    verdict: unknown,
    analysisUrl: string,
  ): Promise<void> {
    try {
      const verdictHtml = formatTelegramVerdict(verdict as FinalVerdict);
      const isPublicUrl = analysisUrl.startsWith("https://");

      if (isPublicUrl) {
        const keyboard = new InlineKeyboard().url(
          "View Full Analysis",
          analysisUrl,
        );
        await this.api.sendMessage(Number(chatId), verdictHtml, {
          parse_mode: "HTML",
          reply_markup: keyboard,
        });
      } else {
        await this.api.sendMessage(
          Number(chatId),
          `${verdictHtml}\n\n🔗 Full analysis: ${analysisUrl}`,
          { parse_mode: "HTML" },
        );
      }
    } catch (err: unknown) {
      logger.error({ err, chatId }, "TelegramResponder: failed to send verdict");
    }
  }

  async sendStatusUpdate(chatId: string, stage: PipelineStage): Promise<void> {
    const messageId = this.statusMessageIds.get(chatId);
    if (messageId === undefined) {
      logger.warn(
        { chatId, stage },
        "TelegramResponder: cannot update status — no initial message sent",
      );
      return;
    }

    try {
      await this.api.editMessageText(
        Number(chatId),
        messageId,
        PIPELINE_STAGES[stage],
      );
    } catch (err: unknown) {
      logger.error(
        { err, chatId, stage },
        "TelegramResponder: failed to update status",
      );
    }
  }

  async sendInitial(chatId: string): Promise<void> {
    try {
      const sent = await this.api.sendMessage(
        Number(chatId),
        "🔍 Investigating your claim... This may take 2-4 minutes for a thorough analysis.",
      );
      this.statusMessageIds.set(chatId, sent.message_id);
    } catch (err: unknown) {
      logger.error(
        { err, chatId },
        "TelegramResponder: failed to send initial message",
      );
    }
  }

  async sendLink(chatId: string, text: string, url: string): Promise<void> {
    try {
      const isPublicUrl = url.startsWith("https://");

      if (isPublicUrl) {
        const keyboard = new InlineKeyboard().url(text, url);
        await this.api.sendMessage(Number(chatId), `🔍 ${text}:`, {
          reply_markup: keyboard,
        });
      } else {
        await this.api.sendMessage(
          Number(chatId),
          `🔍 ${text}:\n${url}`,
        );
      }
    } catch (err: unknown) {
      logger.error({ err, chatId }, "TelegramResponder: failed to send link");
    }
  }
}
