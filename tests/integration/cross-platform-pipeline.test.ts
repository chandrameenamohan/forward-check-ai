import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { existsSync, unlinkSync } from "node:fs";
import type { ClaudeClient } from "../../src/services/claude-client.js";
import type { ToolRegistry } from "../../src/tools/tool-registry.js";
import {
  makeClassifierResult,
  makeSearchStrategy,
  makeAgentReport,
  makeChallengeReport,
  makeFinalVerdict,
} from "../fixtures/index.js";

// ── Mock Agent Modules ─────────────────────────────────────────

vi.mock("../../src/agents/classifier-agent.js", () => ({
  runClassifier: vi.fn(),
}));

vi.mock("../../src/agents/non-factual-handler.js", () => ({
  handleNonFactual: vi.fn(),
}));

vi.mock("../../src/agents/strategist-agent.js", () => ({
  runStrategist: vi.fn(),
}));

vi.mock("../../src/agents/investigators/source-verification-agent.js", () => ({
  runSourceVerification: vi.fn(),
}));

vi.mock("../../src/agents/investigators/domain-expertise-agent.js", () => ({
  runDomainExpertise: vi.fn(),
}));

vi.mock("../../src/agents/investigators/pattern-matching-agent.js", () => ({
  runPatternMatching: vi.fn(),
}));

vi.mock("../../src/agents/devils-advocate-agent.js", () => ({
  runDevilsAdvocate: vi.fn(),
}));

vi.mock("../../src/agents/judge-agent.js", () => ({
  runJudge: vi.fn(),
}));

vi.mock("../../src/formatter/confidence-gates.js", () => ({
  enforceConfidenceGates: vi.fn(),
  detectConfidenceMismatch: vi.fn().mockReturnValue(false),
}));

// ── Import after mocks ────────────────────────────────────────

