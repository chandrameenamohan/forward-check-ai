import { createLogger } from "../config/logger.js";
import type { FinalVerdict } from "../schemas/final-verdict.js";

const logger = createLogger({ level: "info" });

type GatedCategory = "likely-true" | "partially-true" | "unverified" | "likely-false";

const BYPASS_CATEGORIES = new Set(["satire", "opinion"]);

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

export function enforceConfidenceGates(verdict: FinalVerdict): FinalVerdict {
  if (BYPASS_CATEGORIES.has(verdict.category)) {
    return { ...verdict };
  }

  const correctCategory = getCategoryForConfidence(verdict.confidence);

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
