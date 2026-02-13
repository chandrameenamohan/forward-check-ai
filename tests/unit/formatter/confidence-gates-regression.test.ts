import { describe, it, expect } from "vitest";
import { enforceConfidenceGates } from "../../../src/formatter/confidence-gates.js";
import { makeFinalVerdict } from "../../fixtures/index.js";

/**
 * Regression tests for confidence gate boundary values.
 * These complement (not duplicate) the tests in confidence-gates.test.ts,
 * focusing on exact threshold boundaries (-1 values) and the full
 * mismatch-correction matrix.
 *
 * Gate ranges:
 *   likely-true:    85–100
 *   partially-true: 60–84
 *   unverified:     30–59
 *   likely-false:    0–29
 *   satire/opinion: bypass (no override)
 */
describe("Confidence gate boundary regression tests", () => {
  describe("boundary values at threshold -1 (just below gate floor)", () => {
    it("should map confidence 84 to partially-true, not likely-true", () => {
      const verdict = makeFinalVerdict({ category: "likely-true", confidence: 84 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("partially-true");
    });

    it("should map confidence 59 to unverified, not partially-true", () => {
      const verdict = makeFinalVerdict({ category: "partially-true", confidence: 59 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("unverified");
    });

    it("should map confidence 29 to likely-false, not unverified", () => {
      const verdict = makeFinalVerdict({ category: "unverified", confidence: 29 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("likely-false");
    });
  });

  describe("boundary values at gate ceiling (max of range)", () => {
    it("should map confidence 100 to likely-true", () => {
      const verdict = makeFinalVerdict({ category: "likely-true", confidence: 100 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("likely-true");
    });

    it("should map confidence 84 to partially-true (ceiling of range)", () => {
      const verdict = makeFinalVerdict({ category: "partially-true", confidence: 84 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("partially-true");
    });

    it("should map confidence 59 to unverified (ceiling of range)", () => {
      const verdict = makeFinalVerdict({ category: "unverified", confidence: 59 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("unverified");
    });

    it("should map confidence 29 to likely-false (ceiling of range)", () => {
      const verdict = makeFinalVerdict({ category: "likely-false", confidence: 29 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("likely-false");
    });
  });

  describe("category-bypass for satire and opinion", () => {
    it("should not override satire with confidence 95", () => {
      const verdict = makeFinalVerdict({ category: "satire", confidence: 95 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("satire");
    });

    it("should not override opinion with confidence 10", () => {
      const verdict = makeFinalVerdict({ category: "opinion", confidence: 10 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("opinion");
    });

    it("should not override satire with confidence 0", () => {
      const verdict = makeFinalVerdict({ category: "satire", confidence: 0 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("satire");
    });

    it("should not override opinion with confidence 100", () => {
      const verdict = makeFinalVerdict({ category: "opinion", confidence: 100 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("opinion");
    });
  });

  describe("mismatch-correction matrix", () => {
    it("should correct likely-true with confidence 50 to unverified", () => {
      const verdict = makeFinalVerdict({ category: "likely-true", confidence: 50 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("unverified");
    });

    it("should correct likely-false with confidence 90 to likely-true", () => {
      const verdict = makeFinalVerdict({ category: "likely-false", confidence: 90 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("likely-true");
    });

    it("should correct partially-true with confidence 25 to likely-false", () => {
      const verdict = makeFinalVerdict({ category: "partially-true", confidence: 25 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("likely-false");
    });

    it("should correct unverified with confidence 88 to likely-true", () => {
      const verdict = makeFinalVerdict({ category: "unverified", confidence: 88 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("likely-true");
    });

    it("should correct likely-false with confidence 65 to partially-true", () => {
      const verdict = makeFinalVerdict({ category: "likely-false", confidence: 65 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("partially-true");
    });

    it("should correct likely-true with confidence 15 to likely-false", () => {
      const verdict = makeFinalVerdict({ category: "likely-true", confidence: 15 });
      const result = enforceConfidenceGates(verdict);
      expect(result.category).toBe("likely-false");
    });
  });
});
