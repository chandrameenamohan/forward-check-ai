import { z } from "zod";

const Challenge = z.object({
  targetAgent: z.string(),
  claim: z.string(),
  challenge: z.string(),
  severity: z.enum(["critical", "moderate", "minor"]),
  evidence: z.string(),
});

export const ChallengeReportSchema = z.object({
  challenges: z.array(Challenge),
  overallAssessment: z.string(),
  suggestedConfidenceAdjustment: z.number().min(-30).max(30),
  counterArgumentSucceeded: z.boolean(),
  counterArgumentSummary: z.string(),
  thinkingExcerpt: z.string().max(500),
});

export type ChallengeReport = z.infer<typeof ChallengeReportSchema>;
