import { z } from "zod";
import type { EvalTrialResult } from "../harness.js";
import type { AgentReport } from "../../src/schemas/agent-report.js";
import { ClaudeClient, MODELS } from "../../src/services/claude-client.js";
import { createLogger } from "../../src/config/logger.js";

const logger = createLogger({ level: "info" });

// ── GroundednessGrade schema ────────────────────────────────────

export const GroundednessGradeSchema = z.object({
  keyFindingsTotal: z.number(),
  keyFindingsGrounded: z.number(),
  keyFindingsUngrounded: z.array(z.string()),
  sourcesInVerdict: z.number(),
  sourcesTraceable: z.number(),
  score: z.number(),
  reasoning: z.string(),
});

export type GroundednessGrade = z.infer<typeof GroundednessGradeSchema>;

// ── Sonnet response schema ──────────────────────────────────────

const SonnetResponseSchema = z.object({
  keyFindingsGrounded: z.number(),
  keyFindingsUngrounded: z.array(z.string()),
  sourcesTraceable: z.number(),
  reasoning: z.string(),
});

// ── Aggregate result ────────────────────────────────────────────

export interface GroundednessAggregateResult {
  avgGroundedFindings: number;
  avgTraceableSources: number;
  avgScore: number;
}

// ── Grade a single result for groundedness ──────────────────────

export async function gradeGroundedness(
  result: EvalTrialResult,
  client: ClaudeClient,
): Promise<GroundednessGrade> {
  // Skip non-factual claims (no investigation to ground)
  if (result.nonFactualResponse !== undefined && !result.verdict) {
    return {
      keyFindingsTotal: 0,
      keyFindingsGrounded: 0,
      keyFindingsUngrounded: [],
      sourcesInVerdict: 0,
      sourcesTraceable: 0,
      score: -1,
      reasoning: "Skipped: non-factual claim",
    };
  }

  // No verdict — pipeline error
  if (!result.verdict) {
    return {
      keyFindingsTotal: 0,
      keyFindingsGrounded: 0,
      keyFindingsUngrounded: [],
      sourcesInVerdict: 0,
      sourcesTraceable: 0,
      score: 0,
      reasoning: "No verdict available — pipeline error or timeout",
    };
  }

  // No agent reports — cannot assess groundedness
  if (!result.agentReports || result.agentReports.length === 0) {
    return {
      keyFindingsTotal: 0,
      keyFindingsGrounded: 0,
      keyFindingsUngrounded: [],
      sourcesInVerdict: 0,
      sourcesTraceable: 0,
      score: 0,
      reasoning: "No agent reports available — cannot assess groundedness",
    };
  }

  const verdict = result.verdict;
  const keyFindingsTotal = verdict.keyFindings.length;
  const sourcesInVerdict = verdict.sources.length;

  // Call Sonnet to evaluate groundedness
  try {
    const prompt = buildGroundednessPrompt(verdict.keyFindings, verdict.sources, verdict.reasoning, result.agentReports);

    const { response } = await client.createMessage({
      model: MODELS.SONNET,
      max_tokens: 1024,
      messages: [{ role: "user", content: prompt }],
    });

    const textBlock = response.content.find((b) => b.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      return makeParseErrorGrade(keyFindingsTotal, sourcesInVerdict, "No text in Sonnet response");
    }

    const parsed = parseSonnetResponse(textBlock.text);
    if (!parsed) {
      return makeParseErrorGrade(keyFindingsTotal, sourcesInVerdict, "Failed to parse Sonnet response as JSON");
    }

    const score = computeScore(
      keyFindingsTotal,
      parsed.keyFindingsGrounded,
      sourcesInVerdict,
      parsed.sourcesTraceable,
    );

    return {
      keyFindingsTotal,
      keyFindingsGrounded: parsed.keyFindingsGrounded,
      keyFindingsUngrounded: parsed.keyFindingsUngrounded,
      sourcesInVerdict,
      sourcesTraceable: parsed.sourcesTraceable,
      score,
      reasoning: parsed.reasoning,
    };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    logger.error({ claimId: result.claimId, error: errorMsg }, "Groundedness grading failed");
    return makeParseErrorGrade(keyFindingsTotal, sourcesInVerdict, `API error: ${errorMsg}`);
  }
}

// ── Build the Sonnet prompt ─────────────────────────────────────

