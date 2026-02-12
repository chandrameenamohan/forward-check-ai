import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { AgentReportSchema } from "../../../../src/schemas/agent-report.js";
import { ToolRegistry } from "../../../../src/tools/tool-registry.js";
import { braveSearchToolDefinition } from "../../../../src/tools/brave-search.js";
import { runDomainExpertise } from "../../../../src/agents/investigators/domain-expertise-agent.js";
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
  agentRole: "domain_expertise" as const,
  summary: "The claim about WHO declaring green tea cures cancer is not supported by medical literature.",
  findings: [
    {
      claim: "WHO officially declares green tea cures cancer",
      assessment: "contradicted" as const,
      confidence: 90,
      sources: [
        {
          url: "https://www.who.int/news-room/fact-sheets/detail/cancer",
          title: "WHO Cancer Fact Sheet",
          credibility: "high" as const,
          relevantSnippet: "WHO has not made any declaration that green tea cures cancer.",
        },
      ],
    },
  ],
  manipulationIndicators: ["misleading_health_claim", "authority_impersonation"],
  overallAssessment: "The claim is contradicted by authoritative medical sources. WHO has made no such declaration.",
  confidenceScore: 88,
};

const SEARCH_STRATEGY: SearchStrategy = {
  claimCharacteristics: {
    type: "scientific_claim",
    suspectedPattern: "authority_impersonation",
    verifiabilityAssessment: "Can be verified by checking WHO official statements and medical literature.",
  },
  investigatorGuidance: {
    sourceVerification: {
      targetQueries: [
        "WHO green tea cancer cure announcement",
        "WHO official statements green tea",
      ],
      prioritySources: ["who.int", "reuters.com"],
      lookFor: "Official WHO press releases or statements.",
    },
    domainExpertise: {
      targetQueries: [
        "green tea cancer prevention medical research",
        "WHO cancer treatment guidelines 2024",
      ],
      prioritySources: ["who.int", "pubmed.ncbi.nlm.nih.gov", "thelancet.com"],
      lookFor: "Peer-reviewed studies on green tea and cancer outcomes, official WHO cancer treatment guidelines.",
    },
    patternMatching: {
      targetQueries: [
        "green tea cures cancer fake news",
        "WHO green tea viral claim",
      ],
      prioritySources: ["snopes.com", "factcheck.org"],
      lookFor: "Existing debunks of this claim.",
    },
  },
  falsificationCriteria: {
    whatWouldProveTrue: ["Official WHO statement declaring green tea as cancer cure"],
    whatWouldProveFalse: ["No WHO statement on green tea curing cancer"],
  },
  thinkingExcerpt: "This claim impersonates WHO authority for a health claim.",
};

function createMockToolRegistry(): ToolRegistry {
  const registry = new ToolRegistry();
  registry.register(
    "brave_web_search",
    async () =>
      JSON.stringify({
        results: [
          {
            title: "WHO Cancer Fact Sheet",
            url: "https://www.who.int/news-room/fact-sheets/detail/cancer",
            description: "WHO provides evidence-based cancer prevention and treatment guidelines.",
            age: "1 week ago",
          },
        ],
      }),
    braveSearchToolDefinition,
  );
  return registry;
}

describe("runDomainExpertise", () => {
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

  it("should return valid AgentReport with domain_expertise role", async () => {
    // Turn 1: model calls brave_web_search
    const searchResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "brave_web_search",
          input: { query: "green tea cancer prevention medical research" },
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

    const result = await runDomainExpertise(
      "WHO officially declares green tea cures cancer",
      "public_health",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // Validate against Zod schema
    const parsed = AgentReportSchema.safeParse(result.report);
    expect(parsed.success).toBe(true);

    expect(result.report.agentRole).toBe("domain_expertise");
    expect(result.report.confidenceScore).toBeGreaterThanOrEqual(0);
    expect(result.report.confidenceScore).toBeLessThanOrEqual(100);
    expect(result.report.summary).toBeTruthy();
    expect(result.report.findings.length).toBeGreaterThan(0);

    // Verify Sonnet model was used
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["model"]).toBe(MODELS.SONNET);
  });

  it("should use domain-specific system prompt", async () => {
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

    await runDomainExpertise(
      "WHO officially declares green tea cures cancer",
      "public_health",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const system = callArgs["system"] as string;

    // Should contain domain-specific language for public_health
    expect(system).toContain("public_health");
    // Should contain the guidance from search strategy
    expect(system).toContain("pubmed.ncbi.nlm.nih.gov");
    expect(system).toContain("Peer-reviewed studies");
  });

  it("should use different system prompt for geopolitics domain", async () => {
    const geopoliticsReport = {
      ...VALID_REPORT,
      summary: "Analysis of geopolitical claim.",
    };

    const reportResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_report",
          input: geopoliticsReport,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(reportResponse);
    mockCreate.mockResolvedValueOnce(END_TURN_RESPONSE);

    await runDomainExpertise(
      "Some geopolitics claim",
      "geopolitics",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const system = callArgs["system"] as string;

    // Should contain geopolitics-specific framing
    expect(system).toContain("geopolitics");
  });

  it("should respect 4-turn limit", async () => {
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
            name: "brave_web_search",
            input: { query: "search query 2" },
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
            input: { query: "search query 3" },
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
            name: "submit_report",
            input: VALID_REPORT,
          },
        ],
        stop_reason: "tool_use",
      }),
    ); // turn 4 — maxTurns reached, loop exits

    const result = await runDomainExpertise(
      "WHO officially declares green tea cures cancer",
      "public_health",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // Should have called API exactly 4 times (maxTurns)
    expect(mockCreate.mock.calls.length).toBe(4);
    expect(result.report.agentRole).toBe("domain_expertise");
  });

  it("should only provide brave_web_search and submit_report tools", async () => {
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

    await runDomainExpertise(
      "Some claim",
      "public_health",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const tools = callArgs["tools"] as Array<{ name: string }>;
    expect(tools).toBeDefined();

    const toolNames = tools.map((t) => t.name);
    expect(toolNames).toContain("brave_web_search");
    expect(toolNames).toContain("submit_report");
    // Domain expertise uses only brave_web_search, not google_fact_check_search
    expect(toolNames).not.toContain("google_fact_check_search");
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

    const result = await runDomainExpertise(
      "Some claim",
      "public_health",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    expect(result.costUsd).toBeGreaterThan(0);
  });

  it("should fall back to text parsing when submit_report not called", async () => {
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

    mockCreate.mockResolvedValueOnce(textResponse);

    const result = await runDomainExpertise(
      "Some claim",
      "public_health",
      SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    expect(result.report.agentRole).toBe("domain_expertise");
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should investigate a health claim via real API",
      { timeout: 120_000 },
      async () => {
        const realClient = new ClaudeClient(apiKey!);

        // Use mock search tools but real Claude
        const mockRegistry = createMockToolRegistry();

        const result = await runDomainExpertise(
          "WHO officially declares green tea cures cancer",
          "public_health",
          SEARCH_STRATEGY,
          realClient,
          mockRegistry,
        );

        // Validate against Zod schema
        const parsed = AgentReportSchema.safeParse(result.report);
        expect(parsed.success).toBe(true);

        // Check role
        expect(result.report.agentRole).toBe("domain_expertise");

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
          `[QA] Domain Expertise cost: $${result.costUsd.toFixed(6)}`,
        );
      },
    );
  });
});
