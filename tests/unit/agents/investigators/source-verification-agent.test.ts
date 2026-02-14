import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { AgentReportSchema } from "../../../../src/schemas/agent-report.js";
import { ToolRegistry } from "../../../../src/tools/tool-registry.js";
import { braveSearchToolDefinition } from "../../../../src/tools/brave-search.js";
import { googleFactCheckToolDefinition } from "../../../../src/tools/google-factcheck.js";
import { runSourceVerification } from "../../../../src/agents/investigators/source-verification-agent.js";
import type { SearchStrategy } from "../../../../src/schemas/search-strategy.js";

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
    model: MODELS.SONNET,
    stop_sequence: null,
    usage: {
      input_tokens: 1500,
      output_tokens: 600,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
}

/** End-turn response used after tool_use responses to terminate the agent loop */
const END_TURN_RESPONSE = buildMockMessage({
  content: [
    {
      type: "text" as const,
      text: "Report submitted.",
      citations: null,
    },
  ],
  stop_reason: "end_turn",
});

const VALID_REPORT = {
  agentRole: "source_verification" as const,
  summary: "The claim about PM Modi announcing Rs 5000 transfer could not be verified through official sources.",
  findings: [
    {
      claim: "PM Modi announced Rs 5000 direct transfer",
      assessment: "contradicted" as const,
      confidence: 85,
      sources: [
        {
          url: "https://pib.gov.in/PressReleasePage.aspx?PRID=12345",
          title: "PIB Fact Check",
          credibility: "high" as const,
          relevantSnippet: "No such announcement was made by the Prime Minister.",
        },
      ],
    },
  ],
  manipulationIndicators: ["fabricated_government_announcement"],
  overallAssessment: "The claim is likely fabricated. No official government source confirms this announcement.",
  confidenceScore: 82,
};

const SEARCH_STRATEGY: SearchStrategy = {
  claimCharacteristics: {
    type: "authority_claim",
    suspectedPattern: "fabrication",
    verifiabilityAssessment: "Can be verified by checking official government announcements.",
  },
  investigatorGuidance: {
    sourceVerification: {
      targetQueries: [
        "Modi Rs 5000 direct transfer announcement 2024",
        "PMO official announcement direct benefit transfer",
      ],
      prioritySources: ["pmo.gov.in", "pib.gov.in", "reuters.com"],
      lookFor: "Official government press releases or PMO announcements confirming or denying this specific transfer scheme.",
    },
    domainExpertise: {
      targetQueries: [
        "India direct benefit transfer scheme 2024",
        "Modi government welfare scheme Rs 5000",
      ],
      prioritySources: ["rbi.org.in", "economictimes.com"],
      lookFor: "Economic analysis.",
    },
    patternMatching: {
      targetQueries: [
        "Modi Rs 5000 transfer scam fake news",
        "PM Modi money transfer viral WhatsApp",
      ],
      prioritySources: ["snopes.com", "altnews.in"],
      lookFor: "Existing debunks.",
    },
  },
  falsificationCriteria: {
    whatWouldProveTrue: ["Official PMO press release announcing Rs 5000 direct transfer"],
    whatWouldProveFalse: ["No PMO or government announcement matching this claim"],
  },
  thinkingExcerpt: "This claim follows a common fabrication pattern.",
};

function createMockToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    "brave_web_search",
    async () =>
      JSON.stringify({
        results: [
          {
            title: "PIB Fact Check: No Rs 5000 Transfer Scheme",
            url: "https://pib.gov.in/factcheck",
            description: "The claim about PM Modi announcing Rs 5000 transfer is false.",
            age: "2 days ago",
          },
        ],
      }),
    braveSearchToolDefinition,
  );
  registry.register(
    "google_fact_check_search",
    async () =>
      JSON.stringify({
        claims: [
          {
            text: "Modi Rs 5000 transfer",
            claimant: "Social media",
            claimReviewMarkup: {
              url: "https://altnews.in/modi-5000-transfer-false",
              title: "False: PM Modi Did Not Announce Rs 5000 Transfer",
              publisher: "AltNews",
              rating: "False",
            },
          },
        ],
      }),
    googleFactCheckToolDefinition,
  );
  return registry;
}

