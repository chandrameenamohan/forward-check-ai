/**
 * Platform abstraction layer types for ForwardCheck-AI.
 *
 * These interfaces allow the investigation pipeline to work with
 * any messaging platform (Telegram, WhatsApp, Web) through a
 * unified contract.
 */

/**
 * Pipeline stages that adapters can display as progress updates.
 */
export type PipelineStage =
  | "fetching"
  | "planning"
  | "searching"
  | "analyzing"
  | "challenging"
  | "judging";

/**
 * Human-readable status messages for each pipeline stage.
 */
export const PIPELINE_STAGES: Record<PipelineStage, string> = {
  fetching: "📄 Reading article content...",
  planning: "🔍 Planning investigation strategy...",
  searching: "🌐 Searching sources...",
  analyzing: "🧠 Analyzing domain expertise...",
  challenging: "⚔️ Challenging findings...",
  judging: "⚖️ Rendering verdict...",
};

/**
 * A normalized message from any messaging platform.
 */
export interface PlatformMessage {
  platform: "telegram" | "whatsapp" | "web";
  chatId: string;
  messageId: string;
  text: string;
  isForwarded: boolean;
  isFrequentlyForwarded?: boolean;
  sender: {
    id: string;
    username?: string;
    displayName?: string;
  };
  raw?: unknown;
}

/**
 * Sends responses back to users on a specific platform.
 */
export interface PlatformResponder {
  sendText(chatId: string, text: string): Promise<void>;
  sendVerdict(chatId: string, verdict: unknown, analysisUrl: string): Promise<void>;
  sendStatusUpdate(chatId: string, stage: PipelineStage): Promise<void>;
  sendInitial(chatId: string): Promise<void>;
  sendLink(chatId: string, text: string, url: string): Promise<void>;
}

/**
 * Lifecycle management for a messaging platform integration.
 */
export interface PlatformAdapter {
  readonly platform: string;
  start(): Promise<void>;
  stop(): Promise<void>;
}
