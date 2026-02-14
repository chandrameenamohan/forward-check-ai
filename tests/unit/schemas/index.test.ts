import { describe, it, expect } from "vitest";
import {
  ClassifierResultSchema,
  SearchStrategySchema,
  AgentReportSchema,
  ChallengeReportSchema,
  FinalVerdictSchema,
} from "../../../src/schemas/index.js";
import type {
  ClassifierResult,
  SearchStrategy,
  AgentReport,
  ChallengeReport,
  FinalVerdict,
} from "../../../src/schemas/index.js";

describe("schemas barrel export", () => {
  it("should export all 5 schemas", () => {
    expect(ClassifierResultSchema).toBeDefined();
    expect(SearchStrategySchema).toBeDefined();
    expect(AgentReportSchema).toBeDefined();
    expect(ChallengeReportSchema).toBeDefined();
    expect(FinalVerdictSchema).toBeDefined();
  });

  it("should export all 5 TypeScript types", () => {
    // Type-level assertions — if these compile, the types are exported correctly.
    // We create dummy values satisfying the types to confirm they resolve.
    const classifier: ClassifierResult = {
      category: "factual_claim",
      extractedClaim: "test",
      isCompound: false,
      domain: "general",
      language: "en",
      urgency: "low",
      reasoning: "test",
    };
    expect(classifier).toBeDefined();

    const strategy: SearchStrategy = {
      claimCharacteristics: {
        temporalRelevance: "recent",
        geographicScope: "national",
        technicalComplexity: "low",
        emotionalValence: "neutral",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["s1"],
          lookFor: ["l1"],
        },
        domainExpertise: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["s1"],
          lookFor: ["l1"],
        },
        patternMatching: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["s1"],
          lookFor: ["l1"],
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["x"],
        whatWouldProveFalse: ["y"],
      },
      thinkingExcerpt: "excerpt",
    };
    expect(strategy).toBeDefined();

    const report: AgentReport = {
      agentRole: "source_verification",
      summary: "test",
      findings: [],
      overallAssessment: "test",
      confidenceScore: 50,
    };
    expect(report).toBeDefined();

    const challenge: ChallengeReport = {
      challenges: [],
      overallAssessment: "test",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "test",
      thinkingExcerpt: "excerpt",
    };
    expect(challenge).toBeDefined();

    const verdict: FinalVerdict = {
      category: "likely-true",
      confidence: 90,
      confidenceDecomposition: {
        evidenceStrength: 90,
        sourceReliability: 85,
        claimComplexity: 80,
        counterArgumentResilience: 95,
      },
      summary: "test",
      reasoning: "test",
      manipulationTechniques: [],
      keyFindings: [],
      sources: [],
      whatWouldChangeMyMind: "test",
      devilsAdvocateOutcome: "counter_argument_failed",
      deepReasoningActivated: false,
      thinkingSummary: "test",
    };
    expect(verdict).toBeDefined();
  });
});
