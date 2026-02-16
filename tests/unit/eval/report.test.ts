import { describe, it, expect } from "vitest";
import {
  makeClassifierResult,
  makeFinalVerdict,
  makeSearchStrategy,
  makeAgentReport,
  makeChallengeReport,
} from "../../fixtures/index.js";
import type { EvalClaim } from "../../../eval/dataset.js";
import type { EvalTrialResult } from "../../../eval/harness.js";
import type { EvalResult } from "../../../eval/run-eval.js";
import type { VerdictGrade } from "../../../eval/graders/verdict-grader.js";
import type { CoverageGrade } from "../../../eval/graders/coverage-grader.js";
import type { GroundednessGrade } from "../../../eval/graders/groundedness-grader.js";

import {
  generateSummaryString,
  generateMarkdownReport,
} from "../../../eval/report.js";

// ── Helpers ──────────────────────────────────────────────────────

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

function makeTrialResult(overrides?: Partial<EvalTrialResult>): EvalTrialResult {
  return {
    claimId: "false-001",
    claim: makeEvalClaim(),
    classifierResult: makeClassifierResult(),
    searchStrategy: makeSearchStrategy(),
    agentReports: [
      makeAgentReport({ agentRole: "source_verification" }),
      makeAgentReport({ agentRole: "domain_expertise" }),
    ],
    challengeReport: makeChallengeReport(),
    verdict: makeFinalVerdict({ category: "likely-false", confidence: 15 }),
    costUsd: 0.55,
    durationMs: 5000,
    timestamp: new Date().toISOString(),
    ...overrides,
  };
}

function makeVerdictGrade(overrides?: Partial<VerdictGrade>): VerdictGrade {
  return {
    categoryCorrect: true,
    categoryAcceptable: true,
    confidenceInRange: true,
    harmWeight: 2,
    rawScore: 100,
    weightedScore: 200,
    maxWeightedScore: 200,
    ...overrides,
  };
}

function makeCoverageGrade(overrides?: Partial<CoverageGrade>): CoverageGrade {
  return {
    mustFindTotal: 2,
    mustFindHit: 2,
    mustFindMissed: [],
    totalSourcesFound: 5,
    uniqueDomains: 4,
    score: 94,
    ...overrides,
  };
}

function makeGroundednessGrade(overrides?: Partial<GroundednessGrade>): GroundednessGrade {
  return {
    keyFindingsTotal: 3,
    keyFindingsGrounded: 3,
    keyFindingsUngrounded: [],
    sourcesInVerdict: 2,
    sourcesTraceable: 2,
    score: 100,
    reasoning: "All grounded",
    ...overrides,
  };
}

