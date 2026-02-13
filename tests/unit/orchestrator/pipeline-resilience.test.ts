import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClaudeClient } from "../../../src/services/claude-client.js";
import type { ToolRegistry } from "../../../src/tools/tool-registry.js";
import type { InvestigationRepository } from "../../../src/db/investigation-repository.js";
import {
  makeClassifierResult,
  makeSearchStrategy,
  makeAgentReport,
  makeChallengeReport,
  makeFinalVerdict,
} from "../../fixtures/index.js";

// ── Mock Agent Modules ─────────────────────────────────────────

vi.mock("../../../src/agents/classifier-agent.js", () => ({
  runClassifier: vi.fn(),
}));

vi.mock("../../../src/agents/non-factual-handler.js", () => ({
  handleNonFactual: vi.fn(),
}));

vi.mock("../../../src/agents/strategist-agent.js", () => ({
  runStrategist: vi.fn(),
}));

vi.mock("../../../src/agents/investigators/source-verification-agent.js", () => ({
  runSourceVerification: vi.fn(),
}));

vi.mock("../../../src/agents/investigators/domain-expertise-agent.js", () => ({
  runDomainExpertise: vi.fn(),
}));

vi.mock("../../../src/agents/investigators/pattern-matching-agent.js", () => ({
  runPatternMatching: vi.fn(),
}));

vi.mock("../../../src/agents/devils-advocate-agent.js", () => ({
  runDevilsAdvocate: vi.fn(),
}));

vi.mock("../../../src/agents/judge-agent.js", () => ({
  runJudge: vi.fn(),
}));

vi.mock("../../../src/formatter/confidence-gates.js", () => ({
  enforceConfidenceGates: vi.fn(),
  detectConfidenceMismatch: vi.fn().mockReturnValue(false),
}));

// ── Import after mocks ────────────────────────────────────────

import { runClassifier } from "../../../src/agents/classifier-agent.js";
import { runStrategist } from "../../../src/agents/strategist-agent.js";
import { runSourceVerification } from "../../../src/agents/investigators/source-verification-agent.js";
import { runDomainExpertise } from "../../../src/agents/investigators/domain-expertise-agent.js";
import { runPatternMatching } from "../../../src/agents/investigators/pattern-matching-agent.js";
import { runDevilsAdvocate } from "../../../src/agents/devils-advocate-agent.js";
import { runJudge } from "../../../src/agents/judge-agent.js";
import { enforceConfidenceGates } from "../../../src/formatter/confidence-gates.js";
import { InvestigationPipeline } from "../../../src/orchestrator/pipeline.js";

const mockedRunClassifier = vi.mocked(runClassifier);
const mockedRunStrategist = vi.mocked(runStrategist);
const mockedRunSourceVerification = vi.mocked(runSourceVerification);
const mockedRunDomainExpertise = vi.mocked(runDomainExpertise);
const mockedRunPatternMatching = vi.mocked(runPatternMatching);
const mockedRunDevilsAdvocate = vi.mocked(runDevilsAdvocate);
const mockedRunJudge = vi.mocked(runJudge);
const mockedEnforceConfidenceGates = vi.mocked(enforceConfidenceGates);

// ── Helper: create mock dependencies ───────────────────────────

function createMockRepo(): InvestigationRepository {
  return {
    create: vi.fn().mockReturnValue("resilience-test-id"),
    getById: vi.fn(),
    updateStatus: vi.fn(),
    updateClassifierResult: vi.fn(),
    updateSearchStrategy: vi.fn(),
    updateAgentReports: vi.fn(),
    updateChallengeReport: vi.fn(),
    updateFinalVerdict: vi.fn(),
    getRecent: vi.fn(),
  } as unknown as InvestigationRepository;
}

function setupSuccessfulPipeline() {
  const classifierResult = makeClassifierResult();
  const searchStrategy = makeSearchStrategy();
  const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 20 });
  const domainReport = makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 25 });
  const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 18 });
  const challengeReport = makeChallengeReport();
  const finalVerdict = makeFinalVerdict();

  mockedRunClassifier.mockResolvedValue({ result: classifierResult, costUsd: 0.01 });
  mockedRunStrategist.mockResolvedValue({ strategy: searchStrategy, costUsd: 0.20 });
  mockedRunSourceVerification.mockResolvedValue({ report: sourceReport, costUsd: 0.35 });
  mockedRunDomainExpertise.mockResolvedValue({ report: domainReport, costUsd: 0.30 });
  mockedRunPatternMatching.mockResolvedValue({ report: patternReport, costUsd: 0.32 });
  mockedRunDevilsAdvocate.mockResolvedValue({ report: challengeReport, costUsd: 0.50 });
  mockedRunJudge.mockResolvedValue({ verdict: finalVerdict, costUsd: 0.80 });
  mockedEnforceConfidenceGates.mockImplementation((v) => v);

  return { classifierResult, searchStrategy, sourceReport, domainReport, patternReport, challengeReport, finalVerdict };
}

// ── Tests ──────────────────────────────────────────────────────

