import { describe, it, expect } from "vitest";
import {
  makeClassifierResult,
  makeSearchStrategy,
  makeAgentReport,
  makeChallengeReport,
  makeFinalVerdict,
  makeInvestigation,
  makeCannedBraveResults,
  makeCannedFactCheckResults,
} from "../../fixtures/index.js";
import { ClassifierResultSchema } from "../../../src/schemas/classifier-result.js";
import { SearchStrategySchema } from "../../../src/schemas/search-strategy.js";
import { AgentReportSchema } from "../../../src/schemas/agent-report.js";
import { ChallengeReportSchema } from "../../../src/schemas/challenge-report.js";
import { FinalVerdictSchema } from "../../../src/schemas/final-verdict.js";

describe("Fixture factories", () => {
  describe("each factory produces Zod-valid output", () => {
    it("should produce valid ClassifierResult", () => {
      const result = makeClassifierResult();
      const parsed = ClassifierResultSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should produce valid SearchStrategy", () => {
      const result = makeSearchStrategy();
      const parsed = SearchStrategySchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should produce valid AgentReport", () => {
      const result = makeAgentReport();
      const parsed = AgentReportSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should produce valid ChallengeReport", () => {
      const result = makeChallengeReport();
      const parsed = ChallengeReportSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });

    it("should produce valid FinalVerdict", () => {
      const result = makeFinalVerdict();
      const parsed = FinalVerdictSchema.safeParse(result);
      expect(parsed.success).toBe(true);
    });
  });

  describe("overrides are deep-merged correctly", () => {
    it("should apply top-level overrides to ClassifierResult", () => {
      const result = makeClassifierResult({ category: "scam", urgency: "high" });
      expect(result.category).toBe("scam");
      expect(result.urgency).toBe("high");
      expect(result.extractedClaim).toBeDefined();
    });

    it("should apply nested overrides to SearchStrategy", () => {
      const result = makeSearchStrategy({
        claimCharacteristics: {
          type: "scientific_claim",
          verifiabilityAssessment: "Custom assessment",
        },
      });
      expect(result.claimCharacteristics.type).toBe("scientific_claim");
      expect(result.claimCharacteristics.verifiabilityAssessment).toBe("Custom assessment");
      expect(result.investigatorGuidance).toBeDefined();
    });

    it("should apply nested overrides to FinalVerdict confidenceDecomposition", () => {
      const result = makeFinalVerdict({
        confidenceDecomposition: {
          evidenceStrength: 10,
          sourceReliability: 20,
          claimComplexity: 30,
          counterArgumentResilience: 40,
        },
      });
      expect(result.confidenceDecomposition.evidenceStrength).toBe(10);
      expect(result.confidenceDecomposition.sourceReliability).toBe(20);
    });

    it("should apply top-level overrides to AgentReport", () => {
      const result = makeAgentReport({
        agentRole: "pattern_matching",
        confidenceScore: 42,
      });
      expect(result.agentRole).toBe("pattern_matching");
      expect(result.confidenceScore).toBe(42);
    });

    it("should apply overrides to ChallengeReport", () => {
      const result = makeChallengeReport({
        counterArgumentSucceeded: true,
        suggestedConfidenceAdjustment: -15,
      });
      expect(result.counterArgumentSucceeded).toBe(true);
      expect(result.suggestedConfidenceAdjustment).toBe(-15);
    });

    it("should apply overrides to Investigation row", () => {
      const result = makeInvestigation({
        status: "completed",
        total_cost_usd: 1.23,
      });
      expect(result.status).toBe("completed");
      expect(result.total_cost_usd).toBe(1.23);
      expect(result.id).toBeDefined();
      expect(result.original_message).toBeDefined();
    });
  });

  describe("canned search results have expected shape", () => {
    it("should return Brave search results with required fields", () => {
      const results = makeCannedBraveResults();
      expect(results.results.length).toBeGreaterThan(0);
      for (const r of results.results) {
        expect(r.title).toBeDefined();
        expect(r.url).toBeDefined();
        expect(r.description).toBeDefined();
        expect(r.age).toBeDefined();
      }
    });

    it("should return Google Fact Check results with required fields", () => {
      const results = makeCannedFactCheckResults();
      expect(results.claims.length).toBeGreaterThan(0);
      for (const claim of results.claims) {
        expect(claim.text).toBeDefined();
        expect(claim.claimant).toBeDefined();
        expect(claim.claimReviewMarkup).toBeDefined();
        expect(claim.claimReviewMarkup.url).toBeDefined();
        expect(claim.claimReviewMarkup.title).toBeDefined();
        expect(claim.claimReviewMarkup.publisher).toBeDefined();
        expect(claim.claimReviewMarkup.rating).toBeDefined();
      }
    });
  });
});
