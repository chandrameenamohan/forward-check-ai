import type { EvalResult } from "./run-eval.js";
import { writeFileSync, mkdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));

// ── Report config ────────────────────────────────────────────────

export interface ReportConfig {
  mode: string;
}

// ── Console summary string generator ─────────────────────────────

export function generateSummaryString(
  result: EvalResult,
  config: ReportConfig,
): string {
  const lines: string[] = [];

  lines.push("══════════════════════════════════════════");
  lines.push("ForwardCheck-AI — Eval Results");
  lines.push(
    `Mode: ${config.mode} | Claims: ${result.trialResults.length} | Cost: $${result.totalCostUsd.toFixed(2)}`,
  );
  lines.push("══════════════════════════════════════════");
  lines.push("");

  // Verdict accuracy
  lines.push("VERDICT ACCURACY");
  const va = result.verdictAggregate;
  lines.push(
    `  Harm-weighted accuracy:  ${va.harmWeightedAccuracy.toFixed(1)}%  (target: >70%)`,
  );
  const exact = result.verdictGrades.filter((g) => g.categoryCorrect).length;
  lines.push(
    `  Exact category match:    ${va.exactMatchRate.toFixed(1)}%  (${exact}/${result.verdictGrades.length})`,
  );
  const acceptable = result.verdictGrades.filter(
    (g) => g.categoryAcceptable,
  ).length;
  lines.push(
    `  Acceptable match:        ${va.acceptableMatchRate.toFixed(1)}%  (${acceptable}/${result.verdictGrades.length})`,
  );
  lines.push("");

  // Groundedness
  if (result.groundednessAggregate) {
    lines.push("GROUNDEDNESS (Sonnet-graded)");
    const ga = result.groundednessAggregate;
    lines.push(
      `  Avg grounded findings:   ${ga.avgGroundedFindings.toFixed(1)}%  (target: >70%)`,
    );
    lines.push(
      `  Avg traceable sources:   ${ga.avgTraceableSources.toFixed(1)}%  (target: >80%)`,
    );
    lines.push("");
  }

  // Coverage
  lines.push("COVERAGE");
  const ca = result.coverageAggregate;
  lines.push(
    `  Must-find source hit:    ${ca.avgMustFindHitRate.toFixed(1)}%  (target: >60%)`,
  );
  lines.push(`  Avg unique domains:      ${ca.avgUniqueDomains.toFixed(1)}`);
  lines.push("");

  // Failures
  const failures = collectFailures(result);
  if (failures.length > 0) {
    lines.push("FAILURES");
    for (const f of failures) {
      lines.push(
        `  ✗ ${f.claimId}  expected:${f.expected}  got:${f.got}  harm:${String(f.harm)}`,
      );
    }
    lines.push("");

    // Top issues
    lines.push("TOP ISSUES (read these transcripts)");
    const topIssues = failures.slice(0, 3);
    for (let i = 0; i < topIssues.length; i++) {
      const issue = topIssues[i]!;
      lines.push(
        `  ${String(i + 1)}. ${issue.claimId} — ${issue.got !== issue.expected ? "wrong category" : "low confidence"}, harm ${String(issue.harm)}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Markdown report generator ────────────────────────────────────

export function generateMarkdownReport(
  result: EvalResult,
  config: ReportConfig,
): string {
  const lines: string[] = [];

  // Title and metadata
  lines.push("# ForwardCheck-AI — Eval Report");
  lines.push("");
  lines.push(`**Date:** ${new Date().toISOString()}`);
  lines.push(`**Mode:** ${config.mode}`);
  lines.push(
    `**Claims:** ${String(result.trialResults.length)} | **Cost:** $${result.totalCostUsd.toFixed(2)} | **Duration:** ${formatDuration(result.totalDurationMs)}`,
  );
  lines.push("");
  lines.push("---");
  lines.push("");

  // Verdict Accuracy summary
  lines.push("## Verdict Accuracy");
  lines.push("");
  const va = result.verdictAggregate;
  lines.push(`| Metric | Value | Target |`);
  lines.push(`|--------|-------|--------|`);
  lines.push(
    `| Harm-weighted accuracy | ${va.harmWeightedAccuracy.toFixed(1)}% | >70% |`,
  );
  lines.push(
    `| Exact category match | ${va.exactMatchRate.toFixed(1)}% | >60% |`,
  );
  lines.push(
    `| Acceptable match | ${va.acceptableMatchRate.toFixed(1)}% | >80% |`,
  );
  lines.push("");

  // Groundedness summary
  if (result.groundednessAggregate) {
    lines.push("## Groundedness");
    lines.push("");
    const ga = result.groundednessAggregate;
    lines.push(`| Metric | Value | Target |`);
    lines.push(`|--------|-------|--------|`);
    lines.push(
      `| Avg grounded findings | ${ga.avgGroundedFindings.toFixed(1)}% | >70% |`,
    );
    lines.push(
      `| Avg traceable sources | ${ga.avgTraceableSources.toFixed(1)}% | >80% |`,
    );
    lines.push("");
  }

  // Coverage summary
  lines.push("## Coverage");
  lines.push("");
  const ca = result.coverageAggregate;
  lines.push(`| Metric | Value | Target |`);
  lines.push(`|--------|-------|--------|`);
  lines.push(
    `| Must-find source hit | ${ca.avgMustFindHitRate.toFixed(1)}% | >60% |`,
  );
  lines.push(`| Avg unique domains | ${ca.avgUniqueDomains.toFixed(1)} | — |`);
  lines.push("");

  // Per-claim table
  lines.push("## Per-Claim Results");
  lines.push("");
  lines.push(
    "| ID | Expected | Got | Confidence | Score | Cost | Duration |",
  );
  lines.push(
    "|-----|----------|-----|------------|-------|------|----------|",
  );

  for (let i = 0; i < result.trialResults.length; i++) {
    const trial = result.trialResults[i]!;
    const grade = result.verdictGrades[i];
    const got =
      trial.verdict?.category ?? trial.nonFactualResponse ?? trial.error ?? "—";
    const confidence =
      trial.verdict?.confidence !== undefined
        ? `${String(trial.verdict.confidence)}%`
        : "—";
    const score = grade ? String(grade.rawScore) : "—";
    const cost = `$${trial.costUsd.toFixed(2)}`;
    const duration = formatDuration(trial.durationMs);

    lines.push(
      `| ${trial.claimId} | ${trial.claim.expectedCategory} | ${got} | ${confidence} | ${score} | ${cost} | ${duration} |`,
    );
  }
  lines.push("");

  // Failures details
  const failures = collectFailures(result);
  if (failures.length > 0) {
    lines.push("## Failures");
    lines.push("");
    for (const f of failures) {
      lines.push(
        `- **${f.claimId}** — expected: \`${f.expected}\`, got: \`${f.got}\`, harm: ${String(f.harm)}`,
      );
    }
    lines.push("");
  }

  return lines.join("\n");
}