describe("Pipeline resilience — agent failure and timeout handling", () => {
  let pipeline: InvestigationPipeline;
  let mockRepo: InvestigationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepo();
    pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
    );
  });

  it("should complete pipeline when 1 of 3 investigators fails", async () => {
    setupSuccessfulPipeline();
    mockedRunDomainExpertise.mockRejectedValue(new Error("Domain agent crashed"));

    const result = await pipeline.investigate("Claim with one failing investigator");

    expect(result.verdict).toBeDefined();
    expect(result.investigationId).toBe("resilience-test-id");

    // DA should receive exactly 2 reports
    const daArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
    const reportsPassedToDA = daArgs[1] as ReturnType<typeof makeAgentReport>[];
    expect(reportsPassedToDA).toHaveLength(2);
    expect(reportsPassedToDA.map((r) => r.agentRole)).toEqual(
      expect.arrayContaining(["source_verification", "pattern_matching"]),
    );

    // Agent reports saved to DB should have 2 entries
    const savedReports = (mockRepo.updateAgentReports as ReturnType<typeof vi.fn>).mock.calls[0]![1];
    expect(savedReports).toHaveLength(2);
  });

  it("should complete pipeline when 2 of 3 investigators fail", async () => {
    setupSuccessfulPipeline();
    mockedRunSourceVerification.mockRejectedValue(new Error("Source agent crashed"));
    mockedRunDomainExpertise.mockRejectedValue(new Error("Domain agent crashed"));

    const result = await pipeline.investigate("Claim with two failing investigators");

    expect(result.verdict).toBeDefined();
    expect(result.investigationId).toBe("resilience-test-id");

    // DA should receive exactly 1 report (pattern matching only)
    const daArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
    const reportsPassedToDA = daArgs[1] as ReturnType<typeof makeAgentReport>[];
    expect(reportsPassedToDA).toHaveLength(1);
    expect(reportsPassedToDA[0]!.agentRole).toBe("pattern_matching");

    // Judge and DA should still be called
    expect(mockedRunDevilsAdvocate).toHaveBeenCalledOnce();
    expect(mockedRunJudge).toHaveBeenCalledOnce();
  });

  it("should propagate classifier error after internal retry exhaustion", async () => {
    setupSuccessfulPipeline();
    mockedRunClassifier.mockRejectedValue(
      new Error("Failed to parse classifier response after retry"),
    );

    await expect(pipeline.investigate("Malformed claim"))
      .rejects.toThrow("Failed to parse classifier response after retry");

    // Strategist and later agents should never be called
    expect(mockedRunStrategist).not.toHaveBeenCalled();
    expect(mockedRunSourceVerification).not.toHaveBeenCalled();
    expect(mockedRunDevilsAdvocate).not.toHaveBeenCalled();
    expect(mockedRunJudge).not.toHaveBeenCalled();
  });

  it("should propagate DA error when devil's advocate agent fails", async () => {
    setupSuccessfulPipeline();
    mockedRunDevilsAdvocate.mockRejectedValue(new Error("DA agent timed out"));

    await expect(pipeline.investigate("Claim where DA fails"))
      .rejects.toThrow("DA agent timed out");

    // Investigators should have completed, judge should not be called
    expect(mockedRunSourceVerification).toHaveBeenCalledOnce();
    expect(mockedRunDomainExpertise).toHaveBeenCalledOnce();
    expect(mockedRunPatternMatching).toHaveBeenCalledOnce();
    expect(mockedRunJudge).not.toHaveBeenCalled();
  });

  it("should propagate judge error when judge returns invalid data", async () => {
    setupSuccessfulPipeline();
    mockedRunJudge.mockRejectedValue(
      new Error("Failed to validate FinalVerdict schema"),
    );

    await expect(pipeline.investigate("Claim where judge fails"))
      .rejects.toThrow("Failed to validate FinalVerdict schema");

    // All prior agents should have completed
    expect(mockedRunClassifier).toHaveBeenCalledOnce();
    expect(mockedRunStrategist).toHaveBeenCalledOnce();
    expect(mockedRunDevilsAdvocate).toHaveBeenCalledOnce();

    // Confidence gates should not be applied
    expect(mockedEnforceConfidenceGates).not.toHaveBeenCalled();
  });

  it("should track cost from successful agents even when later agents fail", async () => {
    setupSuccessfulPipeline();
    // Override: domain investigator fails, DA fails
    mockedRunDomainExpertise.mockRejectedValue(new Error("Domain agent crashed"));
    mockedRunDevilsAdvocate.mockRejectedValue(new Error("DA failed"));

    const resultPromise = pipeline.investigate("Claim with partial cost tracking");

    // Pipeline will throw at DA step
    await expect(resultPromise).rejects.toThrow("DA failed");

    // Verify that classifier, strategist, and successful investigators were called
    // (costs from successful agents would have been accumulated before the DA failure)
    expect(mockedRunClassifier).toHaveBeenCalledOnce();
    expect(mockedRunStrategist).toHaveBeenCalledOnce();
    expect(mockedRunSourceVerification).toHaveBeenCalledOnce();
    expect(mockedRunPatternMatching).toHaveBeenCalledOnce();

    // DB should have partial results saved before the DA failure
    expect(mockRepo.updateClassifierResult).toHaveBeenCalledOnce();
    expect(mockRepo.updateSearchStrategy).toHaveBeenCalledOnce();
    expect(mockRepo.updateAgentReports).toHaveBeenCalledOnce();
    // Challenge report should NOT have been saved (DA failed)
    expect(mockRepo.updateChallengeReport).not.toHaveBeenCalled();
    // Final verdict should NOT have been saved
    expect(mockRepo.updateFinalVerdict).not.toHaveBeenCalled();
  });
});
