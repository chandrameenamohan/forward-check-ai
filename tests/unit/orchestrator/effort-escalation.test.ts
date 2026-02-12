import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ClaudeClient } from "../../../src/services/claude-client.js";
import type { ToolRegistry } from "../../../src/tools/tool-registry.js";
import type { InvestigationRepository } from "../../../src/db/investigation-repository.js";
import type { ClassifierResult } from "../../../src/schemas/classifier-result.js";
import type { SearchStrategy } from "../../../src/schemas/search-strategy.js";
import type { AgentReport } from "../../../src/schemas/agent-report.js";
import type { ChallengeReport } from "../../../src/schemas/challenge-report.js";
import type { FinalVerdict } from "../../../src/schemas/final-verdict.js";

// ── Test Fixtures ──────────────────────────────────────────────

function makeClassifierResult(): ClassifierResult {
  return {
    category: "factual_claim",
    extractedClaim: "Test claim for escalation",
    isCompound: false,
    domain: "geopolitics",
    language: "en",
    urgency: "high",
    reasoning: "This is a factual claim.",
  };
}

function makeSearchStrategy(): SearchStrategy {
  return {
    claimCharacteristics: {
      type: "authority_claim",
      suspectedPattern: "authority_impersonation",
      verifiabilityAssessment: "Verifiable through official sources",
    },
    investigatorGuidance: {
      sourceVerification: {
        targetQueries: ["query1", "query2"],
        prioritySources: ["source.com"],
        lookFor: "Official sources",
      },
      domainExpertise: {
        targetQueries: ["query3", "query4"],
        prioritySources: ["expert.com"],
        lookFor: "Domain data",
      },
      patternMatching: {
        targetQueries: ["query5", "query6"],
        prioritySources: ["factcheck.com"],
        lookFor: "Existing debunks",
      },
    },
    falsificationCriteria: {
      whatWouldProveTrue: ["Evidence A"],
      whatWouldProveFalse: ["Evidence B"],
    },
    thinkingExcerpt: "Strategist thinking...",
  };
}

function makeAgentReport(overrides: Partial<AgentReport> = {}): AgentReport {
  return {
    agentRole: "source_verification",
    summary: "Summary of findings.",
    findings: [
      {
        claim: "Test claim",
        assessment: "contradicted",
        confidence: 80,
        sources: [
          {
            url: "https://example.com",
            title: "Example Source",
            credibility: "high",
            relevantSnippet: "Relevant information",
          },
        ],
      },
    ],
    overallAssessment: "Overall assessment.",
    confidenceScore: 50,
    ...overrides,
  };
}

function makeChallengeReport(): ChallengeReport {
  return {
    challenges: [
      {
        targetAgent: "source_verification",
        claim: "Test challenge",
        challenge: "Counter-argument attempt",
        severity: "minor",
        evidence: "Challenge evidence",
      },
    ],
    overallAssessment: "Consensus is strong.",
    suggestedConfidenceAdjustment: -5,
    counterArgumentSucceeded: false,
    counterArgumentSummary: "Counter-argument failed.",
    thinkingExcerpt: "DA thinking...",
  };
}

function makeFinalVerdict(overrides: Partial<FinalVerdict> = {}): FinalVerdict {
  return {
    category: "likely-false",
    confidence: 15,
    confidenceDecomposition: {
      evidenceStrength: 80,
      sourceReliability: 85,
      claimComplexity: 70,
      counterArgumentResilience: 90,
    },
    summary: "Verdict summary.",
    reasoning: "Verdict reasoning.",
    manipulationTechniques: [],
    keyFindings: ["Finding 1"],
    sources: [{ url: "https://example.com", title: "Source", relevance: "Primary" }],
    whatWouldChangeMyMind: "New evidence",
    devilsAdvocateOutcome: "counter_argument_failed",
    deepReasoningActivated: false,
    thinkingSummary: "Judge thinking...",
    ...overrides,
  };
}

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

// ── Helpers ────────────────────────────────────────────────────

