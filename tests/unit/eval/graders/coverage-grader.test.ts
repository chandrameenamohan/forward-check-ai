import { describe, it, expect } from "vitest";
import type { EvalClaim } from "../../../../eval/dataset.js";
import type { EvalTrialResult } from "../../../../eval/harness.js";
import { makeAgentReport } from "../../../fixtures/index.js";
import {
  gradeCoverage,
  aggregateCoverageScores,
  type CoverageGrade,
} from "../../../../eval/graders/coverage-grader.js";

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
                url: "https://pib.gov.in/factcheck/claim123",
                title: "PIB Fact Check",
                credibility: "high",
                relevantSnippet: "No Rs 5000 transfer scheme exists.",
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
                url: "https://www.altnews.in/factcheck-modi-5000",
                title: "Alt News Fact Check",
                credibility: "high",
                relevantSnippet: "This is a recurring WhatsApp forward with no basis.",
              },
              {
                url: "https://www.bbc.com/news/india-5000",
                title: "BBC News",
                credibility: "high",
                relevantSnippet: "No such announcement was made.",
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

// ── Tests ───────────────────────────────────────────────────────

describe("gradeCoverage", () => {
  it("should score 100 when all must-find sources present", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["pib.gov.in", "factcheck"],
    });
    const result = makeTrialResult({ claim });

    const grade = gradeCoverage(result, claim);

    expect(grade.mustFindTotal).toBe(2);
    expect(grade.mustFindHit).toBe(2);
    expect(grade.mustFindMissed).toEqual([]);
    // 2/2 * 70 = 70 + diversity bonus
    // 3 unique domains (pib.gov.in, altnews.in, bbc.com) → min(3/5, 1) = 0.6 → 0.6 * 30 = 18
    // Total = 70 + 18 = 88
    expect(grade.score).toBe(88);
    expect(grade.totalSourcesFound).toBe(3);
    expect(grade.uniqueDomains).toBe(3);
  });

  it("should score 0 when no must-find sources found", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["who.int", "reuters.com"],
    });
    const result = makeTrialResult({ claim });

    const grade = gradeCoverage(result, claim);

    expect(grade.mustFindTotal).toBe(2);
    expect(grade.mustFindHit).toBe(0);
    expect(grade.mustFindMissed).toEqual(["who.int", "reuters.com"]);
    // 0/2 * 70 = 0 + diversity bonus
    // 3 unique domains → min(3/5, 1) = 0.6 → 0.6 * 30 = 18
    expect(grade.score).toBe(18);
  });

  it("should list missed sources", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["pib.gov.in", "reuters.com", "who.int"],
    });
    const result = makeTrialResult({ claim });

    const grade = gradeCoverage(result, claim);

    expect(grade.mustFindHit).toBe(1);
    expect(grade.mustFindMissed).toEqual(["reuters.com", "who.int"]);
  });

  it("should return null score for claims without mustFindSources", () => {
    const claim = makeEvalClaim({
      mustFindSources: undefined,
    });
    const result = makeTrialResult({ claim });

    const grade = gradeCoverage(result, claim);

    expect(grade.score).toBeNull();
    expect(grade.mustFindTotal).toBe(0);
    expect(grade.mustFindHit).toBe(0);
    expect(grade.mustFindMissed).toEqual([]);
  });

  it("should match URL substrings case-insensitively", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["PIB.GOV.IN"],
    });
    const result = makeTrialResult({ claim });

    const grade = gradeCoverage(result, claim);

    expect(grade.mustFindHit).toBe(1);
    expect(grade.mustFindMissed).toEqual([]);
  });

  it("should handle no agent reports gracefully", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["pib.gov.in"],
    });
    const result = makeTrialResult({ claim, agentReports: undefined });

    const grade = gradeCoverage(result, claim);

    expect(grade.mustFindHit).toBe(0);
    expect(grade.mustFindMissed).toEqual(["pib.gov.in"]);
    expect(grade.totalSourcesFound).toBe(0);
    expect(grade.uniqueDomains).toBe(0);
    // 0/1 * 70 = 0 + 0/5 * 30 = 0
    expect(grade.score).toBe(0);
  });

  it("should handle empty agent reports gracefully", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["pib.gov.in"],
    });
    const result = makeTrialResult({ claim, agentReports: [] });

    const grade = gradeCoverage(result, claim);

    expect(grade.mustFindHit).toBe(0);
    expect(grade.totalSourcesFound).toBe(0);
    expect(grade.score).toBe(0);
  });

  it("should cap diversity bonus at 5 domains", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["pib.gov.in"],
    });
    const result = makeTrialResult({
      claim,
      agentReports: [
        makeAgentReport({
          findings: [
            {
              claim: "Finding 1",
              assessment: "contradicted",
              confidence: 80,
              sources: [
                { url: "https://pib.gov.in/check", title: "PIB", credibility: "high", relevantSnippet: "s1" },
                { url: "https://bbc.com/news", title: "BBC", credibility: "high", relevantSnippet: "s2" },
                { url: "https://reuters.com/fact", title: "Reuters", credibility: "high", relevantSnippet: "s3" },
              ],
            },
            {
              claim: "Finding 2",
              assessment: "contradicted",
              confidence: 80,
              sources: [
                { url: "https://who.int/check", title: "WHO", credibility: "high", relevantSnippet: "s4" },
                { url: "https://snopes.com/fact", title: "Snopes", credibility: "high", relevantSnippet: "s5" },
                { url: "https://nytimes.com/article", title: "NYT", credibility: "high", relevantSnippet: "s6" },
              ],
            },
          ],
        }),
      ],
    });

    const grade = gradeCoverage(result, claim);

    expect(grade.uniqueDomains).toBe(6);
    // mustFind: 1/1 * 70 = 70 + diversity: min(6/5, 1) = 1 * 30 = 30
    expect(grade.score).toBe(100);
  });

  it("should deduplicate source URLs across agents", () => {
    const claim = makeEvalClaim({
      mustFindSources: ["pib.gov.in"],
    });
    const result = makeTrialResult({
      claim,
      agentReports: [
        makeAgentReport({
          findings: [
            {
              claim: "Finding A",
              assessment: "contradicted",
              confidence: 80,
              sources: [
                { url: "https://pib.gov.in/factcheck", title: "PIB", credibility: "high", relevantSnippet: "s" },
              ],
            },
          ],
        }),
        makeAgentReport({
          findings: [
            {
              claim: "Finding B",
              assessment: "contradicted",
              confidence: 80,
              sources: [
                { url: "https://pib.gov.in/factcheck", title: "PIB", credibility: "high", relevantSnippet: "s" },
              ],
            },
          ],
        }),
      ],
    });

    const grade = gradeCoverage(result, claim);

    expect(grade.totalSourcesFound).toBe(1);
    expect(grade.uniqueDomains).toBe(1);
  });
});

