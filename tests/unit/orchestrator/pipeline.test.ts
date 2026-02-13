import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClaudeClient } from "../../../src/services/claude-client.js";
import type { ToolRegistry } from "../../../src/tools/tool-registry.js";
import type { InvestigationRepository } from "../../../src/db/investigation-repository.js";
import type { ClassifierResult } from "../../../src/schemas/classifier-result.js";
import type { SearchStrategy } from "../../../src/schemas/search-strategy.js";
import type { AgentReport } from "../../../src/schemas/agent-report.js";
import type { ChallengeReport } from "../../../src/schemas/challenge-report.js";
import type { FinalVerdict } from "../../../src/schemas/final-verdict.js";
import type { PipelineStage } from "../../../src/bot/status-updater.js";
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
}));

// ── Import after mocks ────────────────────────────────────────

import { runClassifier } from "../../../src/agents/classifier-agent.js";
import { handleNonFactual } from "../../../src/agents/non-factual-handler.js";
import { runStrategist } from "../../../src/agents/strategist-agent.js";
import { runSourceVerification } from "../../../src/agents/investigators/source-verification-agent.js";
import { runDomainExpertise } from "../../../src/agents/investigators/domain-expertise-agent.js";
import { runPatternMatching } from "../../../src/agents/investigators/pattern-matching-agent.js";
import { runDevilsAdvocate } from "../../../src/agents/devils-advocate-agent.js";
import { runJudge } from "../../../src/agents/judge-agent.js";
import { enforceConfidenceGates } from "../../../src/formatter/confidence-gates.js";
import { InvestigationPipeline } from "../../../src/orchestrator/pipeline.js";
import { ClaimCache } from "../../../src/services/claim-cache.js";

const mockedRunClassifier = vi.mocked(runClassifier);
const mockedRunStrategist = vi.mocked(runStrategist);
const mockedRunSourceVerification = vi.mocked(runSourceVerification);
const mockedRunDomainExpertise = vi.mocked(runDomainExpertise);
const mockedRunPatternMatching = vi.mocked(runPatternMatching);
const mockedRunDevilsAdvocate = vi.mocked(runDevilsAdvocate);
const mockedRunJudge = vi.mocked(runJudge);
const mockedEnforceConfidenceGates = vi.mocked(enforceConfidenceGates);
const mockedHandleNonFactual = vi.mocked(handleNonFactual);

// ── Helper: create mock dependencies ───────────────────────────

function createMockClient(): ClaudeClient {
  return {} as ClaudeClient;
}

function createMockToolRegistry(): ToolRegistry {
  return {} as ToolRegistry;
}

function createMockRepo(): InvestigationRepository {
  return {
    create: vi.fn().mockReturnValue("test-investigation-id"),
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

// ── Setup standard mocks for full pipeline ─────────────────────

function setupFullPipelineMocks(opts?: {
  classifierResult?: ClassifierResult;
  searchStrategy?: SearchStrategy;
  sourceReport?: AgentReport;
  domainReport?: AgentReport;
  patternReport?: AgentReport;
  challengeReport?: ChallengeReport;
  finalVerdict?: FinalVerdict;
}) {
  const classifierResult = opts?.classifierResult ?? makeClassifierResult();
  const searchStrategy = opts?.searchStrategy ?? makeSearchStrategy();
  const sourceReport = opts?.sourceReport ?? makeAgentReport({ agentRole: "source_verification", confidenceScore: 20 });
  const domainReport = opts?.domainReport ?? makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 25 });
  const patternReport = opts?.patternReport ?? makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 18 });
  const challengeReport = opts?.challengeReport ?? makeChallengeReport();
  const finalVerdict = opts?.finalVerdict ?? makeFinalVerdict();

  mockedRunClassifier.mockResolvedValue({ result: classifierResult, costUsd: 0.01 });
  mockedRunStrategist.mockResolvedValue({ strategy: searchStrategy, costUsd: 0.20 });
  mockedRunSourceVerification.mockResolvedValue({ report: sourceReport, costUsd: 0.35 });
  mockedRunDomainExpertise.mockResolvedValue({ report: domainReport, costUsd: 0.30 });
  mockedRunPatternMatching.mockResolvedValue({ report: patternReport, costUsd: 0.32 });
  mockedRunDevilsAdvocate.mockResolvedValue({ report: challengeReport, costUsd: 0.50 });
  mockedRunJudge.mockResolvedValue({ verdict: finalVerdict, costUsd: 0.80 });
  mockedEnforceConfidenceGates.mockReturnValue(finalVerdict);

  return { classifierResult, searchStrategy, sourceReport, domainReport, patternReport, challengeReport, finalVerdict };
}

