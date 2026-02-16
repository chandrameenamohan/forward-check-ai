import { describe, it, expect, vi, beforeEach } from "vitest";
import type { EvalClaim } from "../../../eval/dataset.js";
import type { InvestigateResult } from "../../../src/orchestrator/pipeline.js";
import {
  makeClassifierResult,
  makeFinalVerdict,
  makeSearchStrategy,
  makeAgentReport,
  makeChallengeReport,
} from "../../fixtures/index.js";

// ── Mock the dependencies the harness uses internally ───────────

const mockInvestigate = vi.fn();
const mockDbClose = vi.fn();
const mockDb = {
  pragma: vi.fn(),
  exec: vi.fn(),
  prepare: vi.fn().mockReturnValue({ run: vi.fn(), get: vi.fn(), all: vi.fn() }),
  close: mockDbClose,
};

vi.mock("../../../src/db/connection.js", () => ({
  createDatabase: vi.fn(function () { return mockDb; }),
}));

vi.mock("../../../src/db/migrations.js", () => ({
  runMigrations: vi.fn(),
}));

vi.mock("../../../src/db/investigation-repository.js", () => ({
  InvestigationRepository: vi.fn(function () {
    return {
      create: vi.fn().mockReturnValue("test-id"),
      updateStatus: vi.fn(),
      updateClassifierResult: vi.fn(),
      updateSearchStrategy: vi.fn(),
      updateAgentReports: vi.fn(),
      updateChallengeReport: vi.fn(),
      updateFinalVerdict: vi.fn(),
      getRecent: vi.fn(),
      getById: vi.fn(),
      updateSourceUrl: vi.fn(),
    };
  }),
}));

vi.mock("../../../src/services/claude-client.js", () => ({
  ClaudeClient: vi.fn(function () { return {}; }),
}));

vi.mock("../../../src/tools/tool-registry.js", () => ({
  ToolRegistry: vi.fn(function () {
    return {
      register: vi.fn(),
      getToolDefinitions: vi.fn(function () { return []; }),
      execute: vi.fn(),
    };
  }),
}));

vi.mock("../../../src/orchestrator/pipeline.js", () => ({
  InvestigationPipeline: vi.fn(function () {
    return { investigate: mockInvestigate };
  }),
}));

vi.mock("../../../src/tools/brave-search.js", () => ({
  braveSearchToolDefinition: {
    name: "brave_web_search",
    description: "test",
    input_schema: { type: "object", properties: {}, required: [] },
  },
}));

vi.mock("../../../src/tools/google-factcheck.js", () => ({
  googleFactCheckToolDefinition: {
    name: "google_fact_check_search",
    description: "test",
    input_schema: { type: "object", properties: {}, required: [] },
  },
}));

// ── Import after mocks ─────────────────────────────────────────

import { EvalHarness } from "../../../eval/harness.js";
import { createDatabase } from "../../../src/db/connection.js";
import { InvestigationPipeline } from "../../../src/orchestrator/pipeline.js";

const mockedCreateDatabase = vi.mocked(createDatabase);
const MockedPipeline = vi.mocked(InvestigationPipeline);

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

// ── Helper: build a pipeline investigate result ─────────────────

