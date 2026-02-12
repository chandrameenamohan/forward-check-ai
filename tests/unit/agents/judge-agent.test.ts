import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { FinalVerdictSchema, type FinalVerdict } from "../../../src/schemas/final-verdict.js";
import type { AgentReport } from "../../../src/schemas/agent-report.js";
import type { ChallengeReport } from "../../../src/schemas/challenge-report.js";
import type { SearchStrategy } from "../../../src/schemas/search-strategy.js";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";
import { runJudge } from "../../../src/agents/judge-agent.js";

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
      input_tokens: 8000,
      output_tokens: 2500,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
}

const VALID_FINAL_VERDICT: FinalVerdict = {
  category: "likely-false",
  nuanceTag: "fabricated",
  confidence: 12,
  confidenceDecomposition: {
    evidenceStrength: 85,
    sourceReliability: 80,
    claimComplexity: 70,
    counterArgumentResilience: 90,
  },
  summary:
    "This claim about PM Modi announcing Rs 5000 direct transfer is fabricated. No official government source, press release, or budget allocation supports it. Multiple fact-checkers have identified it as a recurring scam message.",
  reasoning:
    "All three investigator reports converge on the same conclusion: no official evidence exists. The Source Verification agent found no PIB press release. The Domain Expert confirmed no budget allocation. The Pattern Matcher found multiple fact-checker debunks. The Devil's Advocate attempted to argue for the claim but failed to find any credible pathway to its truth.",
  manipulationTechniques: [
    {
      technique: "Authority Impersonation",
      description: "Uses the Prime Minister's name to lend false credibility.",
      evidenceQuote: "PM Modi announced",
      severity: 85,
    },
    {
      technique: "Appeal to Greed",
      description: "Promises free money to incentivize sharing.",
      evidenceQuote: "Rs 5000 direct transfer to all citizens",
      severity: 75,
    },
  ],
  keyFindings: [
    "No official PMO press release found",
    "No RBI circular implementing transfer mechanism",
    "Multiple fact-checkers have debunked similar claims since 2019",
  ],
  sources: [
    {
      url: "https://pib.gov.in",
      title: "Press Information Bureau",
      relevance: "Official government press release database",
    },
    {
      url: "https://altnews.in/fact-check",
      title: "AltNews Fact Check",
      relevance: "Debunked similar viral messages",
    },
  ],
  whatWouldChangeMyMind:
    "An official PMO press release or RBI circular announcing this specific scheme would change this verdict.",
  falsificationCriteria: {
    whatWouldProveTrue: ["Official PMO press release announcing Rs 5000 direct transfer"],
    whatWouldProveFalse: ["No official documentation exists"],
  },
  devilsAdvocateOutcome: "counter_argument_failed",
  deepReasoningActivated: false,
  thinkingSummary:
    "After reviewing all evidence, I find the investigator consensus overwhelming. The claim has no official backing and matches a known scam pattern.",
};

const SAMPLE_AGENT_REPORTS: AgentReport[] = [
  {
    agentRole: "source_verification",
    summary: "No credible sources found supporting the claim.",
    findings: [
      {
        claim: "PM Modi announced Rs 5000 direct transfer",
        assessment: "contradicted",
        confidence: 15,
        sources: [
          {
            url: "https://pib.gov.in",
            title: "PIB Official",
            credibility: "high",
            relevantSnippet: "No such announcement found in official records.",
          },
        ],
      },
    ],
    manipulationIndicators: ["authority_impersonation", "appeal_to_greed"],
    overallAssessment: "Claim appears fabricated with no official backing.",
    confidenceScore: 12,
  },
  {
    agentRole: "domain_expertise",
    summary: "Economic analysis shows this claim is implausible.",
    findings: [
      {
        claim: "Rs 5000 direct transfer to all citizens",
        assessment: "contradicted",
        confidence: 18,
        sources: [
          {
            url: "https://rbi.org.in",
            title: "RBI Statistics",
            credibility: "high",
            relevantSnippet: "No new DBT scheme announced in this period.",
          },
        ],
      },
    ],
    overallAssessment: "The fiscal impact would be enormous and no budget allocation exists.",
    confidenceScore: 15,
  },
  {
    agentRole: "pattern_matching",
    summary: "Multiple fact-checkers have debunked similar claims.",
    findings: [
      {
        claim: "Modi Rs 5000 transfer viral message",
        assessment: "contradicted",
        confidence: 10,
        sources: [
          {
            url: "https://altnews.in/fact-check",
            title: "AltNews Fact Check",
            credibility: "high",
            relevantSnippet: "This is a recurring scam message that has been debunked multiple times.",
          },
        ],
      },
    ],
    manipulationIndicators: ["zombie_claim", "chain_message_format"],
    overallAssessment: "Classic zombie claim pattern, recycled with updated dates.",
    confidenceScore: 8,
  },
];

