import type { PlatformResponder, PipelineStage } from "../types.js";
import { PIPELINE_STAGES } from "../types.js";
import { formatWhatsAppVerdict } from "./formatter.js";
import type { FinalVerdict } from "../../schemas/final-verdict.js";
import type { WhatsAppCloudClient } from "./client.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Key stages that are sent to WhatsApp users.
 * Intermediate stages are skipped to avoid spamming
 * (WhatsApp sends new messages instead of editing in-place).
 */
const KEY_STAGES: ReadonlySet<PipelineStage> = new Set([
  "planning",
  "searching",
  "judging",
]);

/**
 * Sends responses back to WhatsApp users via the Cloud API client.
 * Implements PlatformResponder for the WhatsApp adapter.
 *
 * Unlike Telegram, WhatsApp has no message edit API, so status updates
 * are sent as new messages. Only key stages are sent to avoid spamming.
 */
export class WhatsAppResponder implements PlatformResponder {
  private readonly client: WhatsAppCloudClient;

  constructor(client: WhatsAppCloudClient) {
    this.client = client;
  }

  async sendText(chatId: string, text: string): Promise<void> {
    try {
      await this.client.sendTextMessage(chatId, text);
    } catch (err: unknown) {
      logger.error({ err, chatId }, "WhatsAppResponder: failed to send text");
    }
  }

  async sendVerdict(
    chatId: string,
    verdict: unknown,
    analysisUrl: string,
  ): Promise<void> {
    try {
      const formatted = formatWhatsAppVerdict(verdict as FinalVerdict);
      await this.client.sendTextMessage(chatId, formatted);

      await this.client.sendCtaUrlMessage(
        chatId,
        "View the complete investigation with sources and reasoning",
        "View Full Analysis",
        analysisUrl,
      );
    } catch (err: unknown) {
      logger.error({ err, chatId }, "WhatsAppResponder: failed to send verdict");
    }
  }

  async sendStatusUpdate(chatId: string, stage: PipelineStage): Promise<void> {
    if (!KEY_STAGES.has(stage)) {
      return;
    }

    try {
      await this.client.sendTextMessage(chatId, PIPELINE_STAGES[stage]);
    } catch (err: unknown) {
      logger.error(
        { err, chatId, stage },
        "WhatsAppResponder: failed to send status update",
      );
    }
  }

  async sendInitial(chatId: string): Promise<void> {
    try {
      await this.client.sendTextMessage(
        chatId,
        "🔍 Investigating your claim... This may take 2-4 minutes for a thorough analysis.",
      );
    } catch (err: unknown) {
      logger.error(
        { err, chatId },
        "WhatsAppResponder: failed to send initial message",
      );
    }
  }

  async sendLink(chatId: string, text: string, url: string): Promise<void> {
    try {
      await this.client.sendCtaUrlMessage(chatId, text, text, url);
    } catch (err: unknown) {
      logger.error({ err, chatId }, "WhatsAppResponder: failed to send link");
    }
  }
}
