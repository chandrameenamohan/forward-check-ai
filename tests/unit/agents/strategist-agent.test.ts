import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { SearchStrategySchema } from "../../../src/schemas/search-strategy.js";
import { runStrategist } from "../../../src/agents/strategist-agent.js";
import type { ClassifierResult } from "../../../src/schemas/classifier-result.js";

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
    model: MODELS.OPUS,
    stop_sequence: null,
    usage: {
      input_tokens: 2000,
      output_tokens: 800,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
}

const VALID_STRATEGY: import("../../../src/schemas/search-strategy.js").SearchStrategy = {
  claimCharacteristics: {
    type: "authority_claim",
    suspectedPattern: "fabrication",
    verifiabilityAssessment: "This claim can be verified by checking official government announcements and press releases from PMO.",
  },
  investigatorGuidance: {
    sourceVerification: {
      targetQueries: [
        "Modi Rs 5000 direct transfer announcement 2024",
        "PMO official announcement direct benefit transfer March 2024",
      ],
      prioritySources: ["pmo.gov.in", "pib.gov.in", "reuters.com"],
      lookFor: "Official government press releases or PMO announcements confirming or denying this specific transfer scheme.",
    },
    domainExpertise: {
      targetQueries: [
        "India direct benefit transfer scheme 2024",
        "Modi government welfare scheme Rs 5000",
      ],
      prioritySources: ["rbi.org.in", "economictimes.com", "livemint.com"],
      lookFor: "Economic analysis of whether such a transfer is feasible and whether any similar scheme exists.",
    },
    patternMatching: {
      targetQueries: [
        "Modi Rs 5000 transfer scam fake news",
        "PM Modi money transfer viral WhatsApp message",
      ],
      prioritySources: ["snopes.com", "altnews.in", "boomlive.in", "factcheck.org"],
      lookFor: "Existing fact-checks or debunks of this specific claim or similar money transfer claims.",
    },
  },
  falsificationCriteria: {
    whatWouldProveTrue: [
      "Official PMO press release announcing Rs 5000 direct transfer",
      "RBI circular implementing the transfer mechanism",
    ],
    whatWouldProveFalse: [
      "No PMO or government announcement matching this claim",
      "Fact-check organizations have debunked identical claims",
    ],
  },
  thinkingExcerpt: "This claim follows a common pattern of fabricated government welfare announcements. The specificity of Rs 5000 and the broad scope suggest viral misinformation.",
};

const CLASSIFIER_RESULT: ClassifierResult = {
  category: "factual_claim",
  extractedClaim: "PM Modi announced Rs 5000 direct transfer to all citizens",
  isCompound: false,
  domain: "geopolitics",
  language: "en",
  urgency: "high",
  reasoning: "This is a specific factual claim about a government policy announcement.",
};

