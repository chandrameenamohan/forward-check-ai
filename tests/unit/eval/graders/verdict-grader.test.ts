import { describe, it, expect } from "vitest";
import type { EvalClaim } from "../../../../eval/dataset.js";
import type { EvalTrialResult } from "../../../../eval/harness.js";
import { makeFinalVerdict, makeClassifierResult } from "../../../fixtures/index.js";
import { gradeVerdict, aggregateVerdictScores } from "../../../../eval/graders/verdict-grader.js";
import type { VerdictGrade } from "../../../../eval/graders/verdict-grader.js";

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
    verdict: makeFinalVerdict({ category: "likely-false", confidence: 15 }),
    costUsd: 0.55,
    durationMs: 5000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("gradeVerdict", () => {
  it("should score 100 for exact category and confidence match", () => {
    const claim = makeEvalClaim({
      expectedCategory: "likely-false",
      acceptableCategories: ["likely-false", "unverified"],
      expectedConfidenceRange: [0, 29],
      harmWeight: 1,
    });
    const result = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "likely-false",
        confidence: 15,
        keyFindings: ["Finding 1", "Finding 2"],
        sources: [{ url: "https://example.com", title: "Source", relevance: "Primary" }],
      }),
    });

    const grade = gradeVerdict(result, claim);

    expect(grade.categoryCorrect).toBe(true);
    expect(grade.categoryAcceptable).toBe(true);
    expect(grade.confidenceInRange).toBe(true);
    expect(grade.rawScore).toBe(100);
    expect(grade.harmWeight).toBe(1);
    expect(grade.weightedScore).toBe(100);
    expect(grade.maxWeightedScore).toBe(100);
  });

  it("should score 80 for acceptable category with correct confidence", () => {
    const claim = makeEvalClaim({
      expectedCategory: "likely-false",
      acceptableCategories: ["likely-false", "unverified"],
      expectedConfidenceRange: [0, 29],
      harmWeight: 1,
    });
    const result = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "unverified",
        confidence: 25,
        keyFindings: ["Finding 1"],
        sources: [{ url: "https://example.com", title: "Source", relevance: "Primary" }],
      }),
    });

    const grade = gradeVerdict(result, claim);

    expect(grade.categoryCorrect).toBe(false);
    expect(grade.categoryAcceptable).toBe(true);
    expect(grade.confidenceInRange).toBe(true);
    // 30 (acceptable) + 30 (confidence) + 10 (key findings) + 10 (sources) = 80
    expect(grade.rawScore).toBe(80);
  });

  it("should score 0 for wrong category", () => {
    const claim = makeEvalClaim({
      expectedCategory: "likely-false",
      acceptableCategories: ["likely-false", "unverified"],
      expectedConfidenceRange: [0, 29],
      harmWeight: 1,
    });
    const result = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "likely-true",
        confidence: 90,
        keyFindings: ["Finding 1"],
        sources: [{ url: "https://example.com", title: "Source", relevance: "Primary" }],
      }),
    });

    const grade = gradeVerdict(result, claim);

    expect(grade.categoryCorrect).toBe(false);
    expect(grade.categoryAcceptable).toBe(false);
    expect(grade.confidenceInRange).toBe(false);
    // 0 (category) + 0 (confidence) + 10 (key findings) + 10 (sources) = 20
    expect(grade.rawScore).toBe(20);
  });

  it("should apply harm weighting correctly", () => {
    const claim = makeEvalClaim({
      expectedCategory: "likely-false",
      acceptableCategories: ["likely-false"],
      expectedConfidenceRange: [0, 29],
      harmWeight: 3,
    });
    const result = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "likely-false",
        confidence: 15,
        keyFindings: ["Finding 1"],
        sources: [{ url: "https://example.com", title: "Source", relevance: "Primary" }],
      }),
    });

    const grade = gradeVerdict(result, claim);

    expect(grade.harmWeight).toBe(3);
    expect(grade.rawScore).toBe(100);
    expect(grade.weightedScore).toBe(300); // 100 * 3
    expect(grade.maxWeightedScore).toBe(300); // 100 * 3
  });

  it("should score 100 for non-factual short circuit", () => {
    const claim = makeEvalClaim({
      id: "nonfactual-001",
      claim: "Hello! How are you doing today?",
      expectedCategory: "opinion",
      expectedClassifierRoute: "greeting",
      acceptableCategories: ["opinion"],
      expectedConfidenceRange: [0, 100],
      harmWeight: 1,
    });
    const result = makeTrialResult({
      claimId: "nonfactual-001",
      claim,
      verdict: undefined,
      nonFactualResponse: "Hi! I'm ForwardCheck.",
      classifierResult: makeClassifierResult({ category: "greeting" }),
    });

    const grade = gradeVerdict(result, claim);

    expect(grade.rawScore).toBe(100);
    expect(grade.categoryCorrect).toBe(true);
    expect(grade.weightedScore).toBe(100);
  });

  it("should score 0 for pipeline error (no verdict)", () => {
    const claim = makeEvalClaim({
      expectedCategory: "likely-false",
      harmWeight: 2,
    });
    const result = makeTrialResult({
      claim,
      verdict: undefined,
      error: "Pipeline crashed",
    });

    const grade = gradeVerdict(result, claim);

    expect(grade.rawScore).toBe(0);
    expect(grade.weightedScore).toBe(0);
    expect(grade.maxWeightedScore).toBe(200);
  });

  it("should award 10 points for key findings on factual claims", () => {
    const claim = makeEvalClaim({
      expectedCategory: "likely-false",
      acceptableCategories: ["likely-false"],
      expectedConfidenceRange: [0, 29],
      harmWeight: 1,
    });
    const resultWithFindings = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "likely-false",
        confidence: 15,
        keyFindings: ["Finding 1"],
        sources: [],
      }),
    });
    const resultWithoutFindings = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "likely-false",
        confidence: 15,
        keyFindings: [],
        sources: [],
      }),
    });

    const gradeWith = gradeVerdict(resultWithFindings, claim);
    const gradeWithout = gradeVerdict(resultWithoutFindings, claim);

    expect(gradeWith.rawScore - gradeWithout.rawScore).toBe(10);
  });

  it("should award 10 points for sources on factual claims", () => {
    const claim = makeEvalClaim({
      expectedCategory: "likely-false",
      acceptableCategories: ["likely-false"],
      expectedConfidenceRange: [0, 29],
      harmWeight: 1,
    });
    const resultWithSources = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "likely-false",
        confidence: 15,
        keyFindings: [],
        sources: [{ url: "https://example.com", title: "Source", relevance: "Primary" }],
      }),
    });
    const resultWithoutSources = makeTrialResult({
      claim,
      verdict: makeFinalVerdict({
        category: "likely-false",
        confidence: 15,
        keyFindings: [],
        sources: [],
      }),
    });

    const gradeWith = gradeVerdict(resultWithSources, claim);
    const gradeWithout = gradeVerdict(resultWithoutSources, claim);

    expect(gradeWith.rawScore - gradeWithout.rawScore).toBe(10);
  });

  it("should handle non-factual wrong route (classifier misroute)", () => {
    const claim = makeEvalClaim({
      id: "nonfactual-001",
      claim: "Hello! How are you doing today?",
      expectedCategory: "opinion",
      expectedClassifierRoute: "greeting",
      acceptableCategories: ["opinion"],
      expectedConfidenceRange: [0, 100],
      harmWeight: 1,
    });
    // Pipeline ran a full investigation instead of short-circuiting
    const result = makeTrialResult({
      claimId: "nonfactual-001",
      claim,
      verdict: makeFinalVerdict({ category: "likely-true", confidence: 80 }),
      nonFactualResponse: undefined,
      classifierResult: makeClassifierResult({ category: "factual_claim" }),
    });

    const grade = gradeVerdict(result, claim);

    // Wrong route — the classifier should have caught this, but it didn't
    expect(grade.categoryCorrect).toBe(false);
    expect(grade.rawScore).toBeLessThan(100);
  });
});

describe("aggregateVerdictScores", () => {
  it("should compute harm-weighted accuracy", () => {
    const grades: VerdictGrade[] = [
      {
        categoryCorrect: true,
        categoryAcceptable: true,
        confidenceInRange: true,
        harmWeight: 1,
        rawScore: 100,
        weightedScore: 100,
        maxWeightedScore: 100,
      },
      {
        categoryCorrect: false,
        categoryAcceptable: false,
        confidenceInRange: false,
        harmWeight: 3,
        rawScore: 0,
        weightedScore: 0,
        maxWeightedScore: 300,
      },
    ];

    const aggregate = aggregateVerdictScores(grades);

    // 100 / (100 + 300) = 25%
    expect(aggregate.harmWeightedAccuracy).toBeCloseTo(25, 1);
    expect(aggregate.exactMatchRate).toBeCloseTo(50, 1);
    expect(aggregate.acceptableMatchRate).toBeCloseTo(50, 1);
  });

  it("should handle empty grades array", () => {
    const aggregate = aggregateVerdictScores([]);

    expect(aggregate.harmWeightedAccuracy).toBe(0);
    expect(aggregate.exactMatchRate).toBe(0);
    expect(aggregate.acceptableMatchRate).toBe(0);
  });
});
