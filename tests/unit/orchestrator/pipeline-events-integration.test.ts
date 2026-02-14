import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClaudeClient } from "../../../src/services/claude-client.js";
import type { ToolRegistry } from "../../../src/tools/tool-registry.js";
import type { InvestigationRepository } from "../../../src/db/investigation-repository.js";
import type { PipelineStage } from "../../../src/bot/status-updater.js";
import {
  makeClassifierResult,
  makeSearchStrategy,
  makeAgentReport,
  makeChallengeReport,
  makeFinalVerdict,
} from "../../fixtures/index.js";
import {
  PipelineEventBus,
  type PipelineEvent,
  type PipelineEventKind,
} from "../../../src/orchestrator/pipeline-events.js";

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

// ── Helpers ───────────────────────────────────────────────────

function createMockRepo(): InvestigationRepository {
  return {
    create: vi.fn().mockReturnValue("test-inv-id"),
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

function setupFullPipelineMocks() {
  const classifierResult = makeClassifierResult();
  const searchStrategy = makeSearchStrategy();
  const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 70 });
  const domainReport = makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 75 });
  const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 72 });
  const challengeReport = makeChallengeReport();
  const finalVerdict = makeFinalVerdict();

  mockedRunClassifier.mockResolvedValue({ result: classifierResult, costUsd: 0.01 });
  mockedRunStrategist.mockResolvedValue({ strategy: searchStrategy, costUsd: 0.20 });
  mockedRunSourceVerification.mockResolvedValue({ report: sourceReport, costUsd: 0.35 });
  mockedRunDomainExpertise.mockResolvedValue({ report: domainReport, costUsd: 0.30 });
  mockedRunPatternMatching.mockResolvedValue({ report: patternReport, costUsd: 0.32 });
  mockedRunDevilsAdvocate.mockResolvedValue({ report: challengeReport, costUsd: 0.50 });
  mockedRunJudge.mockResolvedValue({ verdict: finalVerdict, costUsd: 0.80 });
  mockedEnforceConfidenceGates.mockReturnValue(finalVerdict);

  return { classifierResult, searchStrategy, finalVerdict, challengeReport };
}

// ── Tests ─────────────────────────────────────────────────────