describe("runStrategist", () => {
  let client: ClaudeClient;
  let mockCreate: Mock;

  beforeEach(() => {
    client = new ClaudeClient("test-api-key");
    mockCreate = vi.fn();
    (client._client.messages as unknown as { create: Mock }).create =
      mockCreate;
  });

  it("should return valid SearchStrategy", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Let me analyze this claim about Modi and Rs 5000 transfer...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: VALID_STRATEGY,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runStrategist(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
      CLASSIFIER_RESULT,
      client,
    );

    // Validate against Zod schema
    const parsed = SearchStrategySchema.safeParse(result.strategy);
    expect(parsed.success).toBe(true);

    expect(result.strategy.claimCharacteristics.type).toBe("authority_claim");
    expect(result.strategy.investigatorGuidance.sourceVerification.targetQueries.length).toBeGreaterThanOrEqual(2);
    expect(result.strategy.investigatorGuidance.domainExpertise.targetQueries.length).toBeGreaterThanOrEqual(2);
    expect(result.strategy.investigatorGuidance.patternMatching.targetQueries.length).toBeGreaterThanOrEqual(2);

    // Verify Opus model was used
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["model"]).toBe(MODELS.OPUS);
  });

  it("should include falsification criteria", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Analyzing the claim...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: VALID_STRATEGY,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runStrategist(
      "PM Modi announced Rs 5000 direct transfer",
      CLASSIFIER_RESULT,
      client,
    );

    expect(result.strategy.falsificationCriteria.whatWouldProveTrue.length).toBeGreaterThanOrEqual(1);
    expect(result.strategy.falsificationCriteria.whatWouldProveFalse.length).toBeGreaterThanOrEqual(1);
  });

  it("should generate queries for all 3 investigator roles", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Planning the investigation...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: VALID_STRATEGY,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runStrategist(
      "PM Modi announced Rs 5000 direct transfer",
      CLASSIFIER_RESULT,
      client,
    );

    const guidance = result.strategy.investigatorGuidance;
    expect(guidance.sourceVerification).toBeDefined();
    expect(guidance.sourceVerification.targetQueries.length).toBeGreaterThanOrEqual(2);
    expect(guidance.sourceVerification.prioritySources.length).toBeGreaterThan(0);
    expect(guidance.sourceVerification.lookFor).toBeTruthy();

    expect(guidance.domainExpertise).toBeDefined();
    expect(guidance.domainExpertise.targetQueries.length).toBeGreaterThanOrEqual(2);

    expect(guidance.patternMatching).toBeDefined();
    expect(guidance.patternMatching.targetQueries.length).toBeGreaterThanOrEqual(2);
  });

  it("should extract thinking excerpt", async () => {
    const thinkingText = "This is a detailed analysis of the claim. ".repeat(20); // Long thinking

    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: thinkingText,
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: {
            ...VALID_STRATEGY,
            thinkingExcerpt: "", // Will be overridden
          },
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runStrategist(
      "PM Modi announced Rs 5000 direct transfer",
      CLASSIFIER_RESULT,
      client,
    );

    // thinkingExcerpt should be populated (up to 500 chars)
    expect(result.strategy.thinkingExcerpt).toBeTruthy();
    expect(result.strategy.thinkingExcerpt.length).toBeLessThanOrEqual(500);
  });

  it("should use adaptive thinking with medium effort", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Thinking...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: VALID_STRATEGY,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    await runStrategist(
      "Some claim",
      CLASSIFIER_RESULT,
      client,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["thinking"]).toEqual({ type: "adaptive" });
    expect(callArgs["output_config"]).toEqual({ effort: "medium" });
  });

  it("should provide submit_strategy tool definition", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Thinking...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: VALID_STRATEGY,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    await runStrategist(
      "Some claim",
      CLASSIFIER_RESULT,
      client,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const tools = callArgs["tools"] as Array<{ name: string }>;
    expect(tools).toBeDefined();
    expect(tools.length).toBe(1);
    expect(tools[0]!.name).toBe("submit_strategy");
  });

  it("should return cost information", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Thinking...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: VALID_STRATEGY,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runStrategist(
      "Some claim",
      CLASSIFIER_RESULT,
      client,
    );

    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("should throw when no submit_strategy tool use in response", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Here is my strategy...",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    await expect(
      runStrategist("Some claim", CLASSIFIER_RESULT, client),
    ).rejects.toThrow();
  });

  it("should throw when tool output fails Zod validation", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Thinking...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_strategy",
          input: {
            claimCharacteristics: { type: "invalid_type" },
          },
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    await expect(
      runStrategist("Some claim", CLASSIFIER_RESULT, client),
    ).rejects.toThrow();
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should plan investigation for a health claim via real API",
      { timeout: 60_000 },
      async () => {
        const realClient = new ClaudeClient(apiKey!);

        const healthClassifierResult: ClassifierResult = {
          category: "factual_claim",
          extractedClaim: "WHO officially declared that green tea cures cancer",
          isCompound: false,
          domain: "public_health",
          language: "en",
          urgency: "high",
          reasoning: "Health claim about WHO making a medical declaration.",
        };

        const result = await runStrategist(
          "WHO officially declared that green tea cures cancer",
          healthClassifierResult,
          realClient,
        );

        // Validate against Zod schema
        const parsed = SearchStrategySchema.safeParse(result.strategy);
        expect(parsed.success).toBe(true);

        // Should have all 3 investigator roles
        expect(result.strategy.investigatorGuidance.sourceVerification.targetQueries.length).toBeGreaterThanOrEqual(2);
        expect(result.strategy.investigatorGuidance.domainExpertise.targetQueries.length).toBeGreaterThanOrEqual(2);
        expect(result.strategy.investigatorGuidance.patternMatching.targetQueries.length).toBeGreaterThanOrEqual(2);

        // Should have falsification criteria
        expect(result.strategy.falsificationCriteria.whatWouldProveTrue.length).toBeGreaterThanOrEqual(1);
        expect(result.strategy.falsificationCriteria.whatWouldProveFalse.length).toBeGreaterThanOrEqual(1);

        // Should have thinking excerpt
        expect(result.strategy.thinkingExcerpt).toBeTruthy();
        expect(result.strategy.thinkingExcerpt.length).toBeLessThanOrEqual(500);

        // Log cost for budget tracking
        console.info(
          `[QA] Strategist cost: $${result.costUsd.toFixed(6)}`,
        );
      },
    );
  });
});
