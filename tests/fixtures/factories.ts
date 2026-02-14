import type { ClassifierResult } from "../../src/schemas/classifier-result.js";
import type { SearchStrategy } from "../../src/schemas/search-strategy.js";
import type { AgentReport } from "../../src/schemas/agent-report.js";
import type { ChallengeReport } from "../../src/schemas/challenge-report.js";
import type { FinalVerdict } from "../../src/schemas/final-verdict.js";
import type { Investigation } from "../../src/db/investigation-repository.js";

export function makeClassifierResult(
  overrides: Partial<ClassifierResult> = {},
): ClassifierResult {
  return {
    category: "factual_claim",
    extractedClaim: "Test claim for fact-checking",
    isCompound: false,
    domain: "general",
    language: "en",
    urgency: "medium",
    reasoning: "This is a testable factual claim.",
    ...overrides,
  };
}

export function makeSearchStrategy(
  overrides: Partial<SearchStrategy> = {},
): SearchStrategy {
  const base: SearchStrategy = {
    claimCharacteristics: {
      type: "factual_statistic",
      verifiabilityAssessment: "Directly verifiable via official sources",
    },
    investigatorGuidance: {
      sourceVerification: {
        targetQueries: ["test query 1", "test query 2"],
        prioritySources: ["reuters.com", "apnews.com"],
        lookFor: "Official statements or data",
      },
      domainExpertise: {
        targetQueries: ["domain query 1", "domain query 2"],
        prioritySources: ["who.int", "cdc.gov"],
        lookFor: "Expert analysis and data",
      },
      patternMatching: {
        targetQueries: ["pattern query 1", "pattern query 2"],
        prioritySources: ["snopes.com", "politifact.com"],
        lookFor: "Previous fact-checks and debunks",
      },
    },
    falsificationCriteria: {
      whatWouldProveTrue: ["Official government confirmation"],
      whatWouldProveFalse: ["Official denial from relevant authority"],
    },
    thinkingExcerpt: "Strategic analysis of the claim.",
  };

  if (overrides.claimCharacteristics) {
    base.claimCharacteristics = {
      ...base.claimCharacteristics,
      ...overrides.claimCharacteristics,
    };
  }
  if (overrides.investigatorGuidance) {
    base.investigatorGuidance = {
      ...base.investigatorGuidance,
      ...overrides.investigatorGuidance,
    };
  }
  if (overrides.falsificationCriteria) {
    base.falsificationCriteria = {
      ...base.falsificationCriteria,
      ...overrides.falsificationCriteria,
    };
  }
  if (overrides.thinkingExcerpt !== undefined) {
    base.thinkingExcerpt = overrides.thinkingExcerpt;
  }

  return base;
}

export function makeAgentReport(
  overrides: Partial<AgentReport> = {},
): AgentReport {
  return {
    agentRole: "source_verification",
    summary: "Test agent report summary",
    findings: [
      {
        claim: "Test claim",
        assessment: "supported",
        confidence: 75,
        sources: [
          {
            url: "https://example.com/source",
            title: "Test Source",
            credibility: "high",
            relevantSnippet: "Relevant snippet from the source.",
          },
        ],
      },
    ],
    manipulationIndicators: [],
    overallAssessment: "The claim appears to be supported by available evidence.",
    confidenceScore: 75,
    ...overrides,
  };
}

export function makeChallengeReport(
  overrides: Partial<ChallengeReport> = {},
): ChallengeReport {
  return {
    challenges: [
      {
        targetAgent: "source_verification",
        claim: "Test challenge claim",
        challenge: "The source may not be authoritative.",
        severity: "moderate",
        evidence: "Source credibility is uncertain.",
      },
    ],
    overallAssessment: "The investigation findings are mostly sound.",
    suggestedConfidenceAdjustment: -5,
    counterArgumentSucceeded: false,
    counterArgumentSummary: "Counter-argument did not succeed.",
    thinkingExcerpt: "Analyzed the investigator reports critically.",
    ...overrides,
  };
}

export function makeFinalVerdict(
  overrides: Partial<FinalVerdict> = {},
): FinalVerdict {
  return {
    category: "likely-true",
    confidence: 90,
    confidenceDecomposition: {
      evidenceStrength: 90,
      sourceReliability: 85,
      claimComplexity: 80,
      counterArgumentResilience: 95,
    },
    summary: "Test verdict summary",
    reasoning: "Test reasoning for the verdict.",
    manipulationTechniques: [],
    keyFindings: ["Key finding 1"],
    sources: [
      {
        url: "https://example.com/source",
        title: "Test Source",
        relevance: "Primary source",
      },
    ],
    whatWouldChangeMyMind: "Strong counter-evidence from official sources.",
    devilsAdvocateOutcome: "counter_argument_failed",
    deepReasoningActivated: false,
    thinkingSummary: "Test thinking summary.",
    ...overrides,
  };
}

export function makeInvestigation(
  overrides: Partial<Investigation> = {},
): Investigation {
  return {
    id: "test-investigation-id",
    original_message: "Test message for investigation",
    extracted_claim: "Test extracted claim",
    status: "pending",
    classifier_result: null,
    search_strategy: null,
    agent_reports: null,
    challenge_report: null,
    final_verdict: null,
    telegram_chat_id: null,
    telegram_message_id: null,
    created_at: "2024-01-01T00:00:00Z",
    completed_at: null,
    total_cost_usd: 0,
    pipeline_duration_ms: null,
    ...overrides,
  };
}