describe("runSourceVerification", () => {
  let client: ClaudeClient;
  let mockCreate: Mock;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    client = new ClaudeClient("test-api-key");
    mockCreate = vi.fn();
    (client._client.messages as unknown as { create: Mock }).create =
      mockCreate;
    toolRegistry = createMockToolRegistry();
  });

  it("should return valid AgentReport with source_verification role", async () => {
    // Turn 1: model calls brave_web_search
    const searchResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "brave_web_search",
          input: { query: "Modi Rs 5000 direct transfer announcement 2024" },
        },
      ],
      stop_reason: "tool_use",
    });

    // Turn 2: model submits report
    const reportResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_02",
          name: "submit_report",
          input: VALID_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(searchResponse);
    mockCreate.mockResolvedValueOnce(reportResponse);
    mockCreate.mockResolvedValueOnce(END_TURN_RESPONSE);

    const result = await runSourceVerification(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // Validate against Zod schema
    const parsed = AgentReportSchema.safeParse(result.report);
    expect(parsed.success).toBe(true);

    expect(result.report.agentRole).toBe("source_verification");
    expect(result.report.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.report.confidenceScore).toBeLessThanOrEqual(100);
    expect(result.report.summary).toBeTruthy();
    expect(result.report.findings.length).toBeGreaterThan(0);

    // Verify Sonnet model was used
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["model"]).toBe(MODELS.SONNET);
  });

  it("should use search strategy queries", async () => {
    // Turn 1: model calls search
    const searchResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "brave_web_search",
          input: { query: "Modi Rs 5000 direct transfer announcement 2024" },
        },
      ],
      stop_reason: "tool_use",
    });

    // Turn 2: model submits report
    const reportResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_02",
          name: "submit_report",
          input: VALID_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(searchResponse);
    mockCreate.mockResolvedValueOnce(reportResponse);
    mockCreate.mockResolvedValueOnce(END_TURN_RESPONSE);

    await runSourceVerification(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // System prompt should include guidance from search strategy
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const system = callArgs["system"] as string;
    expect(system).toContain("pmo.gov.in");
    expect(system).toContain("pib.gov.in");
    expect(system).toContain("Official government press releases");
  });

  it("should respect 6-turn limit", async () => {
    // Simulate model calling tools for all 6 turns (maxTurns)
    // The loop stops after maxTurns regardless of stop_reason
    mockCreate.mockResolvedValueOnce(
      buildMockMessage({
        content: [
          {
            type: "tool_use" as const,
            id: "toolu_01",
            name: "brave_web_search",
            input: { query: "search query 1" },
          },
        ],
        stop_reason: "tool_use",
      }),
    ); // turn 1
    mockCreate.mockResolvedValueOnce(
      buildMockMessage({
        content: [
          {
            type: "tool_use" as const,
            id: "toolu_02",
            name: "google_fact_check_search",
            input: { query: "fact check query" },
          },
        ],
        stop_reason: "tool_use",
      }),
    ); // turn 2
    mockCreate.mockResolvedValueOnce(
      buildMockMessage({
        content: [
          {
            type: "tool_use" as const,
            id: "toolu_03",
            name: "brave_web_search",
            input: { query: "follow up query" },
          },
        ],
        stop_reason: "tool_use",
      }),
    ); // turn 3
    mockCreate.mockResolvedValueOnce(
      buildMockMessage({
        content: [
          {
            type: "tool_use" as const,
            id: "toolu_04",
            name: "brave_web_search",
            input: { query: "additional query" },
          },
        ],
        stop_reason: "tool_use",
      }),
    ); // turn 4
    mockCreate.mockResolvedValueOnce(
      buildMockMessage({
        content: [
          {
            type: "tool_use" as const,
            id: "toolu_05",
            name: "google_fact_check_search",
            input: { query: "another fact check" },
          },
        ],
        stop_reason: "tool_use",
      }),
    ); // turn 5
    mockCreate.mockResolvedValueOnce(
      buildMockMessage({
        content: [
          {
            type: "tool_use" as const,
            id: "toolu_06",
            name: "submit_report",
            input: VALID_REPORT,
          },
        ],
        stop_reason: "tool_use",
      }),
    ); // turn 6 — maxTurns reached, loop exits

    const result = await runSourceVerification(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // Should have called API exactly 6 times (maxTurns)
    expect(mockCreate.mock.calls.length).toBe(6);
    expect(result.report.agentRole).toBe("source_verification");
  });

  it("should provide both brave_web_search and google_fact_check_search tools", async () => {
    // Single turn: model submits report immediately
    const reportResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_report",
          input: VALID_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(reportResponse);
    mockCreate.mockResolvedValueOnce(END_TURN_RESPONSE);

    await runSourceVerification(
      "Some claim",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const tools = callArgs["tools"] as Array<{ name: string }>;
    expect(tools).toBeDefined();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("brave_web_search");
    expect(toolNames).toContain("google_fact_check_search");
    expect(toolNames).toContain("submit_report");
  });

  it("should return cost information", async () => {
    const reportResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_report",
          input: VALID_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(reportResponse);
    mockCreate.mockResolvedValueOnce(END_TURN_RESPONSE);

    const result = await runSourceVerification(
      "Some claim",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("should fall back to text parsing when submit_report not called", async () => {
    // Turn 1: model returns text instead of using submit_report tool
    const textResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: JSON.stringify(VALID_REPORT),
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    // Retry: model still returns text instead of calling submit_report
    const retryTextResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "I already provided my report above.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(textResponse);
    mockCreate.mockResolvedValueOnce(retryTextResponse);

    const result = await runSourceVerification(
      "Some claim",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    expect(result.report.agentRole).toBe("source_verification");
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should investigate a known false claim via real API",
      { timeout: 120_000 },
      async () => {
        const realClient = new ClaudeClient(apiKey!);

        // Use mock search tools (not real API keys) but real Claude
        const mockRegistry = createMockToolRegistry();

        const result = await runSourceVerification(
          "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024",
          SEARCH_STRATEGY,
          realClient,
          mockRegistry,
        );

        // Validate against Zod schema
        const parsed = AgentReportSchema.safeParse(result.report);
        expect(parsed.success).toBe(true);

        // Check role
        expect(result.report.agentRole).toBe("source_verification");

        // Should have findings
        expect(result.report.findings.length).toBeGreaterThan(0);

        // Should have summary and overall assessment
        expect(result.report.summary).toBeTruthy();
        expect(result.report.overallAssessment).toBeTruthy();

        // Confidence should be valid
        expect(result.report.confidenceScore).toBeGreaterThanOrEqual(0);
        expect(result.report.confidenceScore).toBeLessThanOrEqual(100);

        // Log cost for budget tracking
        console.info(
          `[QA] Source Verification cost: $${result.costUsd.toFixed(6)}`,
        );
      },
    );
  });
});