describe("aggregateCoverageScores", () => {
  it("should compute average coverage metrics excluding null scores", () => {
    const grades: CoverageGrade[] = [
      {
        mustFindTotal: 2,
        mustFindHit: 2,
        mustFindMissed: [],
        totalSourcesFound: 5,
        uniqueDomains: 4,
        score: 86,
      },
      {
        mustFindTotal: 3,
        mustFindHit: 1,
        mustFindMissed: ["source-a", "source-b"],
        totalSourcesFound: 3,
        uniqueDomains: 2,
        score: 35,
      },
      {
        mustFindTotal: 0,
        mustFindHit: 0,
        mustFindMissed: [],
        totalSourcesFound: 4,
        uniqueDomains: 3,
        score: null,
      },
    ];

    const aggregate = aggregateCoverageScores(grades);

    // Only first 2 grades count (third has null score)
    expect(aggregate.avgScore).toBeCloseTo(60.5, 1);
    // (2/2 + 1/3) / 2 = (1 + 0.333) / 2 = 0.667 → 66.7%
    expect(aggregate.avgMustFindHitRate).toBeCloseTo(66.7, 0);
    // (4 + 2) / 2 = 3
    expect(aggregate.avgUniqueDomains).toBeCloseTo(3, 0);
  });

  it("should handle empty grades array", () => {
    const aggregate = aggregateCoverageScores([]);

    expect(aggregate.avgScore).toBe(0);
    expect(aggregate.avgMustFindHitRate).toBe(0);
    expect(aggregate.avgUniqueDomains).toBe(0);
  });

  it("should handle all null scores", () => {
    const grades: CoverageGrade[] = [
      {
        mustFindTotal: 0,
        mustFindHit: 0,
        mustFindMissed: [],
        totalSourcesFound: 2,
        uniqueDomains: 2,
        score: null,
      },
    ];

    const aggregate = aggregateCoverageScores(grades);

    expect(aggregate.avgScore).toBe(0);
    expect(aggregate.avgMustFindHitRate).toBe(0);
    expect(aggregate.avgUniqueDomains).toBe(0);
  });
});
