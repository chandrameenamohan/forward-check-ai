import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../src/services/claude-client.js";
import Anthropic from "@anthropic-ai/sdk";

describe("ClaudeClient", () => {
  describe("MODELS", () => {
    it("should export correct model identifiers", () => {
      expect(MODELS.HAIKU).toBe("claude-haiku-4-5-20251001");
      expect(MODELS.SONNET).toBe("claude-sonnet-4-5-20250929");
      expect(MODELS.OPUS).toBe("claude-opus-4-6");
    });
  });

  describe("constructor", () => {
    it("should initialize Anthropic client with API key", () => {
      const client = new ClaudeClient("test-api-key-123");
      expect(client).toBeInstanceOf(ClaudeClient);
    });
  });

  describe("estimateCost", () => {
    let client: ClaudeClient;

    beforeEach(() => {
      client = new ClaudeClient("test-api-key-123");
    });

    it("should estimate cost correctly for Haiku", () => {
      // Haiku: $1/MTok input, $5/MTok output
      // 1000 input tokens = $0.001, 500 output tokens = $0.0025
      const cost = client.estimateCost(MODELS.HAIKU, 1000, 500);
      expect(cost).toBeCloseTo(0.0035, 6);
    });

    it("should estimate cost correctly for Sonnet", () => {
      // Sonnet: $3/MTok input, $15/MTok output
      // 1000 input tokens = $0.003, 500 output tokens = $0.0075
      const cost = client.estimateCost(MODELS.SONNET, 1000, 500);
      expect(cost).toBeCloseTo(0.0105, 6);
    });

    it("should estimate cost correctly for Opus 4.6", () => {
      // Opus 4.6: $15/MTok input, $75/MTok output
      // 1000 input tokens = $0.015, 500 output tokens = $0.0375
      const cost = client.estimateCost(MODELS.OPUS, 1000, 500);
      expect(cost).toBeCloseTo(0.0525, 6);
    });

    it("should return zero cost for zero tokens", () => {
      const cost = client.estimateCost(MODELS.HAIKU, 0, 0);
      expect(cost).toBe(0);
    });

    it("should use output pricing for thinking tokens", () => {
      // Thinking tokens are billed as output tokens
      // Opus 4.6: $15/MTok input, $75/MTok output
      // 1000 input + 500 output + 2000 thinking = $0.015 + $0.0375 + $0.15 = $0.2025
      const cost = client.estimateCost(MODELS.OPUS, 1000, 500, 2000);
      expect(cost).toBeCloseTo(0.2025, 6);
    });

    it("should default thinking tokens to zero", () => {
      const costWithout = client.estimateCost(MODELS.OPUS, 1000, 500);
      const costWithZero = client.estimateCost(MODELS.OPUS, 1000, 500, 0);
      expect(costWithout).toBe(costWithZero);
    });
  });

  describe("createMessage", () => {
    it("should call Anthropic SDK messages.create and return result with cost", async () => {
      const client = new ClaudeClient("test-api-key-123");

      const mockResponse = {
        id: "msg_test123",
        type: "message" as const,
        role: "assistant" as const,
        content: [{ type: "text" as const, text: "Hello!", citations: null }],
        model: MODELS.HAIKU,
        stop_reason: "end_turn" as const,
        stop_sequence: null,
        usage: {
          input_tokens: 10,
          output_tokens: 5,
          cache_creation_input_tokens: null,
          cache_read_input_tokens: null,
          server_tool_use: null,
          service_tier: null,
          inference_geo: null,
        },
      };

      // Mock the Anthropic messages.create method on the underlying client
      const mockCreate = vi.fn().mockResolvedValue(mockResponse);
      (client._client.messages as unknown as { create: Mock }).create =
        mockCreate;

      const result = await client.createMessage({
        model: MODELS.HAIKU,
        max_tokens: 100,
        messages: [{ role: "user", content: "Hello" }],
      });

      expect(result.response).toBe(mockResponse);
      expect(result.costUsd).toBeGreaterThan(0);
      // Haiku: 10 input * $1/MTok + 5 output * $5/MTok = $0.00001 + $0.000025 = $0.000035
      expect(result.costUsd).toBeCloseTo(0.000035, 8);
    });
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should make a real API call to Haiku and get a response",
      { timeout: 30_000 },
      async () => {
        const client = new ClaudeClient(apiKey!);

        const result = await client.createMessage({
          model: MODELS.HAIKU,
          max_tokens: 50,
          messages: [{ role: "user", content: "Say hello in one word." }],
        });

        expect(result.response).toBeDefined();
        expect(result.response.content.length).toBeGreaterThan(0);

        const textBlock = result.response.content.find(
          (block) => block.type === "text",
        );
        expect(textBlock).toBeDefined();

        expect(result.response.usage.input_tokens).toBeGreaterThan(0);
        expect(result.response.usage.output_tokens).toBeGreaterThan(0);
        expect(result.costUsd).toBeGreaterThan(0);

        // Log cost for budget tracking
        console.info(
          `[QA] Haiku API cost: $${result.costUsd.toFixed(6)} (${result.response.usage.input_tokens} in, ${result.response.usage.output_tokens} out)`,
        );
      },
    );
  });
});
