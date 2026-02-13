import { describe, it, expect } from "vitest";
import {
  enforceConfidenceGates,
  detectConfidenceMismatch,
} from "../../../src/formatter/confidence-gates.js";
import { makeFinalVerdict as makeVerdict } from "../../fixtures/index.js";

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

describe("detectConfidenceMismatch", () => {
  it("should return true for likely-false with confidence 97", () => {
    const verdict = makeVerdict({ category: "likely-false", confidence: 97 });
    expect(detectConfidenceMismatch(verdict)).toBe(true);
  });

  it("should return false for likely-false with confidence 15", () => {
    const verdict = makeVerdict({ category: "likely-false", confidence: 15 });
    expect(detectConfidenceMismatch(verdict)).toBe(false);
  });

  it("should return true for likely-true with confidence 50", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 50 });
    expect(detectConfidenceMismatch(verdict)).toBe(true);
  });

  it("should return false for likely-true with confidence 92", () => {
    const verdict = makeVerdict({ category: "likely-true", confidence: 92 });
    expect(detectConfidenceMismatch(verdict)).toBe(false);
  });

  it("should return false for satire regardless of confidence", () => {
    const verdict = makeVerdict({ category: "satire", confidence: 50 });
    expect(detectConfidenceMismatch(verdict)).toBe(false);
  });

  it("should return false for opinion regardless of confidence", () => {
    const verdict = makeVerdict({ category: "opinion", confidence: 10 });
    expect(detectConfidenceMismatch(verdict)).toBe(false);
  });

  it("should return true for partially-true with confidence 30", () => {
    const verdict = makeVerdict({ category: "partially-true", confidence: 30 });
    expect(detectConfidenceMismatch(verdict)).toBe(true);
  });

  it("should return false for unverified with confidence 45", () => {
    const verdict = makeVerdict({ category: "unverified", confidence: 45 });
    expect(detectConfidenceMismatch(verdict)).toBe(false);
  });
});
