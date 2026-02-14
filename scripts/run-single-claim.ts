/**
 * Run a single claim through the full pipeline.
 * Usage: CLAIM="NASA confirmed water on Mars in 2024" npx tsx scripts/run-single-claim.ts
 */
import { loadEnv } from "../src/config/env.js";
import { createLogger } from "../src/config/logger.js";
import { createDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrations.js";
import { InvestigationRepository } from "../src/db/investigation-repository.js";
import { ClaudeClient } from "../src/services/claude-client.js";
import { ToolRegistry } from "../src/tools/tool-registry.js";
import {
  braveWebSearch,
  braveSearchToolDefinition,
} from "../src/tools/brave-search.js";
import {
  googleFactCheckSearch,
  googleFactCheckToolDefinition,
} from "../src/tools/google-factcheck.js";
import { InvestigationPipeline } from "../src/orchestrator/pipeline.js";

async function main(): Promise<void> {
  const claim = process.env["CLAIM"];
  if (!claim) {
    process.stderr.write("ERROR: Set CLAIM env var\n");
    process.exit(1);
  }

  if (!process.env["TELEGRAM_BOT_TOKEN"]) {
    process.env["TELEGRAM_BOT_TOKEN"] = "dummy-token-for-script";
  }

  const config = loadEnv();
  const logger = createLogger({ level: "info", pretty: true });

  const db = createDatabase(config.DATABASE_PATH);
  runMigrations(db);
  const repo = new InvestigationRepository(db);
  const client = new ClaudeClient(config.ANTHROPIC_API_KEY);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(
    "brave_web_search",
    async (input) => {
      const { query, count } = input as { query: string; count?: number };
      return JSON.stringify(
        await braveWebSearch(query, count, config.BRAVE_SEARCH_API_KEY ?? ""),
      );
    },
    braveSearchToolDefinition,
  );
  toolRegistry.register(
    "google_fact_check_search",
    async (input) => {
      const { query } = input as { query: string };
      return JSON.stringify(
        await googleFactCheckSearch(query, config.GOOGLE_FACTCHECK_API_KEY ?? ""),
      );
    },
    googleFactCheckToolDefinition,
  );

  const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

  logger.info({ claim }, "Starting single-claim investigation");
  const start = Date.now();
  const result = await pipeline.investigate(claim);
  const elapsed = Date.now() - start;

  if (result.verdict) {
    logger.info(
      {
        id: result.investigationId,
        category: result.verdict.category,
        confidence: result.verdict.confidence,
        cost: `$${result.totalCostUsd.toFixed(4)}`,
        duration: `${(elapsed / 1000).toFixed(1)}s`,
        url: `/v/${result.investigationId}`,
      },
      `VERDICT: ${result.verdict.category} (${result.verdict.confidence}%)`,
    );
  } else {
    logger.warn(
      { id: result.investigationId, nonFactual: result.nonFactualResponse },
      "Classified as non-factual",
    );
  }

  db.close();
  logger.info("Done.");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