const SAMPLE_CHALLENGE_REPORT: ChallengeReport = {
  challenges: [
    {
      targetAgent: "source_verification",
      claim: "No official government press release found",
      challenge: "Absence of evidence is not evidence of absence.",
      severity: "moderate",
      evidence: "Government announcements are sometimes made through regional channels.",
    },
  ],
  overallAssessment:
    "The counter-argument fails. The investigator consensus is robust.",
  suggestedConfidenceAdjustment: -5,
  counterArgumentSucceeded: false,
  counterArgumentSummary:
    "I attempted to construct arguments defending this claim but could not find any credible pathway.",
  thinkingExcerpt:
    "Let me attempt to build the strongest possible case FOR this claim being true...",
};

const SAMPLE_SEARCH_STRATEGY: SearchStrategy = {
  claimCharacteristics: {
    type: "authority_claim",
    suspectedPattern: "authority_impersonation",
    verifiabilityAssessment: "Highly verifiable — official government announcements leave a clear paper trail.",
  },
  investigatorGuidance: {
    sourceVerification: {
      targetQueries: ["PM Modi Rs 5000 transfer official announcement", "PIB press release direct transfer"],
      prioritySources: ["pib.gov.in", "india.gov.in"],
      lookFor: "Official government press releases or PMO statements",
    },
    domainExpertise: {
      targetQueries: ["India direct benefit transfer budget 2024", "PM-KISAN scheme latest update"],
      prioritySources: ["rbi.org.in", "finmin.nic.in"],
      lookFor: "Budget allocations and existing DBT scheme details",
    },
    patternMatching: {
      targetQueries: ["PM Modi Rs 5000 fact check", "Modi free money scam viral"],
      prioritySources: ["altnews.in", "boomlive.in", "snopes.com"],
      lookFor: "Previous debunks of similar viral messages",
    },
  },
  falsificationCriteria: {
    whatWouldProveTrue: ["Official PMO press release announcing Rs 5000 direct transfer"],
    whatWouldProveFalse: ["No official documentation from PMO or Finance Ministry"],
  },
  thinkingExcerpt: "This claim has characteristics of a typical authority impersonation scam...",
};