import { runClassifier } from "../../src/agents/classifier-agent.js";
import { runStrategist } from "../../src/agents/strategist-agent.js";
import { runSourceVerification } from "../../src/agents/investigators/source-verification-agent.js";
import { runDomainExpertise } from "../../src/agents/investigators/domain-expertise-agent.js";
import { runPatternMatching } from "../../src/agents/investigators/pattern-matching-agent.js";
import { runDevilsAdvocate } from "../../src/agents/devils-advocate-agent.js";
import { runJudge } from "../../src/agents/judge-agent.js";
import { enforceConfidenceGates } from "../../src/formatter/confidence-gates.js";
import { InvestigationPipeline } from "../../src/orchestrator/pipeline.js";
import { createDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { InvestigationRepository } from "../../src/db/investigation-repository.js";

const mockedRunClassifier = vi.mocked(runClassifier);
const mockedRunStrategist = vi.mocked(runStrategist);
const mockedRunSourceVerification = vi.mocked(runSourceVerification);
const mockedRunDomainExpertise = vi.mocked(runDomainExpertise);
const mockedRunPatternMatching = vi.mocked(runPatternMatching);
const mockedRunDevilsAdvocate = vi.mocked(runDevilsAdvocate);
const mockedRunJudge = vi.mocked(runJudge);
const mockedEnforceConfidenceGates = vi.mocked(enforceConfidenceGates);

// ── Helpers ────────────────────────────────────────────────────

function cleanupDb(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const filePath = dbPath + suffix;
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

function setupDeterministicMocks() {
  const classifierResult = makeClassifierResult({
    category: "factual_claim",
    extractedClaim: "WHO says green tea cures cancer",
    domain: "public_health",
  });
  const searchStrategy = makeSearchStrategy();
  const sourceReport = makeAgentReport({ agentRole: "source_verification", confidenceScore: 25 });
  const domainReport = makeAgentReport({ agentRole: "domain_expertise", confidenceScore: 30 });
  const patternReport = makeAgentReport({ agentRole: "pattern_matching", confidenceScore: 20 });
  const challengeReport = makeChallengeReport();
  const finalVerdict = makeFinalVerdict({
    category: "likely-false",
    confidence: 22,
    summary: "No credible evidence supports this claim.",
  });

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

describe("Cross-platform pipeline", () => {
  const dbPath = join(tmpdir(), `forwardcheck-cross-platform-${randomUUID()}.db`);
  let repo: InvestigationRepository;
  let pipeline: InvestigationPipeline;
  let mockClient: ClaudeClient;
  let mockRegistry: ToolRegistry;

  beforeEach(() => {
    vi.clearAllMocks();

    const db = createDatabase(dbPath);
    runMigrations(db);
    repo = new InvestigationRepository(db);
    mockClient = {} as ClaudeClient;
    mockRegistry = {} as ToolRegistry;
    pipeline = new InvestigationPipeline(mockClient, mockRegistry, repo);
  });

  afterEach(() => {
    cleanupDb(dbPath);
  });

  it("should produce identical verdicts across telegram, whatsapp, and web platforms", async () => {
    const claim = "WHO says green tea cures cancer";
    const platforms = ["telegram", "whatsapp", "web"] as const;
    const results = [];

    for (const platform of platforms) {
      // Fresh pipeline per platform to avoid ClaimCache returning cached results
      const freshPipeline = new InvestigationPipeline(mockClient, mockRegistry, repo);
      vi.clearAllMocks();
      const { finalVerdict } = setupDeterministicMocks();

      const result = await freshPipeline.investigate(claim, {
        platform,
        platformChatId: `${platform}-chat-001`,
        platformMessageId: `${platform}-msg-001`,
      });

      results.push({ platform, result, expectedVerdict: finalVerdict });
    }

    // All three should produce the same verdict category and confidence
    const [telegramResult, whatsappResult, webResult] = results;

    expect(telegramResult!.result.verdict!.category).toBe("likely-false");
    expect(whatsappResult!.result.verdict!.category).toBe("likely-false");
    expect(webResult!.result.verdict!.category).toBe("likely-false");

    expect(telegramResult!.result.verdict!.confidence).toBe(22);
    expect(whatsappResult!.result.verdict!.confidence).toBe(22);
    expect(webResult!.result.verdict!.confidence).toBe(22);

    // Verdicts should be structurally identical
    expect(telegramResult!.result.verdict).toEqual(whatsappResult!.result.verdict);
    expect(whatsappResult!.result.verdict).toEqual(webResult!.result.verdict);
  }, 30_000);

  it("should store correct source_platform in database for each channel", async () => {
    const claim = "WHO says green tea cures cancer";
    const platformConfigs = [
      { platform: "telegram" as const, chatId: "tg-chat-100", messageId: "tg-msg-200" },
      { platform: "whatsapp" as const, chatId: "wa-chat-300", messageId: "wa-msg-400" },
      { platform: "web" as const, chatId: "web-session-500", messageId: "web-req-600" },
    ];

    const investigationIds: string[] = [];

    for (const config of platformConfigs) {
      // Fresh pipeline per platform to avoid ClaimCache returning cached results
      const freshPipeline = new InvestigationPipeline(mockClient, mockRegistry, repo);
      vi.clearAllMocks();
      setupDeterministicMocks();

      const result = await freshPipeline.investigate(claim, {
        platform: config.platform,
        platformChatId: config.chatId,
        platformMessageId: config.messageId,
      });

      investigationIds.push(result.investigationId);
    }

    // Verify each DB record has correct platform fields
    for (let i = 0; i < platformConfigs.length; i++) {
      const config = platformConfigs[i]!;
      const id = investigationIds[i]!;
      const investigation = repo.getById(id);

      expect(investigation).not.toBeNull();
      expect(investigation!.source_platform).toBe(config.platform);
      expect(investigation!.platform_chat_id).toBe(config.chatId);
      expect(investigation!.platform_message_id).toBe(config.messageId);
    }

    // Telegram record should also populate legacy telegram columns
    const telegramInvestigation = repo.getById(investigationIds[0]!);
    expect(telegramInvestigation!.telegram_chat_id).toBe("tg-chat-100");
    expect(telegramInvestigation!.telegram_message_id).toBe("tg-msg-200");

    // WhatsApp and web records should NOT populate legacy telegram columns
    const whatsappInvestigation = repo.getById(investigationIds[1]!);
    expect(whatsappInvestigation!.telegram_chat_id).toBeNull();
    expect(whatsappInvestigation!.telegram_message_id).toBeNull();

    const webInvestigation = repo.getById(investigationIds[2]!);
    expect(webInvestigation!.telegram_chat_id).toBeNull();
    expect(webInvestigation!.telegram_message_id).toBeNull();
  }, 30_000);
});
