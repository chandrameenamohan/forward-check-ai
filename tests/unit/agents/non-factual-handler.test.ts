import { describe, it, expect } from "vitest";
import type { ClassifierResult } from "../../../src/schemas/classifier-result.js";
import { handleNonFactual } from "../../../src/agents/non-factual-handler.js";

function makeResult(category: ClassifierResult["category"]): ClassifierResult {
  return {
    category,
    extractedClaim: "",
    isCompound: false,
    domain: "general",
    language: "en",
    urgency: "low",
    reasoning: "test",
  };
}

describe("handleNonFactual", () => {
  it("should return greeting response for greeting category", () => {
    const result = handleNonFactual(makeResult("greeting"));

    expect(result.shouldInvestigate).toBe(false);
    expect(result.text).toBeTruthy();
    expect(result.text.length).toBeGreaterThan(10);
    // Should mention what the bot does
    expect(result.text.toLowerCase()).toMatch(/forward|fact.check|claim|message/);
  });

  it("should return opinion response for opinion category", () => {
    const result = handleNonFactual(makeResult("opinion"));

    expect(result.shouldInvestigate).toBe(false);
    expect(result.text).toBeTruthy();
    // Should mention opinions vs facts
    expect(result.text.toLowerCase()).toMatch(/opinion|fact/);
  });

  it("should return scam warning for scam category", () => {
    const result = handleNonFactual(makeResult("scam"));

    expect(result.shouldInvestigate).toBe(false);
    expect(result.text).toBeTruthy();
    // Should warn about scam and include safety tips
    expect(result.text.toLowerCase()).toMatch(/scam|warning|suspicious/);
    expect(result.text.toLowerCase()).toMatch(/click|personal|share|link|forward/);
  });

  it("should return guidance for other category", () => {
    const result = handleNonFactual(makeResult("other"));

    expect(result.shouldInvestigate).toBe(false);
    expect(result.text).toBeTruthy();
    // Should ask user to forward a specific claim
    expect(result.text.toLowerCase()).toMatch(/forward|claim|message/);
  });
});