function makeEvalResult(overrides?: Partial<EvalResult>): EvalResult {
  return {
    trialResults: [makeTrialResult()],
    verdictGrades: [makeVerdictGrade()],
    verdictAggregate: {
      harmWeightedAccuracy: 72.3,
      exactMatchRate: 60.0,
      acceptableMatchRate: 80.0,
    },
    groundednessGrades: [makeGroundednessGrade()],
    groundednessAggregate: {
      avgGroundedFindings: 78.5,
      avgTraceableSources: 83.2,
      avgScore: 80.0,
    },
    coverageGrades: [makeCoverageGrade()],
    coverageAggregate: {
      avgScore: 80.0,
      avgMustFindHitRate: 58.3,
      avgUniqueDomains: 3.2,
    },
    totalCostUsd: 1.23,
    totalDurationMs: 45000,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────

describe("generateSummaryString", () => {
  it("should generate summary string with all metrics", () => {
    const result = makeEvalResult();
    const summary = generateSummaryString(result, { mode: "mock" });

    // Header
    expect(summary).toContain("ForwardCheck-AI");
    expect(summary).toContain("Eval Results");
    expect(summary).toContain("Mode: mock");
    expect(summary).toContain("Claims: 1");
    expect(summary).toContain("$1.23");

    // Verdict accuracy
    expect(summary).toContain("VERDICT ACCURACY");
    expect(summary).toContain("72.3%");
    expect(summary).toContain("60.0%");
    expect(summary).toContain("80.0%");

    // Groundedness
    expect(summary).toContain("GROUNDEDNESS");
    expect(summary).toContain("78.5%");
    expect(summary).toContain("83.2%");

    // Coverage
    expect(summary).toContain("COVERAGE");
    expect(summary).toContain("58.3%");
    expect(summary).toContain("3.2");
  });

  it("should omit groundedness section when aggregate is null", () => {
    const result = makeEvalResult({
      groundednessAggregate: null,
      groundednessGrades: [],
    });
    const summary = generateSummaryString(result, { mode: "mock" });

    expect(summary).not.toContain("GROUNDEDNESS");
  });

  it("should list failures sorted by harm weight", () => {
    const trial1 = makeTrialResult({
      claimId: "false-003",
      claim: makeEvalClaim({
        id: "false-003",
        expectedCategory: "likely-false",
        harmWeight: 3,
      }),
      verdict: makeFinalVerdict({ category: "unverified", confidence: 45 }),
    });

    const trial2 = makeTrialResult({
      claimId: "partial-001",
      claim: makeEvalClaim({
        id: "partial-001",
        expectedCategory: "partially-true",
        harmWeight: 2,
      }),
      verdict: makeFinalVerdict({ category: "likely-true", confidence: 90 }),
    });

    const grade1 = makeVerdictGrade({
      categoryCorrect: false,
      categoryAcceptable: false,
      harmWeight: 3,
    });

    const grade2 = makeVerdictGrade({
      categoryCorrect: false,
      categoryAcceptable: false,
      harmWeight: 2,
    });

    const result = makeEvalResult({
      trialResults: [trial1, trial2],
      verdictGrades: [grade1, grade2],
    });

    const summary = generateSummaryString(result, { mode: "mock" });

    expect(summary).toContain("FAILURES");
    expect(summary).toContain("false-003");
    expect(summary).toContain("partial-001");

    // harm:3 should appear before harm:2
    const idx3 = summary.indexOf("false-003");
    const idx2 = summary.indexOf("partial-001");
    expect(idx3).toBeLessThan(idx2);
  });

  it("should not include FAILURES section when all claims pass", () => {
    const result = makeEvalResult();
    const summary = generateSummaryString(result, { mode: "mock" });

    expect(summary).not.toContain("FAILURES");
  });
});

describe("generateMarkdownReport", () => {
  it("should generate valid markdown report", () => {
    const result = makeEvalResult();
    const md = generateMarkdownReport(result, { mode: "mock" });

    // Title
    expect(md).toContain("# ForwardCheck-AI — Eval Report");

    // Config section
    expect(md).toContain("**Mode:** mock");

    // Summary metrics
    expect(md).toContain("Verdict Accuracy");
    expect(md).toContain("72.3%");

    // Per-claim table
    expect(md).toContain("| ID |");
    expect(md).toContain("false-001");

    // Groundedness section
    expect(md).toContain("Groundedness");
    expect(md).toContain("78.5%");

    // Coverage section
    expect(md).toContain("Coverage");
    expect(md).toContain("58.3%");
  });

  it("should include failures section with details", () => {
    const trial = makeTrialResult({
      claimId: "false-003",
      claim: makeEvalClaim({
        id: "false-003",
        expectedCategory: "likely-false",
        harmWeight: 3,
      }),
      verdict: makeFinalVerdict({ category: "unverified", confidence: 45 }),
    });

    const grade = makeVerdictGrade({
      categoryCorrect: false,
      categoryAcceptable: false,
      harmWeight: 3,
    });

    const result = makeEvalResult({
      trialResults: [trial],
      verdictGrades: [grade],
    });

    const md = generateMarkdownReport(result, { mode: "mock" });

    expect(md).toContain("Failures");
    expect(md).toContain("false-003");
    expect(md).toContain("likely-false");
    expect(md).toContain("unverified");
  });

  it("should omit groundedness section when aggregate is null", () => {
    const result = makeEvalResult({
      groundednessAggregate: null,
      groundednessGrades: [],
    });
    const md = generateMarkdownReport(result, { mode: "mock" });

    expect(md).not.toContain("Groundedness");
  });

  it("should include per-claim table with cost and duration", () => {
    const result = makeEvalResult();
    const md = generateMarkdownReport(result, { mode: "mock" });

    // Table headers
    expect(md).toContain("Expected");
    expect(md).toContain("Got");
    expect(md).toContain("Cost");
    expect(md).toContain("Duration");

    // Actual values
    expect(md).toContain("likely-false");
    expect(md).toContain("$0.55");
  });
});
