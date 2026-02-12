import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { ClassifierResultSchema } from "../../../src/schemas/classifier-result.js";
import { runClassifier } from "../../../src/agents/classifier-agent.js";

/**
 * Helper to build a mock Message response from the Anthropic API.
 */
function buildMockMessage(
  overrides: Partial<Message> & {
    content: Message["content"];
    stop_reason: Message["stop_reason"];
  },
): Message {
  return {
    id: "msg_test",
    type: "message" as const,
    role: "assistant" as const,
    model: MODELS.HAIKU,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
}

const VALID_FACTUAL_RESULT = {
  category: "factual_claim",
  extractedClaim: "PM Modi announced Rs 5000 direct transfer to all citizens",
  isCompound: false,
  domain: "geopolitics",
  language: "en",
  urgency: "high",
  reasoning: "This is a specific factual claim about a government policy announcement that can be verified.",
};

const VALID_GREETING_RESULT = {
  category: "greeting",
  extractedClaim: "",
  isCompound: false,
  domain: "general",
  language: "en",
  urgency: "low",
  reasoning: "The user is greeting the bot.",
};

const VALID_COMPOUND_RESULT = {
  category: "factual_claim",
  extractedClaim: "Modi gave Rs 5000 AND started a new scheme for farmers",
  isCompound: true,
  domain: "economics",
  language: "en",
  urgency: "high",
  reasoning: "This contains two separate factual claims joined by AND.",
};

describe("runClassifier", () => {
  let client: ClaudeClient;
  let mockCreate: Mock;

  beforeEach(() => {
    client = new ClaudeClient("test-api-key");
    mockCreate = vi.fn();
    (client._client.messages as unknown as { create: Mock }).create =
      mockCreate;
  });

  it("should return valid ClassifierResult for a factual claim", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_FACTUAL_RESULT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runClassifier(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
      client,
    );

    expect(result.result.category).toBe("factual_claim");
    expect(result.result.extractedClaim).toBe(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
    );
    expect(result.result.isCompound).toBe(false);
    expect(result.result.domain).toBe("geopolitics");
    expect(result.result.language).toBe("en");
    expect(result.result.urgency).toBe("high");
    expect(result.result.reasoning).toBeTruthy();

    // Verify it was called with Haiku model
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0]![0];
    expect(callArgs.model).toBe(MODELS.HAIKU);
  });

  it("should classify greeting messages correctly", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_GREETING_RESULT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runClassifier("Hello! How are you?", client);

    expect(result.result.category).toBe("greeting");
    expect(result.result.urgency).toBe("low");
  });

  it("should detect compound claims", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_COMPOUND_RESULT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runClassifier(
      "Modi gave Rs 5000 AND started a new scheme for farmers",
      client,
    );

    expect(result.result.isCompound).toBe(true);
    expect(result.result.category).toBe("factual_claim");
  });

  it("should validate output against Zod schema", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_FACTUAL_RESULT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runClassifier("Some claim", client);

    // Should parse successfully with Zod
    const parsed = ClassifierResultSchema.safeParse(result.result);
    expect(parsed.success).toBe(true);
  });

  it("should retry once on JSON parse failure", async () => {
    // First response: invalid JSON
    const badResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "This is not valid JSON",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    // Second response (retry): valid JSON
    const goodResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_FACTUAL_RESULT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate
      .mockResolvedValueOnce(badResponse)
      .mockResolvedValueOnce(goodResponse);

    const result = await runClassifier("Some factual claim", client);

    expect(result.result.category).toBe("factual_claim");
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("should throw after retry exhaustion on persistent parse failure", async () => {
    const badResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Not valid JSON at all",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValue(badResponse);

    await expect(
      runClassifier("Some claim", client),
    ).rejects.toThrow();

    // Should have been called twice: initial + 1 retry
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("should not use tools or thinking config", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_FACTUAL_RESULT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    await runClassifier("Test message", client);

    const callArgs = mockCreate.mock.calls[0]![0];
    // Should NOT have tools or thinking config
    expect(callArgs.tools).toBeUndefined();
    expect(callArgs.thinking).toBeUndefined();
  });

  it("should return cost information", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_FACTUAL_RESULT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runClassifier("Test message", client);

    expect(result.costUsd).toBeGreaterThan(0);
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should classify 'Modi gives Rs 5000' as factual_claim via real API",
      { timeout: 30_000 },
      async () => {
        const realClient = new ClaudeClient(apiKey!);

        const result = await runClassifier(
          "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024",
          realClient,
        );

        // Validate against Zod schema
        const parsed = ClassifierResultSchema.safeParse(result.result);
        expect(parsed.success).toBe(true);

        // Should be classified as factual_claim
        expect(result.result.category).toBe("factual_claim");

        // Should extract the core claim
        expect(result.result.extractedClaim).toBeTruthy();
        expect(result.result.extractedClaim.length).toBeGreaterThan(10);

        // Domain should be relevant (geopolitics or economics)
        expect(["geopolitics", "economics"]).toContain(result.result.domain);

        // Should have reasoning
        expect(result.result.reasoning).toBeTruthy();

        // Log cost for budget tracking
        console.info(
          `[QA] Classifier cost: $${result.costUsd.toFixed(6)}`,
        );
      },
    );
  });
});