// ── Tests ──────────────────────────────────────────────────────

describe("InvestigationPipeline", () => {
  let pipeline: InvestigationPipeline;
  let mockClient: ClaudeClient;
  let mockRegistry: ToolRegistry;
  let mockRepo: InvestigationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = createMockClient();
    mockRegistry = createMockToolRegistry();
    mockRepo = createMockRepo();
    pipeline = new InvestigationPipeline(mockClient, mockRegistry, mockRepo);
  });

  describe("full pipeline for factual claim", () => {
    it("should run full pipeline for factual claim", async () => {
      const { finalVerdict } = setupFullPipelineMocks();

      const result = await pipeline.investigate("PM Modi announced Rs 5000 transfer");

      expect(result.verdict).toEqual(finalVerdict);
      expect(result.investigationId).toBe("test-investigation-id");

      // All agents should have been called
      expect(mockedRunClassifier).toHaveBeenCalledOnce();
      expect(mockedRunStrategist).toHaveBeenCalledOnce();
      expect(mockedRunSourceVerification).toHaveBeenCalledOnce();
      expect(mockedRunDomainExpertise).toHaveBeenCalledOnce();
      expect(mockedRunPatternMatching).toHaveBeenCalledOnce();
      expect(mockedRunDevilsAdvocate).toHaveBeenCalledOnce();
      expect(mockedRunJudge).toHaveBeenCalledOnce();
      expect(mockedEnforceConfidenceGates).toHaveBeenCalledOnce();
    });

    it("should return total cost across all agents", async () => {
      setupFullPipelineMocks();

      const result = await pipeline.investigate("Some claim");

      // 0.01 + 0.20 + 0.35 + 0.30 + 0.32 + 0.50 + 0.80 = 2.48
      expect(result.totalCostUsd).toBeCloseTo(2.48, 2);
    });

    it("should return pipeline duration in milliseconds", async () => {
      setupFullPipelineMocks();

      const result = await pipeline.investigate("Some claim");

      expect(result.durationMs).toBeGreaterThanOrEqual(0);
      expect(typeof result.durationMs).toBe("number");
    });
  });

  describe("short-circuit for non-factual messages", () => {
    it("should short-circuit for greeting message", async () => {
      const greetingResult = makeClassifierResult({ category: "greeting" });
      mockedRunClassifier.mockResolvedValue({ result: greetingResult, costUsd: 0.01 });
      mockedHandleNonFactual.mockReturnValue({
        text: "Hi! I'm ForwardCheck.",
        shouldInvestigate: false,
      });

      const result = await pipeline.investigate("Hello");

      expect(result.verdict).toBeNull();
      expect(result.nonFactualResponse).toBe("Hi! I'm ForwardCheck.");
      expect(mockedRunStrategist).not.toHaveBeenCalled();
      expect(mockedRunSourceVerification).not.toHaveBeenCalled();
      expect(mockedRunDevilsAdvocate).not.toHaveBeenCalled();
      expect(mockedRunJudge).not.toHaveBeenCalled();
    });

    it("should short-circuit for opinion message", async () => {
      const opinionResult = makeClassifierResult({ category: "opinion" });
      mockedRunClassifier.mockResolvedValue({ result: opinionResult, costUsd: 0.01 });
      mockedHandleNonFactual.mockReturnValue({
        text: "That looks like an opinion.",
        shouldInvestigate: false,
      });

      const result = await pipeline.investigate("I think AI is great");

      expect(result.verdict).toBeNull();
      expect(result.nonFactualResponse).toBe("That looks like an opinion.");
      expect(mockedRunStrategist).not.toHaveBeenCalled();
    });

    it("should short-circuit for scam message", async () => {
      const scamResult = makeClassifierResult({ category: "scam" });
      mockedRunClassifier.mockResolvedValue({ result: scamResult, costUsd: 0.01 });
      mockedHandleNonFactual.mockReturnValue({
        text: "Warning: This looks like a scam.",
        shouldInvestigate: false,
      });

      const result = await pipeline.investigate("Click here for free money");

      expect(result.verdict).toBeNull();
      expect(result.nonFactualResponse).toBe("Warning: This looks like a scam.");
    });
  });

  describe("parallel investigator execution", () => {
    it("should run investigators in parallel", async () => {
      // Track call order via timestamps
      const callTimes: number[] = [];

      mockedRunClassifier.mockResolvedValue({ result: makeClassifierResult(), costUsd: 0.01 });
      mockedRunStrategist.mockResolvedValue({ strategy: makeSearchStrategy(), costUsd: 0.20 });

      mockedRunSourceVerification.mockImplementation(async () => {
        callTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 50));
        return { report: makeAgentReport({ agentRole: "source_verification" }), costUsd: 0.35 };
      });
      mockedRunDomainExpertise.mockImplementation(async () => {
        callTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 50));
        return { report: makeAgentReport({ agentRole: "domain_expertise" }), costUsd: 0.30 };
      });
      mockedRunPatternMatching.mockImplementation(async () => {
        callTimes.push(Date.now());
        await new Promise((r) => setTimeout(r, 50));
        return { report: makeAgentReport({ agentRole: "pattern_matching" }), costUsd: 0.32 };
      });

      mockedRunDevilsAdvocate.mockResolvedValue({ report: makeChallengeReport(), costUsd: 0.50 });
      mockedRunJudge.mockResolvedValue({ verdict: makeFinalVerdict(), costUsd: 0.80 });
      mockedEnforceConfidenceGates.mockImplementation((v) => v);

      const result = await pipeline.investigate("Test claim");

      // All 3 investigators should have been called
      expect(mockedRunSourceVerification).toHaveBeenCalledOnce();
      expect(mockedRunDomainExpertise).toHaveBeenCalledOnce();
      expect(mockedRunPatternMatching).toHaveBeenCalledOnce();

      // They should have started near-simultaneously (within 20ms of each other)
      expect(callTimes).toHaveLength(3);
      const maxSpread = Math.max(...callTimes) - Math.min(...callTimes);
      expect(maxSpread).toBeLessThan(20);

      expect(result.verdict).toBeDefined();
    });

    it("should continue pipeline if one investigator fails", async () => {
      const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 20 });
      const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 18 });

      mockedRunClassifier.mockResolvedValue({ result: makeClassifierResult(), costUsd: 0.01 });
      mockedRunStrategist.mockResolvedValue({ strategy: makeSearchStrategy(), costUsd: 0.20 });
      mockedRunSourceVerification.mockResolvedValue({ report: sourceReport, costUsd: 0.35 });
      mockedRunDomainExpertise.mockRejectedValue(new Error("Agent failed"));
      mockedRunPatternMatching.mockResolvedValue({ report: patternReport, costUsd: 0.32 });
      mockedRunDevilsAdvocate.mockResolvedValue({ report: makeChallengeReport(), costUsd: 0.50 });
      mockedRunJudge.mockResolvedValue({ verdict: makeFinalVerdict(), costUsd: 0.80 });
      mockedEnforceConfidenceGates.mockImplementation((v) => v);

      const result = await pipeline.investigate("Test claim");

      // DA should receive only 2 reports (the ones that succeeded)
      expect(mockedRunDevilsAdvocate).toHaveBeenCalledOnce();
      const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
      expect(daCallArgs[1]).toHaveLength(2);
      expect(result.verdict).toBeDefined();
    });
  });

  describe("disagreement detection and effort escalation", () => {
    it("should detect disagreement and escalate DA effort when confidence spread > 30", async () => {
      const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 80 });
      const domainReport = makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 40 });
      const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 30 });

      setupFullPipelineMocks({
        sourceReport,
        domainReport,
        patternReport,
      });

      await pipeline.investigate("Contested claim");

      // DA should have been called with effortLevel "max" due to spread > 30
      const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
      expect(daCallArgs[4]).toBe("max");
    });

    it("should not escalate when investigators agree", async () => {
      const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 20 });
      const domainReport = makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 25 });
      const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 18 });

      setupFullPipelineMocks({
        sourceReport,
        domainReport,
        patternReport,
      });

      await pipeline.investigate("Clear claim");

      // DA should have been called with default effort "high"
      const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
      expect(daCallArgs[4]).toBe("high");
    });

    it("should set deepReasoningActivated flag in verdict when escalated", async () => {
      const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 90 });
      const domainReport = makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 30 });
      const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 20 });
      const finalVerdict = makeFinalVerdict({ deepReasoningActivated: false });

      setupFullPipelineMocks({
        sourceReport,
        domainReport,
        patternReport,
        finalVerdict,
      });

      // Confidence gates mock should pass through the deepReasoningActivated override
      mockedEnforceConfidenceGates.mockImplementation((v) => v);

      const result = await pipeline.investigate("Contested claim 2");

      // The pipeline should have set deepReasoningActivated to true
      expect(mockedEnforceConfidenceGates).toHaveBeenCalledWith(
        expect.objectContaining({ deepReasoningActivated: true }),
      );
    });
  });

  describe("confidence gate enforcement", () => {
    it("should apply confidence gates to final verdict", async () => {
      const rawVerdict = makeFinalVerdict({ category: "likely-true", confidence: 60 });
      const gatedVerdict = makeFinalVerdict({ category: "partially-true", confidence: 60 });

      setupFullPipelineMocks({ finalVerdict: rawVerdict });
      mockedEnforceConfidenceGates.mockReturnValue(gatedVerdict);

      const result = await pipeline.investigate("Some claim");

      expect(mockedEnforceConfidenceGates).toHaveBeenCalledOnce();
      expect(result.verdict).toEqual(gatedVerdict);
    });
  });

  describe("database persistence", () => {
    it("should save results to database", async () => {
      setupFullPipelineMocks();

      await pipeline.investigate("PM Modi Rs 5000 claim");

      const repo = mockRepo;
      expect(repo.create).toHaveBeenCalledWith("PM Modi Rs 5000 claim", undefined, undefined);
      expect(repo.updateStatus).toHaveBeenCalledWith("test-investigation-id", "investigating");
      expect(repo.updateClassifierResult).toHaveBeenCalledOnce();
      expect(repo.updateSearchStrategy).toHaveBeenCalledOnce();
      expect(repo.updateAgentReports).toHaveBeenCalledOnce();
      expect(repo.updateChallengeReport).toHaveBeenCalledOnce();
      expect(repo.updateFinalVerdict).toHaveBeenCalledOnce();
    });

    it("should save investigation with telegram metadata", async () => {
      setupFullPipelineMocks();

      await pipeline.investigate("Test claim", {
        telegramChatId: "12345",
        telegramMessageId: "67890",
      });

      expect(mockRepo.create).toHaveBeenCalledWith("Test claim", "12345", "67890");
    });

    it("should save non-factual results to database", async () => {
      const greetingResult = makeClassifierResult({ category: "greeting" });
      mockedRunClassifier.mockResolvedValue({ result: greetingResult, costUsd: 0.01 });
      mockedHandleNonFactual.mockReturnValue({
        text: "Hello!",
        shouldInvestigate: false,
      });

      await pipeline.investigate("Hello");

      expect(mockRepo.create).toHaveBeenCalledOnce();
      expect(mockRepo.updateClassifierResult).toHaveBeenCalledOnce();
      expect(mockRepo.updateStatus).toHaveBeenCalledWith("test-investigation-id", "completed_non_factual");
    });
  });

  describe("status updates", () => {
    it("should call status updates in correct order", async () => {
      setupFullPipelineMocks();

      const stages: PipelineStage[] = [];
      const onStatusUpdate = vi.fn((stage: PipelineStage) => {
        stages.push(stage);
      });

      await pipeline.investigate("Test claim", { onStatusUpdate });

      expect(stages).toEqual([
        "planning",
        "searching",
        "analyzing",
        "challenging",
        "judging",
      ]);
    });

    it("should continue pipeline if status update callback throws", async () => {
      setupFullPipelineMocks();

      const onStatusUpdate = vi.fn().mockRejectedValue(new Error("Telegram error"));

      const result = await pipeline.investigate("Test claim", { onStatusUpdate });

      // Pipeline should still complete despite status update failure
      expect(result.verdict).toBeDefined();
    });
  });

  describe("error handling", () => {
    it("should propagate classifier error", async () => {
      mockedRunClassifier.mockRejectedValue(new Error("Classifier failed"));

      await expect(pipeline.investigate("Test")).rejects.toThrow("Classifier failed");
    });

    it("should propagate strategist error", async () => {
      mockedRunClassifier.mockResolvedValue({ result: makeClassifierResult(), costUsd: 0.01 });
      mockedRunStrategist.mockRejectedValue(new Error("Strategist failed"));

      await expect(pipeline.investigate("Test")).rejects.toThrow("Strategist failed");
    });

    it("should fail if all investigators fail", async () => {
      mockedRunClassifier.mockResolvedValue({ result: makeClassifierResult(), costUsd: 0.01 });
      mockedRunStrategist.mockResolvedValue({ strategy: makeSearchStrategy(), costUsd: 0.20 });
      mockedRunSourceVerification.mockRejectedValue(new Error("Failed"));
      mockedRunDomainExpertise.mockRejectedValue(new Error("Failed"));
      mockedRunPatternMatching.mockRejectedValue(new Error("Failed"));

      await expect(pipeline.investigate("Test")).rejects.toThrow(
        "All investigators failed",
      );
    });
  });

  describe("claim cache integration", () => {
    it("should return cached result on repeated claim", async () => {
      const { finalVerdict } = setupFullPipelineMocks();

      // First call — runs full pipeline
      const result1 = await pipeline.investigate("PM Modi Rs 5000 transfer");
      expect(result1.verdict).toEqual(finalVerdict);
      expect(result1.cached).toBeUndefined();
      expect(mockedRunClassifier).toHaveBeenCalledOnce();

      // Second call — same claim should return cached result
      const result2 = await pipeline.investigate("PM Modi Rs 5000 transfer");
      expect(result2.verdict).toEqual(finalVerdict);
      expect(result2.cached).toBe(true);
      expect(result2.totalCostUsd).toBe(0);
      expect(result2.investigationId).toBe("test-investigation-id");

      // Classifier should NOT have been called again
      expect(mockedRunClassifier).toHaveBeenCalledOnce();
    });

    it("should not cache non-factual results", async () => {
      const greetingResult = makeClassifierResult({ category: "greeting" });
      mockedRunClassifier.mockResolvedValue({ result: greetingResult, costUsd: 0.01 });
      mockedHandleNonFactual.mockReturnValue({
        text: "Hello!",
        shouldInvestigate: false,
      });

      await pipeline.investigate("Hello");
      await pipeline.investigate("Hello");

      // Classifier should have been called twice (no caching for non-factual)
      expect(mockedRunClassifier).toHaveBeenCalledTimes(2);
    });

    it("should accept external ClaimCache instance", async () => {
      const externalCache = new ClaimCache(5000);
      const pipelineWithCache = new InvestigationPipeline(
        mockClient,
        mockRegistry,
        mockRepo,
        externalCache,
      );

      setupFullPipelineMocks();
      await pipelineWithCache.investigate("Test claim");

      // External cache should have the entry
      const cached = externalCache.get("Test claim");
      expect(cached).not.toBeNull();
      expect(cached!.investigationId).toBe("test-investigation-id");
    });
  });
});