describe("Pipeline EventBus Integration", () => {
  let mockRepo: InvestigationRepository;
  let eventBus: PipelineEventBus;

  beforeEach(() => {
    vi.clearAllMocks();
    mockRepo = createMockRepo();
    eventBus = new PipelineEventBus();
  });

  it("should emit classifier:start and classifier:complete events", async () => {
    setupFullPipelineMocks();
    const pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
      undefined,
      eventBus,
    );

    const events: PipelineEvent[] = [];
    eventBus.subscribe("test-inv-id", (e) => events.push(e));

    await pipeline.investigate("Test claim");

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("classifier:start");
    expect(kinds).toContain("classifier:complete");

    // classifier:start should come before classifier:complete
    const startIdx = kinds.indexOf("classifier:start");
    const completeIdx = kinds.indexOf("classifier:complete");
    expect(startIdx).toBeLessThan(completeIdx);

    // classifier:complete should include result and cost
    const completeEvent = events.find((e) => e.kind === "classifier:complete");
    expect(completeEvent).toBeDefined();
    if (completeEvent?.kind === "classifier:complete") {
      expect(completeEvent.result).toBeDefined();
      expect(completeEvent.costUsd).toBe(0.01);
    }
  });

  it("should emit all pipeline events in correct order for factual claim", async () => {
    setupFullPipelineMocks();
    const pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
      undefined,
      eventBus,
    );

    const events: PipelineEvent[] = [];
    eventBus.subscribe("test-inv-id", (e) => events.push(e));

    await pipeline.investigate("Test claim");

    const kinds = events.map((e) => e.kind);

    // Verify expected order of events
    const expectedOrder: PipelineEventKind[] = [
      "pipeline:start",
      "classifier:start",
      "classifier:complete",
      "strategist:start",
      "strategist:complete",
      "investigators:start",
      // investigator:complete events (3 of them, order may vary)
      // da:start, da:complete
      // judge:start, judge:complete
      // pipeline:complete
    ];

    // Check the first 6 events are in order
    expect(kinds[0]).toBe("pipeline:start");
    expect(kinds[1]).toBe("classifier:start");
    expect(kinds[2]).toBe("classifier:complete");
    expect(kinds[3]).toBe("strategist:start");
    expect(kinds[4]).toBe("strategist:complete");
    expect(kinds[5]).toBe("investigators:start");

    // After investigators:start, there should be 3 investigator:complete events
    const invCompletes = events.filter((e) => e.kind === "investigator:complete");
    expect(invCompletes).toHaveLength(3);

    // DA and Judge events should follow investigators
    const daStartIdx = kinds.indexOf("da:start");
    const daCompleteIdx = kinds.indexOf("da:complete");
    const judgeStartIdx = kinds.indexOf("judge:start");
    const judgeCompleteIdx = kinds.indexOf("judge:complete");
    const pipeCompleteIdx = kinds.indexOf("pipeline:complete");

    expect(daStartIdx).toBeGreaterThan(kinds.lastIndexOf("investigator:complete"));
    expect(daCompleteIdx).toBeGreaterThan(daStartIdx);
    expect(judgeStartIdx).toBeGreaterThan(daCompleteIdx);
    expect(judgeCompleteIdx).toBeGreaterThan(judgeStartIdx);
    expect(pipeCompleteIdx).toBeGreaterThan(judgeCompleteIdx);

    // pipeline:complete should include verdict and totals
    const pipeComplete = events.find((e) => e.kind === "pipeline:complete");
    if (pipeComplete?.kind === "pipeline:complete") {
      expect(pipeComplete.verdict).toBeDefined();
      expect(pipeComplete.totalCostUsd).toBeGreaterThan(0);
      expect(pipeComplete.durationMs).toBeGreaterThanOrEqual(0);
    }
  });

  it("should emit pipeline:error on agent failure", async () => {
    mockedRunClassifier.mockRejectedValue(new Error("Classifier crashed"));
    const pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
      undefined,
      eventBus,
    );

    const events: PipelineEvent[] = [];
    eventBus.subscribe("test-inv-id", (e) => events.push(e));

    await expect(pipeline.investigate("Test claim")).rejects.toThrow("Classifier crashed");

    const kinds = events.map((e) => e.kind);
    expect(kinds).toContain("pipeline:start");
    expect(kinds).toContain("classifier:start");
    expect(kinds).toContain("pipeline:error");

    const errorEvent = events.find((e) => e.kind === "pipeline:error");
    if (errorEvent?.kind === "pipeline:error") {
      expect(errorEvent.error).toBe("Classifier crashed");
      expect(errorEvent.stage).toBe("classifier");
    }
  });

  it("should still call onStatusUpdate callback", async () => {
    setupFullPipelineMocks();
    const pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
      undefined,
      eventBus,
    );

    const stages: PipelineStage[] = [];
    const onStatusUpdate = vi.fn((stage: PipelineStage) => {
      stages.push(stage);
    });

    await pipeline.investigate("Test claim", { onStatusUpdate });

    // Existing status update callback should still fire
    expect(stages).toEqual([
      "planning",
      "searching",
      "analyzing",
      "challenging",
      "judging",
    ]);
  });

  it("should work without event bus", async () => {
    setupFullPipelineMocks();
    // No event bus — 4-arg constructor (backward compat)
    const pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
    );

    const result = await pipeline.investigate("Test claim");

    expect(result.verdict).toBeDefined();
    expect(result.investigationId).toBe("test-inv-id");
  });

  it("should emit disagreement:detected when spread exceeds threshold", async () => {
    const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 90 });
    const domainReport = makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 40 });
    const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 50 });
    const finalVerdict = makeFinalVerdict();

    mockedRunClassifier.mockResolvedValue({ result: makeClassifierResult(), costUsd: 0.01 });
    mockedRunStrategist.mockResolvedValue({ strategy: makeSearchStrategy(), costUsd: 0.20 });
    mockedRunSourceVerification.mockResolvedValue({ report: sourceReport, costUsd: 0.35 });
    mockedRunDomainExpertise.mockResolvedValue({ report: domainReport, costUsd: 0.30 });
    mockedRunPatternMatching.mockResolvedValue({ report: patternReport, costUsd: 0.32 });
    mockedRunDevilsAdvocate.mockResolvedValue({ report: makeChallengeReport(), costUsd: 0.50 });
    mockedRunJudge.mockResolvedValue({ verdict: finalVerdict, costUsd: 0.80 });
    mockedEnforceConfidenceGates.mockReturnValue(finalVerdict);

    const pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
      undefined,
      eventBus,
    );

    const events: PipelineEvent[] = [];
    eventBus.subscribe("test-inv-id", (e) => events.push(e));

    await pipeline.investigate("Contested claim");

    const disagreementEvent = events.find((e) => e.kind === "disagreement:detected");
    expect(disagreementEvent).toBeDefined();
    if (disagreementEvent?.kind === "disagreement:detected") {
      expect(disagreementEvent.spread).toBe(50); // 90 - 40
      expect(disagreementEvent.confidenceScores).toEqual([90, 40, 50]);
    }

    // DA should get effortLevel "max" in event
    const daStartEvent = events.find((e) => e.kind === "da:start");
    if (daStartEvent?.kind === "da:start") {
      expect(daStartEvent.effortLevel).toBe("max");
    }
  });

  it("should emit pipeline:error with correct stage on strategist failure", async () => {
    mockedRunClassifier.mockResolvedValue({ result: makeClassifierResult(), costUsd: 0.01 });
    mockedRunStrategist.mockRejectedValue(new Error("Strategist timeout"));

    const pipeline = new InvestigationPipeline(
      {} as ClaudeClient,
      {} as ToolRegistry,
      mockRepo,
      undefined,
      eventBus,
    );

    const events: PipelineEvent[] = [];
    eventBus.subscribe("test-inv-id", (e) => events.push(e));

    await expect(pipeline.investigate("Test")).rejects.toThrow("Strategist timeout");

    const errorEvent = events.find((e) => e.kind === "pipeline:error");
    if (errorEvent?.kind === "pipeline:error") {
      expect(errorEvent.stage).toBe("strategist");
    }
  });
});
