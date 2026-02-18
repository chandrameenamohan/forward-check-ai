import { z } from "zod";
import type { EvalClaim } from "../dataset.js";
import type { EvalTrialResult } from "../harness.js";

// ── VerdictGrade schema ─────────────────────────────────────────

export const VerdictGradeSchema = z.object({
  categoryCorrect: z.boolean(),
  categoryAcceptable: z.boolean(),
  confidenceInRange: z.boolean(),
  harmWeight: z.number(),
  rawScore: z.number(),
  weightedScore: z.number(),
  maxWeightedScore: z.number(),
});

export type VerdictGrade = z.infer<typeof VerdictGradeSchema>;

// ── Aggregate result ────────────────────────────────────────────

export interface VerdictAggregateResult {
  harmWeightedAccuracy: number;
  exactMatchRate: number;
  acceptableMatchRate: number;
}

// ── Non-factual classifier routes ───────────────────────────────

const NON_FACTUAL_ROUTES = new Set(["greeting", "opinion", "scam", "other"]);

// ── Grade a single verdict ──────────────────────────────────────

export function gradeVerdict(
  result: EvalTrialResult,
  claim: EvalClaim,
): VerdictGrade {
  const isNonFactual = NON_FACTUAL_ROUTES.has(claim.expectedClassifierRoute);

  // Pipeline error — no verdict AND not a non-factual short-circuit
  if (!result.verdict && !result.nonFactualResponse) {
    return {
      categoryCorrect: false,
      categoryAcceptable: false,
      confidenceInRange: false,
      harmWeight: claim.harmWeight,
      rawScore: 0,
      weightedScore: 0,
      maxWeightedScore: 100 * claim.harmWeight,
    };
  }

  // Non-factual claim: check that pipeline short-circuited correctly
  if (isNonFactual) {
    return gradeNonFactual(result, claim);
  }

  // Factual claim: grade the verdict
  return gradeFactual(result, claim);
}

// ── Grade non-factual short circuit ─────────────────────────────

function gradeNonFactual(
  result: EvalTrialResult,
  claim: EvalClaim,
): VerdictGrade {
  const correctRoute =
    result.nonFactualResponse !== undefined &&
    result.classifierResult !== undefined &&
    NON_FACTUAL_ROUTES.has(result.classifierResult.category);

  const rawScore = correctRoute ? 100 : 0;

  return {
    categoryCorrect: correctRoute,
    categoryAcceptable: correctRoute,
    confidenceInRange: true,
    harmWeight: claim.harmWeight,
    rawScore,
    weightedScore: rawScore * claim.harmWeight,
    maxWeightedScore: 100 * claim.harmWeight,
  };
}

// ── Grade factual verdict ───────────────────────────────────────

function gradeFactual(
  result: EvalTrialResult,
  claim: EvalClaim,
): VerdictGrade {
  const verdict = result.verdict;
  if (!verdict) {
    return {
      categoryCorrect: false,
      categoryAcceptable: false,
      confidenceInRange: false,
      harmWeight: claim.harmWeight,
      rawScore: 0,
      weightedScore: 0,
      maxWeightedScore: 100 * claim.harmWeight,
    };
  }

  const categoryCorrect = verdict.category === claim.expectedCategory;
  const categoryAcceptable = claim.acceptableCategories.includes(verdict.category);

  const [lo, hi] = claim.expectedConfidenceRange;
  const confidenceInRange = verdict.confidence >= lo && verdict.confidence <= hi;

  let rawScore = 0;

  // Category scoring: exact match 50, acceptable 30, otherwise 0
  if (categoryCorrect) {
    rawScore += 50;
  } else if (categoryAcceptable) {
    rawScore += 30;
  }

  // Confidence in range: 30 points
  if (confidenceInRange) {
    rawScore += 30;
  }

  // Has key findings: 10 points
  if (verdict.keyFindings.length > 0) {
    rawScore += 10;
  }

  // Has sources: 10 points
  if (verdict.sources.length > 0) {
    rawScore += 10;
  }

  return {
    categoryCorrect,
    categoryAcceptable,
    confidenceInRange,
    harmWeight: claim.harmWeight,
    rawScore,
    weightedScore: rawScore * claim.harmWeight,
    maxWeightedScore: 100 * claim.harmWeight,
  };
}

// ── Aggregate verdict scores ────────────────────────────────────

export function aggregateVerdictScores(grades: VerdictGrade[]): VerdictAggregateResult {
  if (grades.length === 0) {
    return {
      harmWeightedAccuracy: 0,
      exactMatchRate: 0,
      acceptableMatchRate: 0,
    };
  }

  const totalWeighted = grades.reduce((sum, g) => sum + g.weightedScore, 0);
  const totalMaxWeighted = grades.reduce((sum, g) => sum + g.maxWeightedScore, 0);

  const exactMatches = grades.filter((g) => g.categoryCorrect).length;
  const acceptableMatches = grades.filter((g) => g.categoryAcceptable).length;

  return {
    harmWeightedAccuracy: totalMaxWeighted > 0 ? (totalWeighted / totalMaxWeighted) * 100 : 0,
    exactMatchRate: (exactMatches / grades.length) * 100,
    acceptableMatchRate: (acceptableMatches / grades.length) * 100,
  };
}
