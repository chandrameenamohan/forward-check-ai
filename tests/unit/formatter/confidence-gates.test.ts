import { describe, it, expect } from "vitest";
import { enforceConfidenceGates } from "../../../src/formatter/confidence-gates.js";
import type { FinalVerdict } from "../../../src/schemas/final-verdict.js";

function makeVerdict(overrides: Partial<FinalVerdict> = {}): FinalVerdict {
  return {
    category: "likely-true",
    confidence: 90,
    confidenceDecomposition: {
      evidenceStrength: 90,
      sourceReliability: 85,
      claimComplexity: 80,
      counterArgumentResilience: 95,
    },
    summary: "Test summary",
    reasoning: "Test reasoning",
    manipulationTechniques: [],
    keyFindings: ["finding1"],
    sources: [],
    whatWouldChangeMyMind: "Nothing",
    devilsAdvocateOutcome: "counter_argument_failed",
    deepReasoningActivated: false,
    thinkingSummary: "Test thinking",
    ...overrides,
  };
}

describe("enforceConfidenceGates", () => {
  it("should not change category when confidence matches gate", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 90 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("likely-true");
    expect(result.confidence).toBe(90);
  });

  it("should not change likely-true at boundary 85", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 85 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("likely-true");
  });

  it("should not change partially-true at boundary 60", () => {
    const verdict = makeVerdict({ category: "partially-true", confidence: 60 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("partially-true");
  });

  it("should not change unverified at boundary 30", () => {
    const verdict = makeVerdict({ category: "unverified", confidence: 30 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("unverified");
  });

  it("should not change likely-false at boundary 0", () => {
    const verdict = makeVerdict({ category: "likely-false", confidence: 0 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("likely-false");
  });

  it("should override likely-true to partially-true when confidence is 70", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 70 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("partially-true");
  });

  it("should override likely-false to unverified when confidence is 45", () => {
    const verdict = makeVerdict({ category: "likely-false", confidence: 45 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("unverified");
  });

  it("should override likely-true to unverified when confidence is 50", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 50 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("unverified");
  });

  it("should override likely-true to likely-false when confidence is 20", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 20 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("likely-false");
  });

  it("should override partially-true to likely-true when confidence is 90", () => {
    const verdict = makeVerdict({ category: "partially-true", confidence: 90 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("likely-true");
  });

  it("should override unverified to likely-false when confidence is 10", () => {
    const verdict = makeVerdict({ category: "unverified", confidence: 10 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("likely-false");
  });

  it("should not override satire category regardless of confidence", () => {
    const verdict = makeVerdict({ category: "satire", confidence: 20 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("satire");
  });

  it("should not override satire category with high confidence", () => {
    const verdict = makeVerdict({ category: "satire", confidence: 95 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("satire");
  });

  it("should not override opinion category regardless of confidence", () => {
    const verdict = makeVerdict({ category: "opinion", confidence: 50 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("opinion");
  });

  it("should not override opinion category with low confidence", () => {
    const verdict = makeVerdict({ category: "opinion", confidence: 5 });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("opinion");
  });

  it("should return a new object without mutating the original", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 70 });
    const result = enforceConfidenceGates(verdict);
    expect(result).not.toBe(verdict);
    expect(verdict.category).toBe("likely-true");
    expect(result.category).toBe("partially-true");
  });

  it("should preserve all other verdict fields when overriding", () => {
    const verdict = makeVerdict({
      category: "likely-true",
      confidence: 70,
      summary: "Keep this summary",
      reasoning: "Keep this reasoning",
      keyFindings: ["finding1", "finding2"],
    });
    const result = enforceConfidenceGates(verdict);
    expect(result.category).toBe("partially-true");
    expect(result.summary).toBe("Keep this summary");
    expect(result.reasoning).toBe("Keep this reasoning");
    expect(result.keyFindings).toEqual(["finding1", "finding2"]);
  });
});
