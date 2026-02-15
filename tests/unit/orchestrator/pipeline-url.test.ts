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
import {
  PipelineEventBus,
  type PipelineEvent,
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

// Mock the URL extractor
vi.mock("../../../src/services/url-extractor.js", () => ({
  enrichMessageWithUrl: vi.fn(),
  detectUrl: vi.fn(),
  fetchUrlContent: vi.fn(),
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
import { detectUrl, enrichMessageWithUrl } from "../../../src/services/url-extractor.js";
import { InvestigationPipeline } from "../../../src/orchestrator/pipeline.js";

const mockedRunClassifier = vi.mocked(runClassifier);
const mockedRunStrategist = vi.mocked(runStrategist);
const mockedRunSourceVerification = vi.mocked(runSourceVerification);
const mockedRunDomainExpertise = vi.mocked(runDomainExpertise);
const mockedRunPatternMatching = vi.mocked(runPatternMatching);
const mockedRunDevilsAdvocate = vi.mocked(runDevilsAdvocate);
const mockedRunJudge = vi.mocked(runJudge);
const mockedEnforceConfidenceGates = vi.mocked(enforceConfidenceGates);
const mockedDetectUrl = vi.mocked(detectUrl);
const mockedEnrichMessageWithUrl = vi.mocked(enrichMessageWithUrl);

// ── Helper: create mock dependencies ───────────────────────────

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

describe("InvestigationPipeline — URL pre-processing", () => {
  let pipeline: InvestigationPipeline;
  let mockClient: ClaudeClient;
  let mockRegistry: ToolRegistry;
  let mockRepo: InvestigationRepository;

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {} as ClaudeClient;
    mockRegistry = {} as ToolRegistry;
    mockRepo = createMockRepo();
    pipeline = new InvestigationPipeline(mockClient, mockRegistry, mockRepo);
  });

  it("should detect URL and enrich message before classification", async () => {
    const enrichedText = `[Article from example.com]
Title: Test Article
Article content:
This article claims the earth is flat.`;

    mockedDetectUrl.mockReturnValue("https://example.com/article");
    mockedEnrichMessageWithUrl.mockResolvedValue({
      enrichedMessage: enrichedText,
      sourceUrl: "https://example.com/article",
      title: "Test Article",
      wordCount: 50,
    });

    setupFullPipelineMocks();

    await pipeline.investigate("https://example.com/article");

    // enrichMessageWithUrl should have been called with the raw message
    expect(mockedEnrichMessageWithUrl).toHaveBeenCalledWith("https://example.com/article");
  });

  it("should pass enriched message to classifier when URL present", async () => {
    const enrichedText = `[Article from example.com]
Title: Test Article

Article content:
Scientists discover new species in the Amazon.`;

    mockedDetectUrl.mockReturnValue("https://example.com/article");
    mockedEnrichMessageWithUrl.mockResolvedValue({
      enrichedMessage: enrichedText,
      sourceUrl: "https://example.com/article",
      title: "Test Article",
      wordCount: 30,
    });

    setupFullPipelineMocks();

    await pipeline.investigate("Check this: https://example.com/article");

    // Classifier should receive the enriched message, NOT the raw URL
    expect(mockedRunClassifier).toHaveBeenCalledWith(enrichedText, mockClient);
  });

  it("should work unchanged for plain text messages", async () => {
    // No URL detected — detectUrl returns null
    mockedDetectUrl.mockReturnValue(null);
    mockedEnrichMessageWithUrl.mockResolvedValue(null);

    setupFullPipelineMocks();

    const plainText = "PM Modi announced Rs 5000 direct transfer";
    await pipeline.investigate(plainText);

    // Classifier should receive the original plain text
    expect(mockedRunClassifier).toHaveBeenCalledWith(plainText, mockClient);

    // updateSourceUrl should NOT have been called
    expect(mockRepo.updateSourceUrl).not.toHaveBeenCalled();
  });

  it("should store source_url in database when URL detected", async () => {
    mockedDetectUrl.mockReturnValue("https://example.com/news/123");
    mockedEnrichMessageWithUrl.mockResolvedValue({
      enrichedMessage: "[Article from example.com]\nTitle: Test\n\nContent here",
      sourceUrl: "https://example.com/news/123",
      title: "Test",
      wordCount: 10,
    });

    setupFullPipelineMocks();

    await pipeline.investigate("https://example.com/news/123");

    // source_url should be saved to the database
    expect(mockRepo.updateSourceUrl).toHaveBeenCalledWith(
      "test-investigation-id",
      "https://example.com/news/123",
    );
  });

  it("should handle URL extraction failure gracefully and fall back to raw message", async () => {
    // detectUrl finds a URL, but enrichMessageWithUrl returns null on failure
    mockedDetectUrl.mockReturnValue("https://broken-url.example.com/article");
    mockedEnrichMessageWithUrl.mockResolvedValue(null);

    setupFullPipelineMocks();

    const rawMessage = "https://broken-url.example.com/article";
    await pipeline.investigate(rawMessage);

    // Classifier should receive the raw message as fallback
    expect(mockedRunClassifier).toHaveBeenCalledWith(rawMessage, mockClient);

    // No source URL should be stored
    expect(mockRepo.updateSourceUrl).not.toHaveBeenCalled();
  });
});

// ── URL fetch SSE event tests ───────────────────────────────────

describe("InvestigationPipeline — URL fetch SSE events", () => {
  let pipeline: InvestigationPipeline;
  let mockClient: ClaudeClient;
  let mockRegistry: ToolRegistry;
  let mockRepo: InvestigationRepository;
  let eventBus: PipelineEventBus;
  let emittedEvents: PipelineEvent[];

  beforeEach(() => {
    vi.clearAllMocks();
    mockClient = {} as ClaudeClient;
    mockRegistry = {} as ToolRegistry;
    mockRepo = createMockRepo();
    eventBus = new PipelineEventBus({ historyTtlMs: 60_000, cleanupIntervalMs: 60_000 });
    emittedEvents = [];
    eventBus.subscribe("test-investigation-id", (event) => {
      emittedEvents.push(event);
    });
    pipeline = new InvestigationPipeline(mockClient, mockRegistry, mockRepo, undefined, eventBus);
  });

  it("should emit url-fetch:start and url-fetch:complete events for URL input", async () => {
    mockedDetectUrl.mockReturnValue("https://example.com/article");
    mockedEnrichMessageWithUrl.mockResolvedValue({
      enrichedMessage: "[Article from example.com]\nTitle: Test Article\n\nSome article content here with facts.",
      sourceUrl: "https://example.com/article",
      title: "Test Article",
      wordCount: 250,
    });

    setupFullPipelineMocks();

    await pipeline.investigate("https://example.com/article");

    const fetchStartEvents = emittedEvents.filter((e) => e.kind === "url-fetch:start");
    const fetchCompleteEvents = emittedEvents.filter((e) => e.kind === "url-fetch:complete");

    expect(fetchStartEvents).toHaveLength(1);
    expect(fetchCompleteEvents).toHaveLength(1);

    const startEvent = fetchStartEvents[0]!;
    expect(startEvent).toMatchObject({
      kind: "url-fetch:start",
      investigationId: "test-investigation-id",
      url: "https://example.com/article",
    });

    const completeEvent = fetchCompleteEvents[0]!;
    expect(completeEvent).toMatchObject({
      kind: "url-fetch:complete",
      investigationId: "test-investigation-id",
      url: "https://example.com/article",
      title: "Test Article",
      wordCount: 250,
    });

    // url-fetch events should come BEFORE classifier:start
    const startIdx = emittedEvents.indexOf(startEvent);
    const completeIdx = emittedEvents.indexOf(completeEvent);
    const classifierStartIdx = emittedEvents.findIndex((e) => e.kind === "classifier:start");
    expect(startIdx).toBeLessThan(classifierStartIdx);
    expect(completeIdx).toBeLessThan(classifierStartIdx);
  });

  it("should not emit url-fetch events for plain text input", async () => {
    mockedDetectUrl.mockReturnValue(null);
    mockedEnrichMessageWithUrl.mockResolvedValue(null);

    setupFullPipelineMocks();

    await pipeline.investigate("PM Modi announced Rs 5000 direct transfer");

    const fetchStartEvents = emittedEvents.filter((e) => e.kind === "url-fetch:start");
    const fetchCompleteEvents = emittedEvents.filter((e) => e.kind === "url-fetch:complete");

    expect(fetchStartEvents).toHaveLength(0);
    expect(fetchCompleteEvents).toHaveLength(0);
  });
});
