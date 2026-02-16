import { z } from "zod";
import { createDatabase } from "../src/db/connection.js";
import { runMigrations } from "../src/db/migrations.js";
import { InvestigationRepository } from "../src/db/investigation-repository.js";
import { ClaudeClient } from "../src/services/claude-client.js";
import { ToolRegistry } from "../src/tools/tool-registry.js";
import { braveSearchToolDefinition } from "../src/tools/brave-search.js";
import { googleFactCheckToolDefinition } from "../src/tools/google-factcheck.js";
import { InvestigationPipeline } from "../src/orchestrator/pipeline.js";
import type { ClassifierResult } from "../src/schemas/classifier-result.js";
import type { SearchStrategy } from "../src/schemas/search-strategy.js";
import type { AgentReport } from "../src/schemas/agent-report.js";
import type { ChallengeReport } from "../src/schemas/challenge-report.js";
import type { FinalVerdict } from "../src/schemas/final-verdict.js";
import type { EvalClaim } from "./dataset.js";
import { getCannedResults, FACTUAL_CLAIM_IDS } from "./canned-results.js";
import { createLogger } from "../src/config/logger.js";

const logger = createLogger({ level: "info" });

// ── EvalTrialResult schema ──────────────────────────────────────

export const EvalTrialResultSchema = z.object({
  claimId: z.string(),
  claim: z.custom<EvalClaim>(),
  classifierResult: z.custom<ClassifierResult>().optional(),
  searchStrategy: z.custom<SearchStrategy>().optional(),
  agentReports: z.array(z.custom<AgentReport>()).optional(),
  challengeReport: z.custom<ChallengeReport>().optional(),
  verdict: z.custom<FinalVerdict>().optional(),
  nonFactualResponse: z.string().optional(),
  error: z.string().optional(),
  costUsd: z.number(),
  durationMs: z.number(),
  timestamp: z.string(),
});

export type EvalTrialResult = z.infer<typeof EvalTrialResultSchema>;

// ── Harness config ──────────────────────────────────────────────

export interface EvalHarnessConfig {
  mode: "mock" | "live";
  claimFilter?: string[];
  groupFilter?: string[];
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 300_000;

// ── EvalHarness class ───────────────────────────────────────────

export class EvalHarness {
  private config: Required<Pick<EvalHarnessConfig, "mode" | "timeoutMs">> & EvalHarnessConfig;

  constructor(config: EvalHarnessConfig) {
    this.config = {
      ...config,
      timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    };
  }

  /**
   * Run eval claims through the pipeline and collect structured results.
   * Claims are run sequentially to avoid rate limits.
   */
  async run(claims: EvalClaim[]): Promise<EvalTrialResult[]> {
    const filtered = this.filterClaims(claims);
    const results: EvalTrialResult[] = [];

    for (let i = 0; i < filtered.length; i++) {
      const claim = filtered[i]!;
      logger.info(
        { index: i + 1, total: filtered.length, claimId: claim.id, mode: this.config.mode },
        `[${i + 1}/${filtered.length}] Running "${claim.claim.slice(0, 50)}..." — ${this.config.mode} mode`,
      );

      const result = await this.runSingleClaim(claim);
      results.push(result);
    }

    const totalCost = results.reduce((sum, r) => sum + r.costUsd, 0);
    logger.info(
      { totalClaims: results.length, totalCost: totalCost.toFixed(4) },
      "Eval run complete",
    );

    return results;
  }

  /**
   * Run a single claim through the pipeline with timeout and error handling.
   */
  private async runSingleClaim(claim: EvalClaim): Promise<EvalTrialResult> {
    const startTime = Date.now();

    try {
      const { pipeline, closeDb } = this.createPipelineForClaim(claim);

      try {
        const pipelinePromise = pipeline.investigate(claim.claim);
        const timeoutPromise = new Promise<never>((_, reject) => {
          setTimeout(() => reject(new Error(`Timeout after ${this.config.timeoutMs}ms`)), this.config.timeoutMs);
        });

        const result = await Promise.race([pipelinePromise, timeoutPromise]);

        return {
          claimId: claim.id,
          claim,
          classifierResult: result.classifierResult,
          searchStrategy: result.searchStrategy,
          agentReports: result.agentReports,
          challengeReport: result.challengeReport,
          verdict: result.verdict ?? undefined,
          nonFactualResponse: result.nonFactualResponse,
          costUsd: result.totalCostUsd,
          durationMs: Date.now() - startTime,
          timestamp: new Date().toISOString(),
        };
      } finally {
        closeDb();
      }
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      logger.error({ claimId: claim.id, error: errorMessage }, "Claim failed");

      return {
        claimId: claim.id,
        claim,
        costUsd: 0,
        durationMs: Date.now() - startTime,
        timestamp: new Date().toISOString(),
        error: errorMessage,
      };
    }
  }