// ── Save markdown report to disk ─────────────────────────────────

export function saveMarkdownReport(
  result: EvalResult,
  config: ReportConfig,
): string {
  const resultsDir = join(__dirname, "results");
  mkdirSync(resultsDir, { recursive: true });

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const filePath = join(resultsDir, `eval-${timestamp}.md`);

  const md = generateMarkdownReport(result, config);
  writeFileSync(filePath, md);

  return filePath;
}

// ── Helpers ──────────────────────────────────────────────────────

interface Failure {
  claimId: string;
  expected: string;
  got: string;
  harm: number;
}

function collectFailures(result: EvalResult): Failure[] {
  const failures: Failure[] = [];

  for (let i = 0; i < result.trialResults.length; i++) {
    const trial = result.trialResults[i]!;
    const grade = result.verdictGrades[i]!;
    if (!grade.categoryCorrect && !grade.categoryAcceptable) {
      const got = trial.verdict?.category ?? trial.error ?? "no-verdict";
      failures.push({
        claimId: trial.claimId,
        expected: trial.claim.expectedCategory,
        got,
        harm: grade.harmWeight,
      });
    }
  }

  // Sort by harm weight descending
  failures.sort((a, b) => b.harm - a.harm);
  return failures;
}

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) {
    return `${String(seconds)}s`;
  }
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${String(minutes)}m ${String(remainingSeconds)}s`;
}
