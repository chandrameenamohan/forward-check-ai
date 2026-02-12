import { z } from "zod";

const ManipulationTechnique = z.object({
  technique: z.string(),
  description: z.string(),
  evidenceQuote: z.string(),
  severity: z.number().min(0).max(100),
});

const Source = z.object({
  url: z.string(),
  title: z.string(),
  relevance: z.string(),
});

const ConfidenceDecomposition = z.object({
  evidenceStrength: z.number().min(0).max(100),
  sourceReliability: z.number().min(0).max(100),
  claimComplexity: z.number().min(0).max(100),
  counterArgumentResilience: z.number().min(0).max(100),
});

const FalsificationCriteria = z.object({
  whatWouldProveTrue: z.array(z.string()),
  whatWouldProveFalse: z.array(z.string()),
});

export const FinalVerdictSchema = z.object({
  category: z.enum([
    "likely-true",
    "partially-true",
    "unverified",
    "likely-false",
    "satire",
    "opinion",
  ]),
  nuanceTag: z
    .enum([
      "misleading",
      "out-of-context",
      "exaggerated",
      "fabricated",
      "recirculated",
      "scam",
    ])
    .optional(),
  confidence: z.number().min(0).max(100),
  confidenceDecomposition: ConfidenceDecomposition,
  summary: z.string().max(300),
  reasoning: z.string(),
  manipulationTechniques: z.array(ManipulationTechnique),
  keyFindings: z.array(z.string()),
  sources: z.array(Source),
  whatWouldChangeMyMind: z.string(),
  falsificationCriteria: FalsificationCriteria.optional(),
  devilsAdvocateOutcome: z.enum([
    "counter_argument_failed",
    "counter_argument_partially_succeeded",
    "counter_argument_succeeded",
  ]),
  deepReasoningActivated: z.boolean().default(false),
  thinkingSummary: z.string(),
});

export type FinalVerdict = z.infer<typeof FinalVerdictSchema>;
