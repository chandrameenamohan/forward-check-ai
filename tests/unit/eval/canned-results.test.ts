import { describe, it, expect } from "vitest";
import { getCannedResults, FACTUAL_CLAIM_IDS } from "../../../eval/canned-results.js";

describe("Eval canned results", () => {
  it("getCannedResults returns results for all factual claim IDs", () => {
    for (const claimId of FACTUAL_CLAIM_IDS) {
      const results = getCannedResults(claimId);
      expect(
        results,
        `Missing canned results for claim "${claimId}"`,
      ).toBeDefined();
    }
  });

  it("each result set has at least 1 brave result", () => {
    for (const claimId of FACTUAL_CLAIM_IDS) {
      const results = getCannedResults(claimId);
      expect(
        results.brave.length,
        `Claim "${claimId}" has no brave results`,
      ).toBeGreaterThanOrEqual(1);
    }
  });

  it("captured fixtures match expected JSON shape", () => {
    for (const claimId of FACTUAL_CLAIM_IDS) {
      const results = getCannedResults(claimId);

      // Brave results shape
      for (const result of results.brave) {
        expect(result).toHaveProperty("title");
        expect(result).toHaveProperty("url");
        expect(result).toHaveProperty("description");
        expect(typeof result.title).toBe("string");
        expect(typeof result.url).toBe("string");
        expect(typeof result.description).toBe("string");
      }

      // Fact check claims shape
      for (const claim of results.factCheck) {
        expect(claim).toHaveProperty("text");
        expect(claim).toHaveProperty("claimant");
        expect(claim).toHaveProperty("claimReviewMarkup");
        expect(claim.claimReviewMarkup).toHaveProperty("url");
        expect(claim.claimReviewMarkup).toHaveProperty("title");
        expect(claim.claimReviewMarkup).toHaveProperty("publisher");
        expect(claim.claimReviewMarkup).toHaveProperty("rating");
      }
    }
  });

  it("FACTUAL_CLAIM_IDS contains exactly 12 IDs", () => {
    expect(FACTUAL_CLAIM_IDS).toHaveLength(12);
  });

  it("returns empty factCheck array when API returned no results", () => {
    // factCheck results can legitimately be empty for some claims
    for (const claimId of FACTUAL_CLAIM_IDS) {
      const results = getCannedResults(claimId);
      expect(Array.isArray(results.factCheck)).toBe(true);
    }
  });
});
