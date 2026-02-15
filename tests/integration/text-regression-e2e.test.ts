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
import { PipelineEventBus } from "../../src/orchestrator/pipeline-events.js";
import { ClassifierResultSchema } from "../../src/schemas/classifier-result.js";
import { FinalVerdictSchema } from "../../src/schemas/final-verdict.js";
import type { PipelineEvent } from "../../src/orchestrator/pipeline-events.js";
import type Database from "better-sqlite3";

config();

const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";

/**
 * Same canned search results as the original pipeline E2E test.
 */
const CANNED_BRAVE_RESULTS = JSON.stringify({
  results: [
    {
      title: "Fact Check: Viral claim about PM Modi Rs 5000 transfer is FALSE",
      url: "https://www.altnews.in/fact-check-pm-modi-rs-5000-direct-transfer",
      description:
        "No such scheme announced by PM Modi. The viral WhatsApp message claiming Rs 5000 direct transfer to all citizens is fabricated. PIB Fact Check has debunked this.",
      age: "2024-03-15",
    },
    {
      title: "PIB Fact Check: No Rs 5000 direct transfer scheme announced",
      url: "https://pib.gov.in/factcheck/2024/03/no-rs-5000-transfer",
      description:
        "The Press Information Bureau (PIB) confirms that no such scheme has been announced by the Government of India.",
      age: "2024-03-12",
    },
    {
      title: "BoomLive: Fake WhatsApp Forward Claims PM Modi Rs 5000 Scheme",
      url: "https://www.boomlive.in/fact-check/modi-rs-5000-scheme-fake",
      description:
        "A viral WhatsApp message claiming PM Narendra Modi has announced Rs 5000 direct transfer to all Indian citizens is fake.",
      age: "2024-03-10",
    },
  ],
});

const CANNED_FACTCHECK_RESULTS = JSON.stringify({
  claims: [
    {
      text: "PM Modi announced Rs 5000 direct transfer to all citizens",
      claimant: "WhatsApp viral message",
      claimReviewMarkup: {
        url: "https://www.altnews.in/fact-check-pm-modi-rs-5000",
        title: "No, PM Modi did not announce Rs 5000 transfer",
        publisher: "AltNews",
        rating: "False",
      },
    },
    {
      text: "Indian government giving Rs 5000 to every citizen",
      claimant: "Social media posts",
      claimReviewMarkup: {
        url: "https://www.boomlive.in/fact-check/modi-scheme-false",
        title: "Fake: No Rs 5000 government scheme",
        publisher: "BoomLive",
        rating: "False",
      },
    },
  ],
});

describe("Text-Only Pipeline Regression (post-URL support)", () => {
  let client: ClaudeClient;
  let toolRegistry: ToolRegistry;
  let repo: InvestigationRepository;
  let eventBus: PipelineEventBus;
  let db: Database.Database;
  let dbPath: string;

  beforeAll(() => {
    dbPath = join(tmpdir(), `forwardcheck-text-regression-${randomUUID()}.db`);
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

    eventBus = new PipelineEventBus({ historyTtlMs: 60_000, cleanupIntervalMs: 30_000 });
  });

  afterAll(() => {
    eventBus.destroy();
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

  it.skipIf(!apiKey)(
    "text-only pipeline should work identically after URL support changes",
    { timeout: 300_000 },
    async () => {
      const pipeline = new InvestigationPipeline(
        client, toolRegistry, repo, undefined, eventBus,
      );

      // Same claim as the original pipeline E2E test — plain text, no URL
      const testClaim =
        "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024";

      // Track status updates
      const statusUpdates: string[] = [];
      const onStatusUpdate = (stage: string): void => {
        statusUpdates.push(stage);
      };

      // Use onInvestigationCreated to subscribe to events before they're emitted
      const emittedEventKinds: string[] = [];
      let investigationId = "";
      const onInvestigationCreated = (id: string): void => {
        investigationId = id;
        eventBus.subscribe(id, (event: PipelineEvent) => {
          emittedEventKinds.push(event.kind);
        });
      };

      const startTime = Date.now();

      const result = await pipeline.investigate(testClaim, {
        onStatusUpdate,
        onInvestigationCreated,
      });

      const elapsedMs = Date.now() - startTime;

      // ── No URL detection triggered ─────────────────────────
      // No url-fetch:start or url-fetch:complete events should be emitted
      expect(emittedEventKinds).not.toContain("url-fetch:start");
      expect(emittedEventKinds).not.toContain("url-fetch:complete");

      // Standard pipeline events should be present
      expect(emittedEventKinds).toContain("pipeline:start");
      expect(emittedEventKinds).toContain("classifier:start");
      expect(emittedEventKinds).toContain("classifier:complete");
      expect(emittedEventKinds).toContain("pipeline:complete");

      // ── source_url is null in database ─────────────────────
      const investigation = repo.getById(result.investigationId);
      expect(investigation).not.toBeNull();
      expect(investigation!.source_url).toBeNull();

      // ── Classifier receives raw text (not enriched) ────────
      const classifierResult = ClassifierResultSchema.safeParse(
        investigation!.classifier_result,
      );
      expect(classifierResult.success).toBe(true);
      if (classifierResult.success) {
        expect(classifierResult.data.category).toBe("factual_claim");
        // The extracted claim should not contain URL enrichment markers
        expect(classifierResult.data.extractedClaim).not.toContain("[Article from");
        expect(classifierResult.data.extractedClaim).not.toContain("Article content:");
      }

      // ── Pipeline completes successfully ────────────────────
      expect(result.verdict).not.toBeNull();
      expect(result.investigationId).toBeTruthy();
      expect(result.totalCostUsd).toBeGreaterThan(0);
      expect(result.durationMs).toBeGreaterThan(0);
      expect(result.nonFactualResponse).toBeUndefined();
      expect(result.cached).toBeUndefined();

      // ── Verdict is valid ───────────────────────────────────
      const verdict = result.verdict!;
      const verdictParsed = FinalVerdictSchema.safeParse(verdict);
      expect(verdictParsed.success).toBe(true);
      expect([
        "likely-true",
        "partially-true",
        "unverified",
        "likely-false",
      ]).toContain(verdict.category);

      // ── Status updates emitted in correct order ────────────
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

      // ── DB record is complete ──────────────────────────────
      expect(investigation!.status).toBe("completed");
      expect(investigation!.total_cost_usd).toBeGreaterThan(0);
      expect(investigation!.pipeline_duration_ms).toBeGreaterThan(0);

      // ── Costs and timings within expected ranges ────────────
      expect(result.totalCostUsd).toBeGreaterThan(0.10);
      expect(result.totalCostUsd).toBeLessThan(2.00);

      // ── Log results ────────────────────────────────────────
      // eslint-disable-next-line no-console
      console.log(
        `\n[Text Regression E2E] Total API cost: $${result.totalCostUsd.toFixed(4)}`,
      );
      console.log(
        `[Text Regression E2E] Duration: ${(elapsedMs / 1000).toFixed(1)}s`,
      );
      console.log(`[Text Regression E2E] Verdict: ${verdict.category} (${verdict.confidence}%)`);
      console.log(
        `[Text Regression E2E] source_url: ${investigation!.source_url}`,
      );
      console.log(
        `[Text Regression E2E] URL events emitted: ${emittedEventKinds.filter(e => e.startsWith("url-")).length}`,
      );
    },
  );
});
