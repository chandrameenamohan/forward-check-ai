import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { ChallengeReportSchema, type ChallengeReport } from "../../../src/schemas/challenge-report.js";
import type { AgentReport } from "../../../src/schemas/agent-report.js";
import { runDevilsAdvocate } from "../../../src/agents/devils-advocate-agent.js";

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
      input_tokens: 6000,
      output_tokens: 1500,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
}

const VALID_CHALLENGE_REPORT: ChallengeReport = {
  challenges: [
    {
      targetAgent: "source_verification",
      claim: "No official government press release found",
      challenge: "Absence of evidence is not evidence of absence — the announcement could have been made through state-level channels or party-specific media not covered by mainstream press.",
      severity: "moderate",
      evidence: "Government announcements in India are sometimes made through regional press conferences before appearing on official websites.",
    },
    {
      targetAgent: "domain_expertise",
      claim: "Similar schemes have been debunked before",
      challenge: "While previous schemes were debunked, the government has legitimately introduced new direct transfer schemes in the past, so pattern matching alone is insufficient.",
      severity: "minor",
      evidence: "PM-KISAN and other DBT schemes were real government programs.",
    },
  ],
  overallAssessment:
    "The counter-argument fails. While there are theoretical possibilities that the claim could be true, the complete absence of any official documentation, combined with existing fact-checks debunking similar claims, provides overwhelming evidence that this is fabricated.",
  suggestedConfidenceAdjustment: -5,
  counterArgumentSucceeded: false,
  counterArgumentSummary:
    "I attempted to construct arguments defending this claim but could not find any credible pathway to its truth. The investigator consensus is robust.",
  thinkingExcerpt:
    "Let me attempt to build the strongest possible case FOR this claim being true. The primary angle would be that the announcement was made through non-traditional channels...",
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

const SAMPLE_FALSIFICATION_CRITERIA = [
  "Official PMO press release announcing Rs 5000 direct transfer",
  "RBI circular implementing the transfer mechanism",
];

describe("runDevilsAdvocate", () => {
  let client: ClaudeClient;
  let mockCreate: Mock;

  beforeEach(() => {
    client = new ClaudeClient("test-api-key");
    mockCreate = vi.fn();
    (client._client.messages as unknown as { create: Mock }).create =
      mockCreate;
  });

  it("should return valid ChallengeReport", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Let me attempt to build the strongest possible case FOR this claim being true...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_challenge",
          input: VALID_CHALLENGE_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runDevilsAdvocate(
      "PM Modi announced Rs 5000 direct transfer to all citizens",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_FALSIFICATION_CRITERIA,
      client,
    );

    // Validate against Zod schema
    const parsed = ChallengeReportSchema.safeParse(result.report);
    expect(parsed.success).toBe(true);

    expect(result.report.challenges.length).toBeGreaterThan(0);
    expect(result.report.overallAssessment).toBeTruthy();
    expect(result.report.counterArgumentSummary).toBeTruthy();
    expect(typeof result.report.counterArgumentSucceeded).toBe("boolean");
    expect(result.costUsd).toBeGreaterThan(0);

    // Verify Opus model was used
    expect(mockCreate).toHaveBeenCalledTimes(1);
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["model"]).toBe(MODELS.OPUS);
  });

  it("should include thinking excerpt", async () => {
    const thinkingText = "I need to find weaknesses in the investigator consensus. ".repeat(20);

    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: thinkingText,
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_challenge",
          input: {
            ...VALID_CHALLENGE_REPORT,
            thinkingExcerpt: "", // Will be overridden
          },
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runDevilsAdvocate(
      "PM Modi announced Rs 5000 direct transfer",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_FALSIFICATION_CRITERIA,
      client,
    );

    // thinkingExcerpt should be populated from the actual thinking block (up to 500 chars)
    expect(result.report.thinkingExcerpt).toBeTruthy();
    expect(result.report.thinkingExcerpt.length).toBeLessThanOrEqual(500);
    expect(result.report.thinkingExcerpt).toContain("find weaknesses");
  });

  it("should set counterArgumentSucceeded to boolean", async () => {
    const reportWithSuccess = {
      ...VALID_CHALLENGE_REPORT,
      counterArgumentSucceeded: true,
      overallAssessment: "The counter-argument succeeded — investigators missed critical evidence.",
      suggestedConfidenceAdjustment: 20,
    };

    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Analyzing the reports...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_challenge",
          input: reportWithSuccess,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    const result = await runDevilsAdvocate(
      "Some claim",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_FALSIFICATION_CRITERIA,
      client,
    );

    expect(result.report.counterArgumentSucceeded).toBe(true);
    expect(result.report.suggestedConfidenceAdjustment).toBe(20);
  });

  it("should accept effort level parameter", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Deep analysis...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_challenge",
          input: VALID_CHALLENGE_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    await runDevilsAdvocate(
      "Some claim",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_FALSIFICATION_CRITERIA,
      client,
      "max",
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["thinking"]).toEqual({ type: "adaptive" });
    expect(callArgs["output_config"]).toEqual({ effort: "max" });
  });

  it("should use high effort by default", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Thinking...",
        },
        {
          type: "tool_use" as const,
          id: "toolu_01",
          name: "submit_challenge",
          input: VALID_CHALLENGE_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    await runDevilsAdvocate(
      "Some claim",
      SAMPLE_AGENT_REPORTS,
      SAMPLE_FALSIFICATION_CRITERIA,
      client,
    );

    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    expect(callArgs["output_config"]).toEqual({ effort: "high" });
  });

  it("should throw when no submit_challenge tool use in response", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Here is my analysis...",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    await expect(
      runDevilsAdvocate(
        "Some claim",
        SAMPLE_AGENT_REPORTS,
        SAMPLE_FALSIFICATION_CRITERIA,
        client,
      ),
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
          name: "submit_challenge",
          input: {
            challenges: "not an array",
            counterArgumentSucceeded: "not a boolean",
          },
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(response);

    await expect(
      runDevilsAdvocate(
        "Some claim",
        SAMPLE_AGENT_REPORTS,
        SAMPLE_FALSIFICATION_CRITERIA,
        client,
      ),
    ).rejects.toThrow();
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should challenge a clear false claim via real API",
      { timeout: 120_000 },
      async () => {
        const realClient = new ClaudeClient(apiKey!);

        const result = await runDevilsAdvocate(
          "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024",
          SAMPLE_AGENT_REPORTS,
          SAMPLE_FALSIFICATION_CRITERIA,
          realClient,
        );

        // Validate against Zod schema
        const parsed = ChallengeReportSchema.safeParse(result.report);
        expect(parsed.success).toBe(true);

        // Should have at least one challenge
        expect(result.report.challenges.length).toBeGreaterThan(0);

        // Should have a definitive counterArgumentSucceeded field
        expect(typeof result.report.counterArgumentSucceeded).toBe("boolean");

        // For a clear false claim, counter-argument should likely fail
        // (but we don't enforce this — the model decides)

        // Should have thinking excerpt
        expect(result.report.thinkingExcerpt).toBeTruthy();
        expect(result.report.thinkingExcerpt.length).toBeLessThanOrEqual(500);

        // Should have overall assessment
        expect(result.report.overallAssessment).toBeTruthy();

        // Confidence adjustment should be within range
        expect(result.report.suggestedConfidenceAdjustment).toBeGreaterThanOrEqual(-30);
        expect(result.report.suggestedConfidenceAdjustment).toBeLessThanOrEqual(30);

        // Log cost for budget tracking
        console.info(
          `[QA] Devil's Advocate cost: $${result.costUsd.toFixed(6)}`,
        );
      },
    );
  });
});
