import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalClaim } from "../../../eval/dataset.js";
import type { EvalTrialResult } from "../../../eval/harness.js";
import type { VerdictGrade } from "../../../eval/graders/verdict-grader.js";
import type { CoverageGrade } from "../../../eval/graders/coverage-grader.js";
import {
  makeClassifierResult,
  makeFinalVerdict,
  makeSearchStrategy,
  makeAgentReport,
  makeChallengeReport,
} from "../../fixtures/index.js";

// ── Mock dependencies ──────────────────────────────────────────

const mockHarnessRun = vi.fn();

vi.mock("../../../eval/harness.js", () => ({
  EvalHarness: vi.fn(function () {
    return { run: mockHarnessRun };
  }),
}));

vi.mock("../../../eval/graders/verdict-grader.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../eval/graders/verdict-grader.js")>();
  return {
    ...original,
    gradeVerdict: vi.fn().mockReturnValue({
      categoryCorrect: true,
      categoryAcceptable: true,
      confidenceInRange: true,
      harmWeight: 2,
      rawScore: 100,
      weightedScore: 200,
      maxWeightedScore: 200,
    } satisfies VerdictGrade),
    aggregateVerdictScores: vi.fn().mockReturnValue({
      harmWeightedAccuracy: 100,
      exactMatchRate: 100,
      acceptableMatchRate: 100,
    }),
  };
});

vi.mock("../../../eval/graders/groundedness-grader.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../eval/graders/groundedness-grader.js")>();
  return {
    ...original,
    gradeGroundedness: vi.fn().mockResolvedValue({
      keyFindingsTotal: 3,
      keyFindingsGrounded: 3,
      keyFindingsUngrounded: [],
      sourcesInVerdict: 2,
      sourcesTraceable: 2,
      score: 100,
      reasoning: "All grounded",
    }),
    aggregateGroundednessScores: vi.fn().mockReturnValue({
      avgGroundedFindings: 100,
      avgTraceableSources: 100,
      avgScore: 100,
    }),
  };
});

vi.mock("../../../eval/graders/coverage-grader.js", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../eval/graders/coverage-grader.js")>();
  return {
    ...original,
    gradeCoverage: vi.fn().mockReturnValue({
      mustFindTotal: 2,
      mustFindHit: 2,
      mustFindMissed: [],
      totalSourcesFound: 5,
      uniqueDomains: 4,
      score: 94,
    } satisfies CoverageGrade),
    aggregateCoverageScores: vi.fn().mockReturnValue({
      avgScore: 94,
      avgMustFindHitRate: 100,
      avgUniqueDomains: 4,
    }),
  };
});

vi.mock("../../../src/services/claude-client.js", () => ({
  ClaudeClient: vi.fn(function () { return {}; }),
  MODELS: { HAIKU: "haiku", SONNET: "sonnet", OPUS: "opus" },
}));

// ── Import after mocks ──────────────────────────────────────────

import { parseArgs, runEval } from "../../../eval/run-eval.js";
import { EvalHarness } from "../../../eval/harness.js";
import { gradeVerdict } from "../../../eval/graders/verdict-grader.js";

// ── Helper ──────────────────────────────────────────────────────

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

// ── Tests ──────────────────────────────────────────────────────

describe("parseArgs", () => {
  it("should parse CLI arguments correctly", () => {
    const args = parseArgs(["--mode", "mock", "--claim", "false-001", "--skip-groundedness"]);

    expect(args.mode).toBe("mock");
    expect(args.claims).toEqual(["false-001"]);
    expect(args.skipGroundedness).toBe(true);
    expect(args.group).toBe("all");
  });

  it("should default to mock mode and all groups", () => {
    const args = parseArgs([]);

    expect(args.mode).toBe("mock");
    expect(args.group).toBe("all");
    expect(args.skipGroundedness).toBe(false);
    expect(args.claims).toEqual([]);
  });

  it("should parse --mode live", () => {
    const args = parseArgs(["--mode", "live"]);
    expect(args.mode).toBe("live");
  });

  it("should parse --group filter", () => {
    const args = parseArgs(["--group", "false"]);
    expect(args.group).toBe("false");
  });

  it("should parse multiple --claim flags", () => {
    const args = parseArgs(["--claim", "false-001", "--claim", "true-001"]);
    expect(args.claims).toEqual(["false-001", "true-001"]);
  });
});

describe("runEval", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockHarnessRun.mockReset();
  });

  it("should run eval with single claim in mock mode", async () => {
    const trialResult = makeTrialResult();
    mockHarnessRun.mockResolvedValue([trialResult]);

    const result = await runEval({
      mode: "mock",
      group: "all",
      claims: ["false-001"],
      skipGroundedness: true,
    });

    expect(EvalHarness).toHaveBeenCalledWith(
      expect.objectContaining({ mode: "mock", claimFilter: ["false-001"] }),
    );
    expect(mockHarnessRun).toHaveBeenCalledTimes(1);
    expect(result.trialResults).toHaveLength(1);
    expect(result.verdictGrades).toHaveLength(1);
    expect(gradeVerdict).toHaveBeenCalledTimes(1);
  });

  it("should skip groundedness grading when --skip-groundedness is set", async () => {
    mockHarnessRun.mockResolvedValue([makeTrialResult()]);
    const { gradeGroundedness } = await import("../../../eval/graders/groundedness-grader.js");

    const result = await runEval({
      mode: "mock",
      group: "all",
      claims: [],
      skipGroundedness: true,
    });

    expect(gradeGroundedness).not.toHaveBeenCalled();
    expect(result.groundednessGrades).toHaveLength(0);
  });

  it("should run groundedness grading when not skipped", async () => {
    mockHarnessRun.mockResolvedValue([makeTrialResult()]);
    const { gradeGroundedness } = await import("../../../eval/graders/groundedness-grader.js");

    const result = await runEval({
      mode: "mock",
      group: "all",
      claims: [],
      skipGroundedness: false,
    });

    expect(gradeGroundedness).toHaveBeenCalledTimes(1);
    expect(result.groundednessGrades).toHaveLength(1);
  });

  it("should run coverage grading for claims with mustFindSources", async () => {
    mockHarnessRun.mockResolvedValue([makeTrialResult()]);
    const { gradeCoverage } = await import("../../../eval/graders/coverage-grader.js");

    const result = await runEval({
      mode: "mock",
      group: "all",
      claims: [],
      skipGroundedness: true,
    });

    expect(gradeCoverage).toHaveBeenCalledTimes(1);
    expect(result.coverageGrades).toHaveLength(1);
  });

  it("should pass group filter to harness when group is not 'all'", async () => {
    mockHarnessRun.mockResolvedValue([]);

    await runEval({
      mode: "mock",
      group: "false",
      claims: [],
      skipGroundedness: true,
    });

    expect(EvalHarness).toHaveBeenCalledWith(
      expect.objectContaining({ groupFilter: ["false"] }),
    );
  });

  it("should return aggregate results", async () => {
    mockHarnessRun.mockResolvedValue([makeTrialResult()]);

    const result = await runEval({
      mode: "mock",
      group: "all",
      claims: [],
      skipGroundedness: true,
    });

    expect(result.verdictAggregate).toBeDefined();
    expect(result.verdictAggregate.harmWeightedAccuracy).toBe(100);
    expect(result.coverageAggregate).toBeDefined();
  });
});