describe("runJudge", () => {
  let client: ClaudeClient;
  let mockCreate: Mock;
  let toolRegistry: ToolRegistry;

  beforeEach(() => {
    client = new ClaudeClient("test-api-key");
    mockCreate = vi.fn();
    (client._client.messages as unknown as { create: Mock }).create =
      mockCreate;

    toolRegistry = new ToolRegistry();
    toolRegistry.register(
      "brave_web_search",
      async () => JSON.stringify({ results: [] }),
      {
        name: "brave_web_search",
        description: "Search the web",
        input_schema: {
          type: "object" as const,
          properties: {
            query: { type: "string" as const },
          },
          required: ["query"],
        },
      },
    );
  });

  it("should return valid FinalVerdict", async () => {
    // Judge calls submit_verdict tool
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "After reviewing all evidence, the investigator consensus is overwhelming...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_verdict",
          input: VALID_FINAL_VERDICT,
        },
      ],
      stop_reason: "tool_use",
    });

    // After submit_verdict tool result, model ends turn
    const endTurnResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Verdict submitted.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);
    mockCreate.mockResolvedValueOnce(endTurnResponse);

    const result = await runJudge(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_CHALLENGE_REPORT,
      SAMPLE_SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // Validate against Zod schema
    const parsed = FinalVerdictSchema.safeParse(result.verdict);
    expect(parsed.success).toBe(true);

    expect(result.verdict.category).toBe("likely-false");
    expect(result.verdict.manipulationTechniques.length).toBeGreaterThan(0);
    expect(result.verdict.keyFindings.length).toBeGreaterThan(0);
    expect(result.verdict.sources.length).toBeGreaterThan(0);
    expect(result.costUsd).toBeGreaterThan(0);

    // Verify Opus model was used
    expect(mockCreate).toHaveBeenCalled();
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["model"]).toBe(MODELS.OPUS);
  });

  it("should include confidence decomposition with 4 components", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Analyzing evidence strength, source reliability...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_verdict",
          input: VALID_FINAL_VERDICT,
        },
      ],
      stop_reason: "tool_use",
    });

    const endTurnResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Done.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);
    mockCreate.mockResolvedValueOnce(endTurnResponse);

    const result = await runJudge(
      "Some claim",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_CHALLENGE_REPORT,
      SAMPLE_SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    const decomp = result.verdict.confidenceDecomposition;
    expect(decomp.evidenceStrength).toBeGreaterThanOrEqual(0);
    expect(decomp.evidenceStrength).toBeLessThanOrEqual(100);
    expect(decomp.sourceReliability).toBeGreaterThanOrEqual(0);
    expect(decomp.sourceReliability).toBeLessThanOrEqual(100);
    expect(decomp.claimComplexity).toBeGreaterThanOrEqual(0);
    expect(decomp.claimComplexity).toBeLessThanOrEqual(100);
    expect(decomp.counterArgumentResilience).toBeGreaterThanOrEqual(0);
    expect(decomp.counterArgumentResilience).toBeLessThanOrEqual(100);
  });

  it("should include thinking summary", async () => {
    const thinkingText = "I must carefully weigh all the evidence from investigators. ".repeat(20);

    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: thinkingText,
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_verdict",
          input: {
            ...VALID_FINAL_VERDICT,
            thinkingSummary: "", // Will be overridden
          },
        },
      ],
      stop_reason: "tool_use",
    });

    const endTurnResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Done.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);
    mockCreate.mockResolvedValueOnce(endTurnResponse);

    const result = await runJudge(
      "Some claim",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_CHALLENGE_REPORT,
      SAMPLE_SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // thinkingSummary should be populated from the actual thinking block
    expect(result.verdict.thinkingSummary).toBeTruthy();
    expect(result.verdict.thinkingSummary).toContain("carefully weigh");
  });

  it("should produce verdict with correct category for high confidence", async () => {
    const highConfidenceVerdict: FinalVerdict = {
      ...VALID_FINAL_VERDICT,
      category: "likely-true",
      confidence: 92,
      confidenceDecomposition: {
        evidenceStrength: 95,
        sourceReliability: 90,
        claimComplexity: 85,
        counterArgumentResilience: 95,
      },
      devilsAdvocateOutcome: "counter_argument_failed",
    };

    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Strong evidence from all sources...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_verdict",
          input: highConfidenceVerdict,
        },
      ],
      stop_reason: "tool_use",
    });

    const endTurnResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Done.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);
    mockCreate.mockResolvedValueOnce(endTurnResponse);

    const result = await runJudge(
      "Chandrayaan-3 landed on the Moon's south pole in August 2023",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_CHALLENGE_REPORT,
      SAMPLE_SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    expect(result.verdict.category).toBe("likely-true");
    expect(result.verdict.confidence).toBe(92);
  });

  it("should use adaptive thinking with max effort", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Analyzing...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_verdict",
          input: VALID_FINAL_VERDICT,
        },
      ],
      stop_reason: "tool_use",
    });

    const endTurnResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Done.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);
    mockCreate.mockResolvedValueOnce(endTurnResponse);

    await runJudge(
      "Some claim",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_CHALLENGE_REPORT,
      SAMPLE_SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["thinking"]).toEqual({ type: "adaptive" });
    expect(callArgs["output_config"]).toEqual({ effort: "max" });
  });

  it("should handle Judge using brave_web_search for verification", async () => {
    // Judge first calls brave_web_search to verify a contested point
    const searchResponse = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "I need to verify this contested point independently...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_search",
          name: "brave_web_search",
          input: { query: "PM Modi Rs 5000 official announcement 2024" },
        },
      ],
      stop_reason: "tool_use",
    });

    // Then Judge submits the verdict
    const verdictResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_verdict",
          name: "submit_verdict",
          input: VALID_FINAL_VERDICT,
        },
      ],
      stop_reason: "tool_use",
    });

    const endTurnResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Verdict submitted.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(searchResponse);
    mockCreate.mockResolvedValueOnce(verdictResponse);
    mockCreate.mockResolvedValueOnce(endTurnResponse);

    const result = await runJudge(
      "PM Modi announced Rs 5000 direct transfer",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_CHALLENGE_REPORT,
      SAMPLE_SEARCH_STRATEGY,
      client,
      toolRegistry,
    );

    // Should still produce a valid verdict
    const parsed = FinalVerdictSchema.safeParse(result.verdict);
    expect(parsed.success).toBe(true);

    // Should have made more than 1 API call (search + verdict + end_turn)
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });

  it("should throw when no submit_verdict tool use in response", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Here is my verdict...",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    await expect(
      runJudge(
        "Some claim",
        SAMPLE_AGENT_REPORTS,
        SAMPLE_CHALLENGE_REPORT,
        SAMPLE_SEARCH_STRATEGY,
        client,
        toolRegistry,
      ),
    ).rejects.toThrow("Judge did not call submit_verdict tool");
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
          name: "submit_verdict",
          input: {
            category: "invalid_category",
            confidence: 200,
          },
        },
      ],
      stop_reason: "tool_use",
    });

    const endTurnResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Done.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);
    mockCreate.mockResolvedValueOnce(endTurnResponse);

    await expect(
      runJudge(
        "Some claim",
        SAMPLE_AGENT_REPORTS,
        SAMPLE_CHALLENGE_REPORT,
        SAMPLE_SEARCH_STRATEGY,
        client,
        toolRegistry,
      ),
    ).rejects.toThrow();
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should render verdict for a complete investigation via real API",
      { timeout: 180_000 },
      async () => {
        const realClient = new ClaudeClient(apiKey!);

        // Use a real tool registry with mock search results
        const realToolRegistry = new ToolRegistry();
        realToolRegistry.register(
          "brave_web_search",
          async () =>
            JSON.stringify({
              results: [
                {
                  title: "Fact Check: PM Modi Rs 5000 transfer claim is false",
                  url: "https://altnews.in/fact-check-pm-modi-rs-5000",
                  description: "This viral message claiming PM Modi announced Rs 5000 direct transfer has been debunked multiple times since 2019.",
                  age: "2024-01-15",
                },
                {
                  title: "PIB Fact Check",
                  url: "https://pib.gov.in/fact-check",
                  description: "No such scheme announced by the government.",
                  age: "2024-02-01",
                },
              ],
            }),
          {
            name: "brave_web_search",
            description: "Search the web using Brave Search",
            input_schema: {
              type: "object" as const,
              properties: {
                query: { type: "string" as const },
              },
              required: ["query"],
            },
          },
        );

        const result = await runJudge(
          "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024",
          SAMPLE_AGENT_REPORTS,
          SAMPLE_CHALLENGE_REPORT,
          SAMPLE_SEARCH_STRATEGY,
          realClient,
          realToolRegistry,
        );

        // Validate against Zod schema
        const parsed = FinalVerdictSchema.safeParse(result.verdict);
        expect(parsed.success).toBe(true);

        // Should have a verdict category
        expect(result.verdict.category).toBeTruthy();

        // Should have confidence decomposition
        expect(result.verdict.confidenceDecomposition).toBeTruthy();
        expect(result.verdict.confidenceDecomposition.evidenceStrength).toBeGreaterThanOrEqual(0);
        expect(result.verdict.confidenceDecomposition.sourceReliability).toBeGreaterThanOrEqual(0);
        expect(result.verdict.confidenceDecomposition.claimComplexity).toBeGreaterThanOrEqual(0);
        expect(result.verdict.confidenceDecomposition.counterArgumentResilience).toBeGreaterThanOrEqual(0);

        // Should have a thinking summary
        expect(result.verdict.thinkingSummary).toBeTruthy();

        // Should have manipulation techniques
        expect(result.verdict.manipulationTechniques).toBeTruthy();

        // Should have key findings
        expect(result.verdict.keyFindings.length).toBeGreaterThan(0);

        // Should have DA outcome
        expect(result.verdict.devilsAdvocateOutcome).toBeTruthy();

        // Confidence should be in valid range
        expect(result.verdict.confidence).toBeGreaterThanOrEqual(0);
        expect(result.verdict.confidence).toBeLessThanOrEqual(100);

        // Log cost for budget tracking
        console.info(
          `[QA] Judge cost: $${result.costUsd.toFixed(6)}`,
        );
      },
    );
  });
});
