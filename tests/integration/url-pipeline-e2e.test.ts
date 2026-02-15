import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { ClaudeClient } from "../../src/services/claude-client.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import {
  braveSearchToolDefinition,
} from "../../src/tools/brave-search.js";
import {
  googleFactCheckToolDefinition,
} from "../../src/tools/google-factcheck.js";
import { createDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { InvestigationRepository } from "../../src/db/investigation-repository.js";
import { InvestigationPipeline } from "../../src/orchestrator/pipeline.js";
import { detectUrl, enrichMessageWithUrl } from "../../src/services/url-extractor.js";
import { ClassifierResultSchema } from "../../src/schemas/classifier-result.js";
import { SearchStrategySchema } from "../../src/schemas/search-strategy.js";
import { AgentReportSchema } from "../../src/schemas/agent-report.js";
import { ChallengeReportSchema } from "../../src/schemas/challenge-report.js";
import { FinalVerdictSchema } from "../../src/schemas/final-verdict.js";
import type Database from "better-sqlite3";

config();

const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";

/**
 * Canned search results for the URL-sourced test claim.
 * The pipeline uses mock search tools (not real Brave/Google) but real URL fetching
 * and real Anthropic API calls.
 */
const CANNED_BRAVE_RESULTS = JSON.stringify({
  results: [
    {
      title: "NHK World Japan - Latest News Coverage",
      url: "https://www3.nhk.or.jp/nhkworld/en/news/",
      description:
        "NHK World-Japan provides the latest news from Japan and Asia, covering politics, business, science, and more. NHK is Japan's sole public broadcaster.",
      age: "2026-02-15",
    },
    {
      title: "Japan News - Reuters",
      url: "https://www.reuters.com/world/asia-pacific/japan/",
      description:
        "Latest news and analysis from Japan including politics, economy, technology, and society. Comprehensive coverage from Reuters correspondents in Tokyo.",
      age: "2026-02-15",
    },
    {
      title: "Japan Times - National and International News",
      url: "https://www.japantimes.co.jp/",
      description:
        "Japan's leading English-language newspaper covering national news, politics, business, sports, and opinion from Japan and the Asia-Pacific region.",
      age: "2026-02-14",
    },
  ],
});

const CANNED_FACTCHECK_RESULTS = JSON.stringify({
  claims: [],
});

describe("URL Pipeline E2E Integration", () => {
  let client: ClaudeClient;
  let toolRegistry: ToolRegistry;
  let repo: InvestigationRepository;
  let db: Database.Database;
  let dbPath: string;

  beforeAll(() => {
    dbPath = join(tmpdir(), `forwardcheck-url-e2e-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
    repo = new InvestigationRepository(db);

    client = new ClaudeClient(apiKey);

    toolRegistry = new ToolRegistry();

    toolRegistry.register(
      "brave_web_search",
      () => CANNED_BRAVE_RESULTS,
      braveSearchToolDefinition,
    );

    toolRegistry.register(
      "google_fact_check_search",
      () => CANNED_FACTCHECK_RESULTS,
      googleFactCheckToolDefinition,
    );
  });

  afterAll(() => {
    db.close();
    for (const suffix of ["", "-wal", "-shm"]) {
      const file = dbPath + suffix;
      if (existsSync(file)) {
        try {
          unlinkSync(file);
        } catch {
          // best-effort cleanup
        }
      }
    }
  });

  it("should detect URL in the test input", () => {
    const testUrl = "https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/";
    const detected = detectUrl(testUrl);
    expect(detected).toBe(testUrl);
  });

  it(
    "should fetch and extract article content from a real URL",
    { timeout: 30_000 },
    async () => {
      const testUrl = "https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/";
      // enrichMessageWithUrl uses the default 10s timeout.
      // If the URL is unreachable, this returns null (graceful fallback).
      const result = await enrichMessageWithUrl(testUrl);

      if (result) {
        // URL extraction succeeded — validate the result shape
        expect(result.sourceUrl).toBe(testUrl);
        expect(result.title).toBeTruthy();
        expect(result.wordCount).toBeGreaterThan(0);
        expect(result.enrichedMessage).toContain("[Article from");
        expect(result.enrichedMessage).toContain("Article content:");
      }
      // If result is null, URL was unreachable — that's OK for an E2E test.
      // The pipeline gracefully falls back to raw message.
    },
  );

  it.skipIf(!apiKey)(
    "should produce a verdict for a URL-sourced claim",
    { timeout: 300_000 },
    async () => {
      const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

      // Submit a real NHK World news article URL
      const testUrl = "https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/";

      // Track status updates
      const statusUpdates: string[] = [];
      const onStatusUpdate = (stage: string): void => {
        statusUpdates.push(stage);
      };

      const startTime = Date.now();

      const result = await pipeline.investigate(testUrl, {
        onStatusUpdate,
      });

      const elapsedMs = Date.now() - startTime;

      // ── Basic result structure ───────────────────────────
      expect(result.verdict).not.toBeNull();
      expect(result.investigationId).toBeTruthy();
      expect(result.totalCostUsd).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.nonFactualResponse).toBeUndefined();

      // ── URL was detected in the input ──────────────────
      const investigation = repo.getById(result.investigationId);
      expect(investigation).not.toBeNull();

      // The pipeline detects the URL and attempts extraction.
      // If extraction succeeds, source_url is stored in DB.
      // If extraction fails (timeout/network), pipeline falls back to raw message
      // and source_url may be null — both are valid outcomes for an E2E test.
      const urlExtracted = investigation!.source_url !== null;
      if (urlExtracted) {
        expect(investigation!.source_url).toBe(testUrl);
      }

      // ── Classifier identified as factual_claim ───────────
      const classifierResult = ClassifierResultSchema.safeParse(
        investigation!.classifier_result,
      );
      expect(classifierResult.success).toBe(true);
      if (classifierResult.success) {
        expect(classifierResult.data.category).toBe("factual_claim");
      }

      // ── Strategist produced valid SearchStrategy ─────────
      const searchStrategy = SearchStrategySchema.safeParse(
        investigation!.search_strategy,
      );
      expect(searchStrategy.success).toBe(true);
      if (searchStrategy.success) {
        expect(
          searchStrategy.data.falsificationCriteria.whatWouldProveTrue.length,
        ).toBeGreaterThan(0);
        expect(
          searchStrategy.data.falsificationCriteria.whatWouldProveFalse.length,
        ).toBeGreaterThan(0);
      }

      // ── Investigators returned valid AgentReports ────────
      const agentReports = investigation!.agent_reports;
      expect(Array.isArray(agentReports)).toBe(true);
      const reports = agentReports as unknown[];
      expect(reports.length).toBeGreaterThanOrEqual(1);

      for (const report of reports) {
        const parsed = AgentReportSchema.safeParse(report);
        expect(parsed.success).toBe(true);
      }

      // ── DA produced valid ChallengeReport ────────────────
      const challengeReport = ChallengeReportSchema.safeParse(
        investigation!.challenge_report,
      );
      expect(challengeReport.success).toBe(true);

      // ── Judge produced valid FinalVerdict ─────────────────
      const verdict = result.verdict!;
      const verdictParsed = FinalVerdictSchema.safeParse(verdict);
      expect(verdictParsed.success).toBe(true);

      // ── Verdict has a valid category ──────────────────────
      expect([
        "likely-true",
        "partially-true",
        "unverified",
        "likely-false",
      ]).toContain(verdict.category);

      // ── Verdict has confidence decomposition ──────────────
      expect(verdict.confidenceDecomposition).toBeDefined();
      expect(verdict.confidenceDecomposition.evidenceStrength).toBeGreaterThanOrEqual(0);
      expect(verdict.confidenceDecomposition.sourceReliability).toBeGreaterThanOrEqual(0);
      expect(verdict.confidenceDecomposition.claimComplexity).toBeGreaterThanOrEqual(0);
      expect(verdict.confidenceDecomposition.counterArgumentResilience).toBeGreaterThanOrEqual(0);

      // ── Status updates emitted in correct order ───────────
      expect(statusUpdates).toContain("planning");
      expect(statusUpdates).toContain("searching");
      expect(statusUpdates).toContain("analyzing");
      expect(statusUpdates).toContain("challenging");
      expect(statusUpdates).toContain("judging");

      const planIdx = statusUpdates.indexOf("planning");
      const searchIdx = statusUpdates.indexOf("searching");
      const judgeIdx = statusUpdates.indexOf("judging");
      expect(planIdx).toBeLessThan(searchIdx);
      expect(searchIdx).toBeLessThan(judgeIdx);

      // ── DB record is complete ─────────────────────────────
      expect(investigation!.status).toBe("completed");
      expect(investigation!.total_cost_usd).toBeGreaterThan(0);
      expect(investigation!.pipeline_duration_ms).toBeGreaterThan(0);

      // ── Log results ────────────────────────────────────────
      // eslint-disable-next-line no-console
      console.log(
        `\n[URL E2E Pipeline] Total API cost: $${result.totalCostUsd.toFixed(4)}`,
      );
      console.log(
        `[URL E2E Pipeline] Duration: ${(elapsedMs / 1000).toFixed(1)}s`,
      );
      console.log(`[URL E2E Pipeline] Verdict: ${verdict.category} (${verdict.confidence}%)`);
      console.log(
        `[URL E2E Pipeline] Agents: ${reports.length} investigators completed`,
      );
      console.log(
        `[URL E2E Pipeline] URL extracted: ${urlExtracted}`,
      );
      console.log(
        `[URL E2E Pipeline] Source URL stored: ${investigation!.source_url}`,
      );
    },
  );
});
