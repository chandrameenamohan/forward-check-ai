/**
 * Seed Demo Script — ForwardCheck-AI
 *
 * Runs 3 demo claims through the full investigation pipeline with real API calls
 * and saves results to the database. Use the logged investigation IDs to view
 * verdict pages at /v/:id
 *
 * Usage: npx tsx scripts/seed-demo.ts
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

const DEMO_CLAIMS = [
  {
    label: "FALSE",
    message:
      "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024",
  },
  {
    label: "MISLEADING",
    message: "WHO officially declares green tea cures cancer",
  },
  {
    label: "TRUE",
    message:
      "India's Chandrayaan-3 successfully landed on the Moon's south pole in August 2023",
  },
];

async function main(): Promise<void> {
  // Load env — requires ANTHROPIC_API_KEY (and TELEGRAM_BOT_TOKEN even though
  // we don't use the bot here). Set a dummy token if needed.
  const envOverrides: Record<string, string> = {};
  if (!process.env["TELEGRAM_BOT_TOKEN"]) {
    envOverrides["TELEGRAM_BOT_TOKEN"] = "dummy-token-for-seed-script";
  }

  // Merge any overrides into process.env before loading
  for (const [key, val] of Object.entries(envOverrides)) {
    process.env[key] = val;
  }

  const config = loadEnv();

  const logger = createLogger({
    level: "info",
    pretty: true,
  });

  // Initialize database
  const db = createDatabase(config.DATABASE_PATH);
  runMigrations(db);
  logger.info({ path: config.DATABASE_PATH }, "Database initialized");

  // Create infrastructure
  const repo = new InvestigationRepository(db);
  const client = new ClaudeClient(config.ANTHROPIC_API_KEY);

  const toolRegistry = new ToolRegistry();
  toolRegistry.register(
    "brave_web_search",
    async (input) => {
      const { query, count } = input as { query: string; count?: number };
      const result = await braveWebSearch(
        query,
        count,
        config.BRAVE_SEARCH_API_KEY ?? "",
      );
      return JSON.stringify(result);
    },
    braveSearchToolDefinition,
  );
  toolRegistry.register(
    "google_fact_check_search",
    async (input) => {
      const { query } = input as { query: string };
      const result = await googleFactCheckSearch(
        query,
        config.GOOGLE_FACTCHECK_API_KEY ?? "",
      );
      return JSON.stringify(result);
    },
    googleFactCheckToolDefinition,
  );

  const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

  // Run demo claims sequentially (to avoid API rate limits and for clearer logs)
  const results: Array<{
    label: string;
    id: string;
    category: string;
    confidence: number;
    costUsd: number;
    durationMs: number;
  }> = [];

  for (const demo of DEMO_CLAIMS) {
    logger.info(
      { label: demo.label, claim: demo.message },
      "Starting demo investigation",
    );

    const startTime = Date.now();

    try {
      const result = await pipeline.investigate(demo.message);
      const elapsed = Date.now() - startTime;

      if (result.verdict) {
        results.push({
          label: demo.label,
          id: result.investigationId,
          category: result.verdict.category,
          confidence: result.verdict.confidence,
          costUsd: result.totalCostUsd,
          durationMs: elapsed,
        });

        logger.info(
          {
            label: demo.label,
            id: result.investigationId,
            category: result.verdict.category,
            confidence: result.verdict.confidence,
            costUsd: result.totalCostUsd.toFixed(4),
            durationMs: elapsed,
          },
          "Demo investigation completed",
        );
      } else {
        logger.warn(
          {
            label: demo.label,
            id: result.investigationId,
            nonFactual: result.nonFactualResponse,
          },
          "Demo claim classified as non-factual (unexpected)",
        );
      }
    } catch (err) {
      logger.error(
        { label: demo.label, error: err },
        "Demo investigation failed",
      );
    }
  }

  // Print summary
  logger.info("═══════════════════════════════════════════════════════");
  logger.info("SEED DEMO COMPLETE — Investigation Summary");
  logger.info("═══════════════════════════════════════════════════════");

  let totalCost = 0;
  for (const r of results) {
    totalCost += r.costUsd;
    logger.info(
      {
        label: r.label,
        id: r.id,
        verdict: r.category,
        confidence: r.confidence,
        cost: `$${r.costUsd.toFixed(4)}`,
        duration: `${(r.durationMs / 1000).toFixed(1)}s`,
        url: `/v/${r.id}`,
      },
      `[${r.label}] ${r.category} (${r.confidence}%)`,
    );
  }

  logger.info(
    { totalCost: `$${totalCost.toFixed(4)}`, claimsProcessed: results.length },
    "Total API cost",
  );

  // Verify all investigations in DB
  const recent = repo.getRecent(10);
  logger.info(
    { investigationsInDb: recent.length },
    "Investigations in database",
  );

  db.close();
  logger.info("Database closed. Done.");
}

main().catch((err) => {
  process.stderr.write(`Fatal error: ${String(err)}\n`);
  process.exit(1);
});