  /**
   * Create a fresh pipeline instance for a single claim.
   * Each claim gets its own in-memory SQLite database for isolation.
   */
  private createPipelineForClaim(claim: EvalClaim): { pipeline: InvestigationPipeline; closeDb: () => void } {
    const db = createDatabase(":memory:");
    runMigrations(db);
    const repo = new InvestigationRepository(db);

    const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
    const client = new ClaudeClient(apiKey);

    const toolRegistry = this.createToolRegistry(claim);

    const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

    return {
      pipeline,
      closeDb: () => {
        try {
          db.close();
        } catch {
          // ignore close errors
        }
      },
    };
  }

  /**
   * Create a ToolRegistry with either canned or live search tool handlers.
   * In mock mode: search tools return canned results from eval fixtures.
   * In live mode: search tools call real APIs.
   */
  private createToolRegistry(claim: EvalClaim): ToolRegistry {
    const registry = new ToolRegistry();

    if (this.config.mode === "mock") {
      this.registerMockSearchTools(registry, claim);
    } else {
      this.registerLiveSearchTools(registry);
    }

    return registry;
  }

  /**
   * Register mock search tool handlers that return canned results.
   * For factual claims: loads from eval/fixtures/{claimId}.json.
   * For non-factual claims: returns empty results (they short-circuit before search).
   */
  private registerMockSearchTools(registry: ToolRegistry, claim: EvalClaim): void {
    const isFact = FACTUAL_CLAIM_IDS.includes(claim.id);

    registry.register(
      "brave_web_search",
      () => {
        if (isFact) {
          const canned = getCannedResults(claim.id);
          return JSON.stringify({ results: canned.brave });
        }
        return JSON.stringify({ results: [] });
      },
      braveSearchToolDefinition,
    );

    registry.register(
      "google_fact_check_search",
      () => {
        if (isFact) {
          const canned = getCannedResults(claim.id);
          return JSON.stringify({ claims: canned.factCheck });
        }
        return JSON.stringify({ claims: [] });
      },
      googleFactCheckToolDefinition,
    );
  }

  /**
   * Register live search tool handlers that call real APIs.
   */
  private registerLiveSearchTools(registry: ToolRegistry): void {
    const braveApiKey = process.env["BRAVE_SEARCH_API_KEY"] ?? "";
    const googleApiKey = process.env["GOOGLE_FACTCHECK_API_KEY"] ?? "";

    registry.register(
      "brave_web_search",
      async (input) => {
        const { braveWebSearch } = await import("../src/tools/brave-search.js");
        const { query, count } = input as { query: string; count?: number };
        const result = await braveWebSearch(query, count, braveApiKey);
        return JSON.stringify(result);
      },
      braveSearchToolDefinition,
    );

    registry.register(
      "google_fact_check_search",
      async (input) => {
        const { googleFactCheckSearch } = await import("../src/tools/google-factcheck.js");
        const { query } = input as { query: string };
        const result = await googleFactCheckSearch(query, googleApiKey);
        return JSON.stringify(result);
      },
      googleFactCheckToolDefinition,
    );
  }

  /**
   * Filter claims by ID and/or group prefix.
   */
  private filterClaims(claims: EvalClaim[]): EvalClaim[] {
    let filtered = claims;

    if (this.config.claimFilter && this.config.claimFilter.length > 0) {
      filtered = filtered.filter((c) => this.config.claimFilter!.includes(c.id));
    }

    if (this.config.groupFilter && this.config.groupFilter.length > 0) {
      filtered = filtered.filter((c) => {
        const group = c.id.split("-")[0]!;
        return this.config.groupFilter!.includes(group);
      });
    }

    return filtered;
  }
}
