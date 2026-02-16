import Anthropic from "@anthropic-ai/sdk";
import type { MessageCreateParamsNonStreaming, Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** Model constants for the 3-tier strategy */
export const MODELS = {
  HAIKU: "claude-haiku-4-5-20251001",
  SONNET: "claude-sonnet-4-5-20250929",
  OPUS: "claude-opus-4-6",
} as const;

export type ModelId = (typeof MODELS)[keyof typeof MODELS];

/** Per-million-token pricing (USD) */
const PRICING: Record<string, { input: number; output: number }> = {
  [MODELS.HAIKU]: { input: 1, output: 5 },
  [MODELS.SONNET]: { input: 3, output: 15 },
  [MODELS.OPUS]: { input: 15, output: 75 },
};

/** Result returned from createMessage, bundling the API response with cost info */
export interface CreateMessageResult {
  response: Message;
  costUsd: number;
}

/**
 * Thin wrapper around the Anthropic SDK that handles initialization,
 * provides typed helper methods, and logs token usage + cost.
 */
export class ClaudeClient {
  private readonly client: Anthropic;

  constructor(apiKey: string) {
    this.client = new Anthropic({ apiKey });
  }

  /** Expose client for internal mocking in tests */
  get _client(): Anthropic {
    return this.client;
  }

  /**
   * Wraps client.messages.create() with logging for model, token usage, and cost.
   * Defaults to temperature: 0 for deterministic analytical output.
   * Extended thinking requires temperature 1 (API constraint), so we skip the override when thinking is enabled.
   */
  async createMessage(
    params: MessageCreateParamsNonStreaming,
  ): Promise<CreateMessageResult> {
    const effectiveParams =
      params.temperature !== undefined || params.thinking
        ? params
        : { ...params, temperature: 0 as const };
    const response = await this.client.messages.create(effectiveParams);

    const { input_tokens, output_tokens } = response.usage;

    // Thinking tokens are already included in output_tokens by the API,
    // so no separate accounting is needed for cost estimation.
    const usedThinking = response.content.some(
      (block) => block.type === "thinking",
    );

    const costUsd = this.estimateCost(
      params.model,
      input_tokens,
      output_tokens,
    );

    logger.info(
      {
        model: params.model,
        inputTokens: input_tokens,
        outputTokens: output_tokens,
        usedThinking,
        costUsd: costUsd.toFixed(6),
        stopReason: response.stop_reason,
      },
      "Claude API call completed",
    );

    return { response, costUsd };
  }

  /**
   * Estimate USD cost based on model pricing.
   * Thinking tokens are billed as output tokens.
   */
  estimateCost(
    model: string,
    inputTokens: number,
    outputTokens: number,
    thinkingTokens: number = 0,
  ): number {
    const pricing = PRICING[model];
    if (!pricing) {
      logger.warn({ model }, "Unknown model for cost estimation, using Opus pricing");
      const opusPricing = PRICING[MODELS.OPUS]!;
      return (
        (inputTokens / 1_000_000) * opusPricing.input +
        ((outputTokens + thinkingTokens) / 1_000_000) * opusPricing.output
      );
    }

    return (
      (inputTokens / 1_000_000) * pricing.input +
      ((outputTokens + thinkingTokens) / 1_000_000) * pricing.output
    );
  }
}
