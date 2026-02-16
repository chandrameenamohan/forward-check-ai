import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalTrialResult } from "../../../../eval/harness.js";
import type { EvalClaim } from "../../../../eval/dataset.js";
import { makeFinalVerdict, makeAgentReport, makeClassifierResult } from "../../../fixtures/index.js";
import {
  gradeGroundedness,
  aggregateGroundednessScores,
  type GroundednessGrade,
} from "../../../../eval/graders/groundedness-grader.js";
import { ClaudeClient } from "../../../../src/services/claude-client.js";

// ── Helper: create a minimal eval claim ─────────────────────────

function makeEvalClaim(overrides?: Partial<EvalClaim>): EvalClaim {
  return {
    id: "false-001",
    claim: "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024",
    expectedCategory: "likely-false",
    expectedClassifierRoute: "factual_claim",
    acceptableCategories: ["likely-false", "unverified"],
    expectedConfidenceRange: [0, 29],
    difficulty: "easy",
    tags: ["economics", "india", "zombie-claim"],
    notes: "Recurring WhatsApp forward.",
    mustFindSources: ["pib.gov.in", "factcheck"],
    harmWeight: 2,
    ...overrides,
  };
}

// ── Helper: create a minimal trial result ───────────────────────

function makeTrialResult(overrides?: Partial<EvalTrialResult>): EvalTrialResult {
  return {
    claimId: "false-001",
    claim: makeEvalClaim(),
    verdict: makeFinalVerdict({
      category: "likely-false",
      confidence: 15,
      keyFindings: [
        "No official PIB announcement exists for Rs 5000 transfer",
        "The claim has been debunked by multiple fact-checkers",
      ],
      sources: [
        { url: "https://pib.gov.in/factcheck", title: "PIB Fact Check", relevance: "Primary" },
        { url: "https://example.com/debunk", title: "Debunk Article", relevance: "Secondary" },
      ],
      reasoning: "The claim is false based on investigator evidence from PIB and fact-checkers.",
    }),
    agentReports: [
      makeAgentReport({
        agentRole: "source_verification",
        findings: [
          {
            claim: "No official announcement found",
            assessment: "contradicted",
            confidence: 85,
            sources: [
              {
                url: "https://pib.gov.in/factcheck",
                title: "PIB Fact Check",
                credibility: "high",
                relevantSnippet: "The government has not announced any Rs 5000 transfer.",
              },
            ],
          },
        ],
      }),
      makeAgentReport({
        agentRole: "pattern_matching",
        findings: [
          {
            claim: "Claim debunked by fact-checkers",
            assessment: "contradicted",
            confidence: 90,
            sources: [
              {
                url: "https://example.com/debunk",
                title: "Debunk Article",
                credibility: "high",
                relevantSnippet: "This is a recurring WhatsApp forward with no basis.",
              },
            ],
          },
        ],
      }),
    ],
    costUsd: 0.55,
    durationMs: 5000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Mock ClaudeClient ───────────────────────────────────────────

function makeMockClient(responseJson: Record<string, unknown>): ClaudeClient {
  const client = new ClaudeClient("fake-key");
  const mockCreate = vi.fn().mockResolvedValue({
    id: "msg-test",
    type: "message",
    role: "assistant",
    model: "claude-sonnet-4-5-20250929",
    content: [{ type: "text", text: JSON.stringify(responseJson) }],
    stop_reason: "end_turn",
    usage: { input_tokens: 500, output_tokens: 100 },
  });
  client._client.messages.create = mockCreate;
  return client;
}

// ── Tests ───────────────────────────────────────────────────────

describe("gradeGroundedness", () => {
  it("should return valid GroundednessGrade for grounded verdict", async () => {
    const client = makeMockClient({
      keyFindingsGrounded: 2,
      keyFindingsUngrounded: [],
      sourcesTraceable: 2,
      reasoning: "All findings trace back to investigator evidence.",
    });

    const result = makeTrialResult();
    const grade = await gradeGroundedness(result, client);

    expect(grade.keyFindingsTotal).toBe(2);
    expect(grade.keyFindingsGrounded).toBe(2);
    expect(grade.keyFindingsUngrounded).toEqual([]);
    expect(grade.sourcesInVerdict).toBe(2);
    expect(grade.sourcesTraceable).toBe(2);
    expect(grade.score).toBe(100);
    expect(grade.reasoning).toBe("All findings trace back to investigator evidence.");
  });

  it("should detect ungrounded key findings", async () => {
    const client = makeMockClient({
      keyFindingsGrounded: 1,
      keyFindingsUngrounded: ["The claim has been debunked by multiple fact-checkers"],
      sourcesTraceable: 1,
      reasoning: "One finding is not grounded in investigator evidence.",
    });

    const result = makeTrialResult();
    const grade = await gradeGroundedness(result, client);

    expect(grade.keyFindingsTotal).toBe(2);
    expect(grade.keyFindingsGrounded).toBe(1);
    expect(grade.keyFindingsUngrounded).toEqual([
      "The claim has been debunked by multiple fact-checkers",
    ]);
    expect(grade.sourcesInVerdict).toBe(2);
    expect(grade.sourcesTraceable).toBe(1);
    expect(grade.score).toBeLessThan(100);
    expect(grade.score).toBeGreaterThan(0);
  });

  it("should skip for non-factual claims", async () => {
    const client = makeMockClient({});

    const result = makeTrialResult({
      verdict: undefined,
      nonFactualResponse: "Hi! I'm ForwardCheck.",
      agentReports: undefined,
      classifierResult: makeClassifierResult({ category: "greeting" }),
    });

    const grade = await gradeGroundedness(result, client);

    expect(grade.score).toBe(-1);
    expect(grade.reasoning).toContain("non-factual");
    // Should NOT have called the Sonnet API
    expect(client._client.messages.create).not.toHaveBeenCalled();
  });

  it("should return score 0 when Sonnet response fails to parse", async () => {
    const client = new ClaudeClient("fake-key");
    const mockCreate = vi.fn().mockResolvedValue({
      id: "msg-test",
      type: "message",
      role: "assistant",
      model: "claude-sonnet-4-5-20250929",
      content: [{ type: "text", text: "This is not valid JSON at all" }],
      stop_reason: "end_turn",
      usage: { input_tokens: 500, output_tokens: 100 },
    });
    client._client.messages.create = mockCreate;

    const result = makeTrialResult();
    const grade = await gradeGroundedness(result, client);

    expect(grade.score).toBe(0);
    expect(grade.reasoning).toContain("parse");
  });

  it("should return score 0 when verdict is missing (pipeline error)", async () => {
    const client = makeMockClient({});

    const result = makeTrialResult({
      verdict: undefined,
      error: "Pipeline crashed",
      agentReports: [makeAgentReport()],
    });

    const grade = await gradeGroundedness(result, client);

    expect(grade.score).toBe(0);
    expect(grade.reasoning).toContain("verdict");
    expect(client._client.messages.create).not.toHaveBeenCalled();
  });

  it("should return score 0 when agent reports are missing", async () => {
    const client = makeMockClient({});

    const result = makeTrialResult({
      agentReports: undefined,
    });

    const grade = await gradeGroundedness(result, client);

    expect(grade.score).toBe(0);
    expect(grade.reasoning).toContain("agent reports");
    expect(client._client.messages.create).not.toHaveBeenCalled();
  });

  it("should handle empty key findings in verdict", async () => {
    const client = makeMockClient({
      keyFindingsGrounded: 0,
      keyFindingsUngrounded: [],
      sourcesTraceable: 1,
      reasoning: "No key findings to evaluate.",
    });

    const result = makeTrialResult({
      verdict: makeFinalVerdict({
        keyFindings: [],
        sources: [{ url: "https://example.com", title: "Source", relevance: "Primary" }],
      }),
    });

    const grade = await gradeGroundedness(result, client);

    expect(grade.keyFindingsTotal).toBe(0);
    expect(grade.sourcesInVerdict).toBe(1);
  });
});

describe("aggregateGroundednessScores", () => {
  it("should compute average groundedness metrics", () => {
    const grades: GroundednessGrade[] = [
      {
        keyFindingsTotal: 3,
        keyFindingsGrounded: 3,
        keyFindingsUngrounded: [],
        sourcesInVerdict: 2,
        sourcesTraceable: 2,
        score: 100,
        reasoning: "All grounded",
      },
      {
        keyFindingsTotal: 4,
        keyFindingsGrounded: 2,
        keyFindingsUngrounded: ["finding A", "finding B"],
        sourcesInVerdict: 3,
        sourcesTraceable: 1,
        score: 50,
        reasoning: "Partially grounded",
      },
    ];

    const aggregate = aggregateGroundednessScores(grades);

    // Grade 1: 3/3 = 100%, Grade 2: 2/4 = 50% → avg = 75%
    expect(aggregate.avgGroundedFindings).toBeCloseTo(75, 0);
    // Grade 1: 2/2 = 100%, Grade 2: 1/3 = 33.3% → avg = 66.7%
    expect(aggregate.avgTraceableSources).toBeCloseTo(66.7, 0);
    expect(aggregate.avgScore).toBe(75);
  });

  it("should handle empty grades array", () => {
    const aggregate = aggregateGroundednessScores([]);

    expect(aggregate.avgGroundedFindings).toBe(0);
    expect(aggregate.avgTraceableSources).toBe(0);
    expect(aggregate.avgScore).toBe(0);
  });

  it("should exclude non-factual skips (score -1) from aggregation", () => {
    const grades: GroundednessGrade[] = [
      {
        keyFindingsTotal: 2,
        keyFindingsGrounded: 2,
        keyFindingsUngrounded: [],
        sourcesInVerdict: 2,
        sourcesTraceable: 2,
        score: 100,
        reasoning: "All grounded",
      },
      {
        keyFindingsTotal: 0,
        keyFindingsGrounded: 0,
        keyFindingsUngrounded: [],
        sourcesInVerdict: 0,
        sourcesTraceable: 0,
        score: -1,
        reasoning: "Skipped: non-factual claim",
      },
    ];

    const aggregate = aggregateGroundednessScores(grades);

    // Only the first grade counts
    expect(aggregate.avgScore).toBe(100);
    expect(aggregate.avgGroundedFindings).toBe(100);
  });
});
