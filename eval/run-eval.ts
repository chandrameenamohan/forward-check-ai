import { evalClaims } from "./dataset.js";
import { EvalHarness } from "./harness.js";
import type { EvalTrialResult } from "./harness.js";
import { gradeVerdict, aggregateVerdictScores } from "./graders/verdict-grader.js";
import type { VerdictGrade, VerdictAggregateResult } from "./graders/verdict-grader.js";
import { gradeGroundedness, aggregateGroundednessScores } from "./graders/groundedness-grader.js";
import type { GroundednessGrade, GroundednessAggregateResult } from "./graders/groundedness-grader.js";
import { gradeCoverage, aggregateCoverageScores } from "./graders/coverage-grader.js";
import type { CoverageGrade, CoverageAggregateResult } from "./graders/coverage-grader.js";
import { generateSummaryString, saveMarkdownReport } from "./report.js";
import { ClaudeClient } from "../src/services/claude-client.js";
import { createLogger } from "../src/config/logger.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const logger = createLogger({ level: "info" });

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── CLI argument parsing ────────────────────────────────────────

export interface EvalArgs {
  mode: "mock" | "live";
  group: string;
  claims: string[];
  skipGroundedness: boolean;
}

export function parseArgs(argv: string[]): EvalArgs {
  const args: EvalArgs = {
    mode: "mock",
    group: "all",
    claims: [],
    skipGroundedness: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    const next = argv[i + 1];

    if (arg === "--mode" && next) {
      if (next === "mock" || next === "live") {
        args.mode = next;
      }
      i++;
    } else if (arg === "--group" && next) {
      args.group = next;
      i++;
    } else if (arg === "--claim" && next) {
      args.claims.push(next);
      i++;
    } else if (arg === "--skip-groundedness") {
      args.skipGroundedness = true;
    }
  }

  return args;
}

// ── Eval result type ────────────────────────────────────────────

export interface EvalResult {
  trialResults: EvalTrialResult[];
  verdictGrades: VerdictGrade[];
  verdictAggregate: VerdictAggregateResult;
  groundednessGrades: GroundednessGrade[];
  groundednessAggregate: GroundednessAggregateResult | null;
  coverageGrades: CoverageGrade[];
  coverageAggregate: CoverageAggregateResult;
  totalCostUsd: number;
  totalDurationMs: number;
}

// ── Core eval runner ────────────────────────────────────────────

export async function runEval(args: EvalArgs): Promise<EvalResult> {
  const startTime = Date.now();

  // Build harness config
  const harnessConfig: {
    mode: "mock" | "live";
    claimFilter?: string[];
    groupFilter?: string[];
  } = { mode: args.mode };

  if (args.claims.length > 0) {
    harnessConfig.claimFilter = args.claims;
  }

  if (args.group !== "all") {
    harnessConfig.groupFilter = [args.group];
  }

  // Run claims through pipeline
  const harness = new EvalHarness(harnessConfig);
  const trialResults = await harness.run(evalClaims);

  // Grade verdicts
  const verdictGrades = trialResults.map((result) =>
    gradeVerdict(result, result.claim),
  );
  const verdictAggregate = aggregateVerdictScores(verdictGrades);

  // Grade groundedness (unless skipped)
  let groundednessGrades: GroundednessGrade[] = [];
  let groundednessAggregate: GroundednessAggregateResult | null = null;

  if (!args.skipGroundedness) {
    const apiKey = process.env["ANTHROPIC_API_KEY"] ?? "";
    const client = new ClaudeClient(apiKey);

    groundednessGrades = [];
    for (const result of trialResults) {
      const grade = await gradeGroundedness(result, client);
      groundednessGrades.push(grade);
    }
    groundednessAggregate = aggregateGroundednessScores(groundednessGrades);
  }

  // Grade coverage
  const coverageGrades = trialResults.map((result) =>
    gradeCoverage(result, result.claim),
  );
  const coverageAggregate = aggregateCoverageScores(coverageGrades);

  const totalCostUsd = trialResults.reduce((sum, r) => sum + r.costUsd, 0);
  const totalDurationMs = Date.now() - startTime;

  return {
    trialResults,
    verdictGrades,
    verdictAggregate,
    groundednessGrades,
    groundednessAggregate,
    coverageGrades,
    coverageAggregate,
    totalCostUsd,
    totalDurationMs,
  };
}

// ── Console summary printer ─────────────────────────────────────

function printSummary(result: EvalResult, args: EvalArgs): void {
  const summary = generateSummaryString(result, { mode: args.mode });
  logger.info(summary);
}

// ── Save results to JSON ────────────────────────────────────────

function saveResults(result: EvalResult, args: EvalArgs): string {
  const resultsDir = join(__dirname, "results");
  mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(resultsDir, `eval-${timestamp}.json`);

  const output = {
    config: args,
    timestamp: new Date().toISOString(),
    totalClaims: result.trialResults.length,
    totalCostUsd: result.totalCostUsd,
    totalDurationMs: result.totalDurationMs,
    verdictAggregate: result.verdictAggregate,
    groundednessAggregate: result.groundednessAggregate,
    coverageAggregate: result.coverageAggregate,
    trialResults: result.trialResults.map((trial, i) => ({
      claimId: trial.claimId,
      claim: trial.claim.claim,
      expectedCategory: trial.claim.expectedCategory,
      gotCategory: trial.verdict?.category ?? null,
      gotConfidence: trial.verdict?.confidence ?? null,
      nonFactualResponse: trial.nonFactualResponse ?? null,
      error: trial.error ?? null,
      costUsd: trial.costUsd,
      durationMs: trial.durationMs,
      verdictGrade: result.verdictGrades[i],
      coverageGrade: result.coverageGrades[i],
      groundednessGrade: result.groundednessGrades[i] ?? null,
    })),
  };

  writeFileSync(filePath, JSON.stringify(output, null, 2));
  logger.info({ filePath }, "Results saved");

  return filePath;
}

// ── Main entry point ────────────────────────────────────────────

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  logger.info(
    { mode: args.mode, group: args.group, claims: args.claims, skipGroundedness: args.skipGroundedness },
    "Starting eval run",
  );

  const result = await runEval(args);

  printSummary(result, args);
  saveResults(result, args);
  saveMarkdownReport(result, { mode: args.mode });

  // Exit non-zero if harm-weighted accuracy < 50% (safety net)
  if (result.verdictAggregate.harmWeightedAccuracy < 50) {
    logger.error(
      { accuracy: result.verdictAggregate.harmWeightedAccuracy },
      "FAIL: Harm-weighted accuracy below 50% threshold",
    );
    process.exit(1);
  }
}

// Only run main when executed directly (not when imported for testing)
const isMainModule = process.argv[1]?.endsWith("run-eval.ts") || process.argv[1]?.endsWith("run-eval.js");
if (isMainModule) {
  main().catch((err) => {
    logger.error({ error: err instanceof Error ? err.message : String(err) }, "Eval run failed");
    process.exit(1);
  });
}
