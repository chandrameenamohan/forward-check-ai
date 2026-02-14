import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
import { ClaudeClient } from "../../src/services/claude-client.js";
import { ToolRegistry } from "../../src/tools/tool-registry.js";
import { braveSearchToolDefinition } from "../../src/tools/brave-search.js";
import { googleFactCheckToolDefinition } from "../../src/tools/google-factcheck.js";
import { createDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { InvestigationRepository } from "../../src/db/investigation-repository.js";
import { InvestigationPipeline } from "../../src/orchestrator/pipeline.js";
import type Database from "better-sqlite3";

config();

const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";

describe("Non-Factual Pipeline E2E", () => {
  let client: ClaudeClient;
  let toolRegistry: ToolRegistry;
  let repo: InvestigationRepository;
  let db: Database.Database;
  let dbPath: string;

  beforeAll(() => {
    dbPath = join(tmpdir(), `forwardcheck-nonfactual-e2e-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
    repo = new InvestigationRepository(db);

    client = new ClaudeClient(apiKey);

    // Register mock search tools — these should never be called for non-factual messages
    toolRegistry = new ToolRegistry();
    toolRegistry.register(
      "brave_web_search",
      () => {
        throw new Error("brave_web_search should not be called for non-factual messages");
      },
      braveSearchToolDefinition,
    );
    toolRegistry.register(
      "google_fact_check_search",
      () => {
        throw new Error("google_fact_check_search should not be called for non-factual messages");
      },
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

  it.skipIf(!apiKey)(
    "should short-circuit for greeting message",
    { timeout: 30_000 },
    async () => {
      const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

      const result = await pipeline.investigate("Hello, how are you?");

      // Pipeline should short-circuit — no full investigation
      expect(result.verdict).toBeNull();
      expect(result.nonFactualResponse).toBeTruthy();
      expect(result.nonFactualResponse!.length).toBeGreaterThan(0);
      expect(result.investigationId).toBeTruthy();

      // Cost should be minimal — Haiku only
      expect(result.totalCostUsd).toBeGreaterThan(0);
      expect(result.totalCostUsd).toBeLessThan(0.01);

      // DB record should be completed_non_factual
      const investigation = repo.getById(result.investigationId);
      expect(investigation).not.toBeNull();
      expect(investigation!.status).toBe("completed_non_factual");

      // Classifier result should be stored with greeting category
      expect(investigation!.classifier_result).toBeTruthy();
      const classifierResult = investigation!.classifier_result as Record<string, unknown>;
      expect(classifierResult["category"]).toBe("greeting");

      // No downstream agents should have been invoked
      expect(investigation!.search_strategy).toBeNull();
      expect(investigation!.agent_reports).toBeNull();
      expect(investigation!.challenge_report).toBeNull();
      expect(investigation!.final_verdict).toBeNull();
    },
  );

  it.skipIf(!apiKey)(
    "should short-circuit for opinion message",
    { timeout: 30_000 },
    async () => {
      const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

      const result = await pipeline.investigate(
        "I think chocolate is the best flavor",
      );

      expect(result.verdict).toBeNull();
      expect(result.nonFactualResponse).toBeTruthy();
      expect(result.nonFactualResponse!.length).toBeGreaterThan(0);
      expect(result.investigationId).toBeTruthy();

      // Cost should be minimal — Haiku only
      expect(result.totalCostUsd).toBeGreaterThan(0);
      expect(result.totalCostUsd).toBeLessThan(0.01);

      // DB record should be completed_non_factual
      const investigation = repo.getById(result.investigationId);
      expect(investigation).not.toBeNull();
      expect(investigation!.status).toBe("completed_non_factual");

      // Classifier result should be stored with opinion category
      expect(investigation!.classifier_result).toBeTruthy();
      const classifierResult = investigation!.classifier_result as Record<string, unknown>;
      expect(classifierResult["category"]).toBe("opinion");

      // No downstream agents should have been invoked
      expect(investigation!.search_strategy).toBeNull();
      expect(investigation!.agent_reports).toBeNull();
      expect(investigation!.challenge_report).toBeNull();
      expect(investigation!.final_verdict).toBeNull();
    },
  );

  it.skipIf(!apiKey)(
    "should short-circuit for scam message",
    { timeout: 30_000 },
    async () => {
      const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

      const result = await pipeline.investigate(
        "Send money to this account to claim your prize",
      );

      expect(result.verdict).toBeNull();
      expect(result.nonFactualResponse).toBeTruthy();
      expect(result.nonFactualResponse!.length).toBeGreaterThan(0);
      expect(result.investigationId).toBeTruthy();

      // Cost should be minimal — Haiku only
      expect(result.totalCostUsd).toBeGreaterThan(0);
      expect(result.totalCostUsd).toBeLessThan(0.01);

      // DB record should be completed_non_factual
      const investigation = repo.getById(result.investigationId);
      expect(investigation).not.toBeNull();
      expect(investigation!.status).toBe("completed_non_factual");

      // Classifier result should be stored with scam category
      expect(investigation!.classifier_result).toBeTruthy();
      const classifierResult = investigation!.classifier_result as Record<string, unknown>;
      expect(classifierResult["category"]).toBe("scam");

      // No downstream agents should have been invoked
      expect(investigation!.search_strategy).toBeNull();
      expect(investigation!.agent_reports).toBeNull();
      expect(investigation!.challenge_report).toBeNull();
      expect(investigation!.final_verdict).toBeNull();
    },
  );
});