function buildGroundednessPrompt(
  keyFindings: string[],
  sources: Array<{ url: string; title: string; relevance: string }>,
  reasoning: string,
  agentReports: AgentReport[],
): string {
  const findingsText = keyFindings.length > 0
    ? keyFindings.map((f, i) => `  ${i + 1}. ${f}`).join("\n")
    : "  (none)";

  const sourcesText = sources.length > 0
    ? sources.map((s, i) => `  ${i + 1}. [${s.title}](${s.url}) — ${s.relevance}`).join("\n")
    : "  (none)";

  const reportsText = agentReports.map((report) => {
    const findingsBlock = report.findings.map((f) => {
      const srcList = f.sources.map((s) =>
        `      - ${s.url} (${s.credibility}): "${s.relevantSnippet}"`,
      ).join("\n");
      return `    - "${f.claim}" [${f.assessment}, confidence: ${f.confidence}]\n${srcList}`;
    }).join("\n");
    return `  ### ${report.agentRole} (confidence: ${report.confidenceScore})\n  Summary: ${report.summary}\n  Findings:\n${findingsBlock}`;
  }).join("\n\n");

  return `You are evaluating whether a fact-checking Judge's findings are grounded in the evidence gathered by investigators.

## Judge's Output
Key Findings:
${findingsText}

Sources:
${sourcesText}

Reasoning: ${reasoning}

## Investigator Evidence
${reportsText}

For each key finding, determine:
1. Is it supported by specific evidence from any investigator report?
2. Or is it a claim the Judge made without supporting evidence (hallucinated)?

Also check: do the verdict's cited sources appear in investigator reports?

Respond with ONLY valid JSON (no markdown fences):
{
  "keyFindingsGrounded": <number of grounded findings>,
  "keyFindingsUngrounded": [<list of ungrounded finding strings>],
  "sourcesTraceable": <number of verdict sources found in investigator reports>,
  "reasoning": "<your explanation>"
}`;
}

// ── Parse Sonnet response ───────────────────────────────────────

function parseSonnetResponse(text: string): z.infer<typeof SonnetResponseSchema> | null {
  try {
    // Strip markdown code fences if present
    const cleaned = text.replace(/^```(?:json)?\s*\n?/m, "").replace(/\n?```\s*$/m, "").trim();
    const parsed: unknown = JSON.parse(cleaned);
    return SonnetResponseSchema.parse(parsed);
  } catch {
    return null;
  }
}

// ── Compute groundedness score ──────────────────────────────────

function computeScore(
  keyFindingsTotal: number,
  keyFindingsGrounded: number,
  sourcesInVerdict: number,
  sourcesTraceable: number,
): number {
  // Findings groundedness: 60% of score
  // Source traceability: 40% of score
  const findingsRatio = keyFindingsTotal > 0
    ? keyFindingsGrounded / keyFindingsTotal
    : 1; // No findings = not penalized

  const sourcesRatio = sourcesInVerdict > 0
    ? sourcesTraceable / sourcesInVerdict
    : 1; // No sources = not penalized

  return Math.round(findingsRatio * 60 + sourcesRatio * 40);
}

// ── Parse error helper ──────────────────────────────────────────

function makeParseErrorGrade(
  keyFindingsTotal: number,
  sourcesInVerdict: number,
  errorDetail: string,
): GroundednessGrade {
  return {
    keyFindingsTotal,
    keyFindingsGrounded: 0,
    keyFindingsUngrounded: [],
    sourcesInVerdict,
    sourcesTraceable: 0,
    score: 0,
    reasoning: `Groundedness grading failed — parse error: ${errorDetail}`,
  };
}

// ── Aggregate groundedness scores ───────────────────────────────

export function aggregateGroundednessScores(
  grades: GroundednessGrade[],
): GroundednessAggregateResult {
  // Filter out non-factual skips (score === -1)
  const factualGrades = grades.filter((g) => g.score >= 0);

  if (factualGrades.length === 0) {
    return {
      avgGroundedFindings: 0,
      avgTraceableSources: 0,
      avgScore: 0,
    };
  }

  const avgScore = factualGrades.reduce((sum, g) => sum + g.score, 0) / factualGrades.length;

  const gradedWithFindings = factualGrades.filter((g) => g.keyFindingsTotal > 0);
  const avgGroundedFindings = gradedWithFindings.length > 0
    ? gradedWithFindings.reduce(
        (sum, g) => sum + (g.keyFindingsGrounded / g.keyFindingsTotal) * 100,
        0,
      ) / gradedWithFindings.length
    : 0;

  const gradedWithSources = factualGrades.filter((g) => g.sourcesInVerdict > 0);
  const avgTraceableSources = gradedWithSources.length > 0
    ? gradedWithSources.reduce(
        (sum, g) => sum + (g.sourcesTraceable / g.sourcesInVerdict) * 100,
        0,
      ) / gradedWithSources.length
    : 0;

  return {
    avgGroundedFindings,
    avgTraceableSources,
    avgScore,
  };
}
