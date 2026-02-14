import type { Api, RawApi } from "grammy";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Pipeline stages that the StatusUpdater can display.
 */
export type PipelineStage =
  | "planning"
  | "searching"
  | "analyzing"
  | "challenging"
  | "judging";

/**
 * Human-readable status messages for each pipeline stage.
 */
export const PIPELINE_STAGES: Record<PipelineStage, string> = {
  planning: "🔍 Planning investigation strategy...",
  searching: "🌐 Searching sources...",
  analyzing: "🧠 Analyzing domain expertise...",
  challenging: "⚔️ Challenging findings...",
  judging: "⚖️ Rendering verdict...",
};

/**
 * Edits Telegram messages to show investigation progress.
 * Sends an initial "Investigating..." message, then edits it
 * as the pipeline progresses through stages.
 */
export class StatusUpdater {
  private readonly api: Api<RawApi>;
  private readonly chatId: number;
  private statusMessageId: number | null = null;

  constructor(api: Api<RawApi>, chatId: number) {
    this.api = api;
    this.chatId = chatId;
  }

  /**
   * Send the initial "Investigating your claim..." message and save its ID
   * for later edits.
   */
  async sendInitial(): Promise<void> {
    try {
      const sent = await this.api.sendMessage(
        this.chatId,
        "🔍 Investigating your claim... This may take up to 60 seconds.",
      );
      this.statusMessageId = sent.message_id;
    } catch (err: unknown) {
      logger.error({ err }, "Failed to send initial status message");
    }
  }

  /**
   * Edit the initial message with stage-appropriate text.
   * Handles Telegram API errors gracefully (logs and continues).
   */
  async update(stage: PipelineStage): Promise<void> {
    if (this.statusMessageId === null) {
      logger.warn("Cannot update status: no initial message sent");
      return;
    }

    try {
      await this.api.editMessageText(
        this.chatId,
        this.statusMessageId,
        PIPELINE_STAGES[stage],
      );
    } catch (err: unknown) {
      logger.error({ err, stage }, "Failed to update status message");
    }
  }

  /**
   * Send the formatted verdict as a new message with HTML parse mode.
   */
  async sendVerdict(html: string): Promise<void> {
    try {
      await this.api.sendMessage(this.chatId, html, { parse_mode: "HTML" });
    } catch (err: unknown) {
      logger.error({ err }, "Failed to send verdict message");
    }
  }
}
