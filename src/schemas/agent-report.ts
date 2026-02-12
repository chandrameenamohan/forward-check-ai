import { z } from "zod";

const FindingSource = z.object({
  url: z.string(),
  title: z.string(),
  credibility: z.enum(["high", "medium", "low", "unknown"]),
  relevantSnippet: z.string(),
});

const Finding = z.object({
  claim: z.string(),
  assessment: z.enum(["supported", "contradicted", "insufficient_evidence", "mixed"]),
  confidence: z.number().min(0).max(100),
  sources: z.array(FindingSource),
  rawSnippets: z.array(z.string()).optional(),
});

export const AgentReportSchema = z.object({
  agentRole: z.enum(["source_verification", "domain_expertise", "pattern_matching"]),
  summary: z.string().max(500),
  findings: z.array(Finding),
  manipulationIndicators: z.array(z.string()).optional(),
  overallAssessment: z.string(),
  confidenceScore: z.number().min(0).max(100),
});

export type AgentReport = z.infer<typeof AgentReportSchema>;