function makePipelineResult(overrides?: Partial<InvestigateResult>): InvestigateResult {
  return {
    verdict: makeFinalVerdict(),
    investigationId: "test-id",
    totalCostUsd: 0.55,
    durationMs: 5000,
    classifierResult: makeClassifierResult(),
    searchStrategy: makeSearchStrategy(),
    agentReports: [
      makeAgentReport({ agentRole: "source_verification" }),
      makeAgentReport({ agentRole: "domain_expertise" }),
      makeAgentReport({ agentRole: "pattern_matching" }),
    ],
    challengeReport: makeChallengeReport(),
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────────

describe("EvalHarness", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockInvestigate.mockReset();
    mockDbClose.mockReset();
  });

  it("should run a single claim in mock mode and return EvalTrialResult", async () => {
    mockInvestigate.mockResolvedValue(makePipelineResult());
    const harness = new EvalHarness({ mode: "mock" });
    const claims = [makeEvalClaim()];

    const results = await harness.run(claims);

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.claimId).toBe("false-001");
    expect(result.claim).toEqual(claims[0]);
    expect(result.verdict).toBeDefined();
    expect(result.classifierResult).toBeDefined();
    expect(result.searchStrategy).toBeDefined();
    expect(result.agentReports).toBeDefined();
    expect(result.challengeReport).toBeDefined();
    expect(result.costUsd).toBeGreaterThanOrEqual(0);
    expect(result.durationMs).toBeGreaterThanOrEqual(0);
    expect(result.timestamp).toBeDefined();
    expect(result.error).toBeUndefined();
  });

  it("should handle pipeline timeout gracefully", async () => {
    mockInvestigate.mockImplementation(
      function () { return new Promise(function (resolve) { setTimeout(function () { resolve(makePipelineResult()); }, 500); }); },
    );
    const harness = new EvalHarness({ mode: "mock", timeoutMs: 100 });
    const claims = [makeEvalClaim()];

    const results = await harness.run(claims);

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.error).toMatch(/timeout/i);
    expect(result.verdict).toBeUndefined();
  });

  it("should filter claims by ID", async () => {
    mockInvestigate.mockResolvedValue(makePipelineResult());
    const harness = new EvalHarness({ mode: "mock", claimFilter: ["false-001"] });
    const claims = [
      makeEvalClaim({ id: "false-001" }),
      makeEvalClaim({ id: "false-002", claim: "WHO green tea cures cancer" }),
      makeEvalClaim({ id: "true-001", claim: "Chandrayaan-3 landed on the Moon" }),
    ];

    const results = await harness.run(claims);

    expect(results).toHaveLength(1);
    expect(results[0]!.claimId).toBe("false-001");
  });

  it("should filter claims by group", async () => {
    mockInvestigate.mockResolvedValue(makePipelineResult());
    const harness = new EvalHarness({ mode: "mock", groupFilter: ["false"] });
    const claims = [
      makeEvalClaim({ id: "false-001" }),
      makeEvalClaim({ id: "false-002", claim: "WHO green tea cures cancer" }),
      makeEvalClaim({ id: "true-001", claim: "Chandrayaan-3 landed on the Moon" }),
    ];

    const results = await harness.run(claims);

    expect(results).toHaveLength(2);
    expect(results.map((r) => r.claimId)).toEqual(["false-001", "false-002"]);
  });

  it("should isolate database state between claims", async () => {
    mockInvestigate.mockResolvedValue(makePipelineResult());
    const harness = new EvalHarness({ mode: "mock" });
    const claims = [
      makeEvalClaim({ id: "false-001" }),
      makeEvalClaim({ id: "false-002", claim: "WHO green tea cures cancer" }),
    ];

    await harness.run(claims);

    // Each claim should get its own createDatabase call (fresh in-memory DB)
    expect(mockedCreateDatabase).toHaveBeenCalledTimes(2);
    // Both should be in-memory databases
    for (const call of mockedCreateDatabase.mock.calls) {
      expect(call[0]).toBe(":memory:");
    }
    // DB should be closed after each claim
    expect(mockDbClose).toHaveBeenCalledTimes(2);
  });

  it("should handle pipeline error gracefully", async () => {
    mockInvestigate.mockRejectedValue(new Error("Classifier failed"));
    const harness = new EvalHarness({ mode: "mock" });
    const claims = [makeEvalClaim()];

    const results = await harness.run(claims);

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.error).toBe("Classifier failed");
    expect(result.verdict).toBeUndefined();
  });

  it("should capture non-factual short-circuit responses", async () => {
    mockInvestigate.mockResolvedValue(makePipelineResult({
      verdict: null,
      nonFactualResponse: "Hi! I'm ForwardCheck.",
      classifierResult: makeClassifierResult({ category: "greeting" }),
      searchStrategy: undefined,
      agentReports: undefined,
      challengeReport: undefined,
      totalCostUsd: 0.01,
      durationMs: 100,
    }));
    const harness = new EvalHarness({ mode: "mock" });
    const claims = [makeEvalClaim({
      id: "nonfactual-001",
      claim: "Hello! How are you doing today?",
      expectedClassifierRoute: "greeting",
    })];

    const results = await harness.run(claims);

    expect(results).toHaveLength(1);
    const result = results[0]!;
    expect(result.nonFactualResponse).toBe("Hi! I'm ForwardCheck.");
    expect(result.verdict).toBeUndefined();
    expect(result.classifierResult).toBeDefined();
  });

  it("should create InvestigationPipeline for each claim", async () => {
    mockInvestigate.mockResolvedValue(makePipelineResult());
    const harness = new EvalHarness({ mode: "mock" });
    const claims = [makeEvalClaim()];

    await harness.run(claims);

    expect(MockedPipeline).toHaveBeenCalledTimes(1);
    expect(mockInvestigate).toHaveBeenCalledWith(claims[0]!.claim);
  });
});
