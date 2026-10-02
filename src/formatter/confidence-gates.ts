import { createLogger } from "../config/logger.js";
import type { FinalVerdict } from "../schemas/final-verdict.js";

const logger = createLogger({ level: "info" });

type GatedCategory = "likely-true" | "partially-true" | "unverified" | "likely-false";

const BYPASS_CATEGORIES = new Set(["satire", "opinion"]);

const POLES = new Set(["likely-true", "likely-false"]);

interface Gate {
  min: number;
  max: number;
  category: GatedCategory;
}

const GATES: Gate[] = [
  { min: 85, max: 100, category: "likely-true" },
  { min: 60, max: 84, category: "partially-true" },
  { min: 30, max: 59, category: "unverified" },
  { min: 0, max: 29, category: "likely-false" },
];

function getCategoryForConfidence(confidence: number): GatedCategory {
  for (const gate of GATES) {
    if (confidence >= gate.min && confidence <= gate.max) {
      return gate.category;
    }
  }
  return "unverified";
}

/**
 * Detect whether the Judge's confidence score is misaligned with its category.
 * Returns true if the confidence does not fall in the expected range for the category.
 * Satire and opinion categories always return false (bypass).
 */
export function detectConfidenceMismatch(verdict: FinalVerdict): boolean {
  if (BYPASS_CATEGORIES.has(verdict.category)) {
    return false;
  }

  const expectedCategory = getCategoryForConfidence(verdict.confidence);
  return expectedCategory !== verdict.category;
}

export function enforceConfidenceGates(verdict: FinalVerdict): FinalVerdict {
  if (BYPASS_CATEGORIES.has(verdict.category)) {
    return { ...verdict };
  }

  let correctCategory: FinalVerdict["category"] = getCategoryForConfidence(verdict.confidence);
  // The Judge said one pole and scored the other (likely-false at 97): it contradicted itself, and the score
  // alone must not turn its verdict into the opposite one. Say what is known: nothing was verified.
  if (POLES.has(verdict.category) && POLES.has(correctCategory) && correctCategory !== verdict.category) {
    correctCategory = "unverified";
  }

  if (correctCategory !== verdict.category) {
    logger.warn(
      {
        originalCategory: verdict.category,
        correctedCategory: correctCategory,
        confidence: verdict.confidence,
      },
      "Confidence gate override: category adjusted to match confidence score"
    );
  }

  return { ...verdict, category: correctCategory };
}
