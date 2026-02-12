import { z } from "zod";

export const ClassifierResultSchema = z.object({
  category: z.enum(["factual_claim", "opinion", "scam", "greeting", "other"]),
  extractedClaim: z.string(),
  isCompound: z.boolean(),
  domain: z.enum(["public_health", "geopolitics", "economics", "science", "technology", "general"]),
  language: z.string(),
  urgency: z.enum(["low", "medium", "high"]),
  reasoning: z.string(),
});

export type ClassifierResult = z.infer<typeof ClassifierResultSchema>;
