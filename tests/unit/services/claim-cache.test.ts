import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { ClaimCache } from "../../../src/services/claim-cache.js";
import type { FinalVerdict } from "../../../src/schemas/final-verdict.js";

function makeFakeVerdict(overrides?: Partial<FinalVerdict>): FinalVerdict {
  return {
    category: "likely-false",
    confidence: 22,
    confidenceDecomposition: {
      evidenceStrength: 30,
      sourceReliability: 20,
      claimComplexity: 50,
      counterArgumentResilience: 10,
    },
    summary: "This claim is false.",
    reasoning: "No evidence supports it.",
    manipulationTechniques: [],
    keyFindings: ["No evidence found"],
    sources: [],
    whatWouldChangeMyMind: "Official government announcement",
    devilsAdvocateOutcome: "counter_argument_failed",
    deepReasoningActivated: false,
    thinkingSummary: "Analyzed and found false.",
    ...overrides,
  };
}

describe("ClaimCache", () => {
  let cache: ClaimCache;

  beforeEach(() => {
    vi.useFakeTimers();
    cache = new ClaimCache();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("should cache and retrieve verdicts by normalized claim", () => {
    const verdict = makeFakeVerdict();
    const investigationId = "inv-abc123";

    cache.set("Some factual claim here", verdict, investigationId);

    const hit = cache.get("Some factual claim here");
    expect(hit).not.toBeNull();
    expect(hit!.result).toEqual(verdict);
    expect(hit!.investigationId).toBe(investigationId);
  });

  it("should expire entries after TTL", () => {
    const verdict = makeFakeVerdict();
    cache.set("expiring claim", verdict, "inv-expire");

    // Advance time past the 1-hour TTL
    vi.advanceTimersByTime(60 * 60 * 1000 + 1);

    const hit = cache.get("expiring claim");
    expect(hit).toBeNull();
  });

  it("should normalize claim text for matching", () => {
    const verdict = makeFakeVerdict();
    cache.set("  PM Modi  gives   Rs 5000  ", verdict, "inv-norm");

    // Different whitespace and casing should still match
    const hit = cache.get("pm modi gives rs 5000");
    expect(hit).not.toBeNull();
    expect(hit!.investigationId).toBe("inv-norm");
  });

  it("should miss cache for different claims", () => {
    const verdict = makeFakeVerdict();
    cache.set("claim A about health", verdict, "inv-a");

    const hit = cache.get("completely different claim B");
    expect(hit).toBeNull();
  });

  it("should allow custom TTL", () => {
    const shortTtlCache = new ClaimCache(5000); // 5 seconds
    const verdict = makeFakeVerdict();
    shortTtlCache.set("short lived", verdict, "inv-short");

    // Still alive at 4s
    vi.advanceTimersByTime(4000);
    expect(shortTtlCache.get("short lived")).not.toBeNull();

    // Expired at 5s+
    vi.advanceTimersByTime(1001);
    expect(shortTtlCache.get("short lived")).toBeNull();
  });

  it("should overwrite existing entry for same normalized claim", () => {
    const verdict1 = makeFakeVerdict({ confidence: 10 });
    const verdict2 = makeFakeVerdict({ confidence: 90 });

    cache.set("duplicate claim", verdict1, "inv-1");
    cache.set("duplicate claim", verdict2, "inv-2");

    const hit = cache.get("duplicate claim");
    expect(hit).not.toBeNull();
    expect(hit!.result.confidence).toBe(90);
    expect(hit!.investigationId).toBe("inv-2");
  });
});
