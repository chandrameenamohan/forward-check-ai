import { z } from "zod";

const InvestigatorGuidanceRole = z.object({
  targetQueries: z.array(z.string()).min(2).max(5),
  prioritySources: z.array(z.string()),
  lookFor: z.string(),
});

export const SearchStrategySchema = z.object({
  claimCharacteristics: z.object({
    type: z.enum([
      "factual_statistic",
      "authority_claim",
      "event_claim",
      "scientific_claim",
      "policy_claim",
      "viral_forward",
    ]),
    suspectedPattern: z
      .enum([
        "zombie_claim",
        "statistical_distortion",
        "authority_impersonation",
        "out_of_context",
        "fabrication",
        "exaggeration",
        "unknown",
      ])
      .optional(),
    verifiabilityAssessment: z.string().max(200),
  }),
  investigatorGuidance: z.object({
    sourceVerification: InvestigatorGuidanceRole,
    domainExpertise: InvestigatorGuidanceRole,
    patternMatching: InvestigatorGuidanceRole,
  }),
  falsificationCriteria: z.object({
    whatWouldProveTrue: z.array(z.string()).min(1).max(3),
    whatWouldProveFalse: z.array(z.string()).min(1).max(3),
  }),
  thinkingExcerpt: z.string().max(500),
});

export type SearchStrategy = z.infer<typeof SearchStrategySchema>;