function createMockRepo(): InvestigationRepository {
  return {
    create: vi.fn().mockReturnValue("test-escalation-id"),
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

function setupMocks(investigatorConfidences: [number, number, number]) {
  const sourceReport = makeAgentReport({
    agentRole: "source_verification",
    confidenceScore: investigatorConfidences[0],
  });
  const domainReport = makeAgentReport({
    agentRole: "domain_expertise",
    confidenceScore: investigatorConfidences[1],
  });
  const patternReport = makeAgentReport({
    agentRole: "pattern_matching",
    confidenceScore: investigatorConfidences[2],
  });
  const finalVerdict = makeFinalVerdict({ deepReasoningActivated: false });

  mockedRunClassifier.mockResolvedValue({ result: makeClassifierResult(), costUsd: 0.01 });
  mockedRunStrategist.mockResolvedValue({ strategy: makeSearchStrategy(), costUsd: 0.20 });
  mockedRunSourceVerification.mockResolvedValue({ report: sourceReport, costUsd: 0.10 });
  mockedRunDomainExpertise.mockResolvedValue({ report: domainReport, costUsd: 0.10 });
  mockedRunPatternMatching.mockResolvedValue({ report: patternReport, costUsd: 0.10 });
  mockedRunDevilsAdvocate.mockResolvedValue({ report: makeChallengeReport(), costUsd: 0.50 });
  mockedRunJudge.mockResolvedValue({ verdict: finalVerdict, costUsd: 0.80 });
  mockedEnforceConfidenceGates.mockImplementation((v) => v);

  return { sourceReport, domainReport, patternReport, finalVerdict };
}

// ── Tests ──────────────────────────────────────────────────────

describe("Dynamic effort escalation", () => {
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

  it("should detect disagreement when confidence spread > 30", async () => {
    // Scores: 85, 40, 30 → spread = 55 (> 30 threshold)
    setupMocks([85, 40, 30]);

    await pipeline.investigate("Highly contested claim");

    // DA should have been called with "max" effort (5th argument)
    expect(mockedRunDevilsAdvocate).toHaveBeenCalledOnce();
    const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
    expect(daCallArgs[4]).toBe("max");
  });

  it("should escalate DA effort to max when disagreement detected", async () => {
    // Scores: 90, 20, 50 → spread = 70 (> 30 threshold)
    setupMocks([90, 20, 50]);

    await pipeline.investigate("Another contested claim");

    const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
    // 5th positional argument is the effortLevel
    expect(daCallArgs[4]).toBe("max");
  });

  it("should not escalate when investigators agree", async () => {
    // Scores: 22, 25, 18 → spread = 7 (< 30 threshold)
    setupMocks([22, 25, 18]);

    await pipeline.investigate("Clear consensus claim");

    const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
    // 5th positional argument should be default "high"
    expect(daCallArgs[4]).toBe("high");
  });

  it("should set deepReasoningActivated flag in verdict", async () => {
    // Scores: 80, 30, 25 → spread = 55 (> 30 threshold)
    setupMocks([80, 30, 25]);

    await pipeline.investigate("Contested claim with flag");

    // The pipeline overrides deepReasoningActivated to true before confidence gates
    expect(mockedEnforceConfidenceGates).toHaveBeenCalledWith(
      expect.objectContaining({ deepReasoningActivated: true }),
    );

    // And the returned verdict should also have the flag
    const result = await pipeline.investigate("Contested claim again");
    expect(result.verdict?.deepReasoningActivated).toBe(true);
  });

  it("should not set deepReasoningActivated when investigators agree", async () => {
    // Scores: 50, 55, 60 → spread = 10 (< 30 threshold)
    setupMocks([50, 55, 60]);

    const result = await pipeline.investigate("Agreed claim");

    expect(mockedEnforceConfidenceGates).toHaveBeenCalledWith(
      expect.objectContaining({ deepReasoningActivated: false }),
    );
    expect(result.verdict?.deepReasoningActivated).toBe(false);
  });

  it("should handle exact boundary (spread = 30) without escalation", async () => {
    // Scores: 50, 70, 80 → spread = 30 (= threshold, NOT > 30)
    setupMocks([50, 70, 80]);

    await pipeline.investigate("Boundary claim");

    const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
    expect(daCallArgs[4]).toBe("high");

    expect(mockedEnforceConfidenceGates).toHaveBeenCalledWith(
      expect.objectContaining({ deepReasoningActivated: false }),
    );
  });

  it("should handle spread = 31 as escalation trigger", async () => {
    // Scores: 50, 70, 81 → spread = 31 (> 30 threshold)
    setupMocks([50, 70, 81]);

    await pipeline.investigate("Just-above-boundary claim");

    const daCallArgs = mockedRunDevilsAdvocate.mock.calls[0]!;
    expect(daCallArgs[4]).toBe("max");

    expect(mockedEnforceConfidenceGates).toHaveBeenCalledWith(
      expect.objectContaining({ deepReasoningActivated: true }),
    );
  });
});
