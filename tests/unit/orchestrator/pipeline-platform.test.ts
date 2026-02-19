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
import { handleNonFactual } from "../../../src/agents/non-factual-handler.js";
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
    updateSourceUrl: vi.fn(),
    getRecent: vi.fn(),
  } as unknown as InvestigationRepository;
}

function setupFullPipelineMocks() {
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
  mockedEnforceConfidenceGates.mockReturnValue(finalVerdict);

  return { classifierResult, searchStrategy, finalVerdict };
}

// ── Tests ──────────────────────────────────────────────────────

describe("InvestigationPipeline platform-agnostic fields", () => {
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

  it("should accept platform-agnostic fields in InvestigateOptions", async () => {
    setupFullPipelineMocks();

    const result = await pipeline.investigate("Test claim", {
      platform: "whatsapp",
      platformChatId: "wa-chat-123",
      platformMessageId: "wa-msg-456",
    });

    expect(result.verdict).toBeDefined();
    expect(result.investigationId).toBe("test-investigation-id");
  });

  it("should pass platformChatId and platformMessageId to repo.create", async () => {
    setupFullPipelineMocks();

    await pipeline.investigate("Test claim", {
      platform: "telegram",
      platformChatId: "tg-12345",
      platformMessageId: "tg-67890",
    });

    expect(mockRepo.create).toHaveBeenCalledWith(
      "Test claim",
      "tg-12345",
      "tg-67890",
    );
  });

  it("should still work with no platform fields (backward compat)", async () => {
    setupFullPipelineMocks();

    const result = await pipeline.investigate("Test claim");

    expect(result.verdict).toBeDefined();
    expect(mockRepo.create).toHaveBeenCalledWith(
      "Test claim",
      undefined,
      undefined,
    );
  });

  it("should still work with legacy telegramChatId/telegramMessageId fields", async () => {
    setupFullPipelineMocks();

    const result = await pipeline.investigate("Test claim", {
      telegramChatId: "12345",
      telegramMessageId: "67890",
    });

    expect(result.verdict).toBeDefined();
    // Legacy fields should still be passed through to repo.create
    expect(mockRepo.create).toHaveBeenCalledWith(
      "Test claim",
      "12345",
      "67890",
    );
  });

  it("should prefer platform-agnostic fields over legacy telegram fields", async () => {
    setupFullPipelineMocks();

    const result = await pipeline.investigate("Test claim", {
      platform: "telegram",
      platformChatId: "new-chat-id",
      platformMessageId: "new-msg-id",
      telegramChatId: "old-chat-id",
      telegramMessageId: "old-msg-id",
    });

    expect(result.verdict).toBeDefined();
    // Platform-agnostic fields take precedence
    expect(mockRepo.create).toHaveBeenCalledWith(
      "Test claim",
      "new-chat-id",
      "new-msg-id",
    );
  });
});
