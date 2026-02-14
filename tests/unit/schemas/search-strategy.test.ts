import { describe, it, expect } from "vitest";

describe("SearchStrategy schema", () => {
  it("should validate a correct SearchStrategy", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const valid = {
      claimCharacteristics: {
        type: "authority_claim",
        suspectedPattern: "authority_impersonation",
        verifiabilityAssessment: "Claim attributes a specific policy to PM Modi — verifiable via official government sources",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["Modi Rs 5000 transfer announcement", "India direct transfer scheme 2024"],
          prioritySources: ["pib.gov.in", "economictimes.com"],
          lookFor: "Official press releases or credible news reports confirming or denying the announcement",
        },
        domainExpertise: {
          targetQueries: ["India direct benefit transfer schemes", "PM-KISAN scheme details"],
          prioritySources: ["rbi.org.in", "finmin.gov.in"],
          lookFor: "Existing government transfer programs and their actual amounts",
        },
        patternMatching: {
          targetQueries: ["Modi Rs 5000 fact check", "PM Modi money transfer hoax"],
          prioritySources: ["altnews.in", "boomlive.in", "factly.in"],
          lookFor: "Previous fact-checks of similar claims about government transfers",
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["Official PIB press release announcing Rs 5000 transfer"],
        whatWouldProveFalse: ["No official source confirms, pattern matches known viral hoaxes"],
      },
      thinkingExcerpt: "This claim follows a common pattern of fabricated government transfer announcements...",
    };

    const result = SearchStrategySchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimCharacteristics.type).toBe("authority_claim");
      expect(result.data.claimCharacteristics.suspectedPattern).toBe("authority_impersonation");
      expect(result.data.investigatorGuidance.sourceVerification.targetQueries).toHaveLength(2);
      expect(result.data.falsificationCriteria.whatWouldProveTrue).toHaveLength(1);
      expect(result.data.thinkingExcerpt).toContain("common pattern");
    }
  });

  it("should require minimum 2 target queries per investigator", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const tooFewQueries = {
      claimCharacteristics: {
        type: "factual_statistic",
        verifiabilityAssessment: "Verifiable claim",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["only one query"], // too few
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        domainExpertise: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        patternMatching: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["Evidence A"],
        whatWouldProveFalse: ["Evidence B"],
      },
      thinkingExcerpt: "Some thinking",
    };

    const result = SearchStrategySchema.safeParse(tooFewQueries);
    expect(result.success).toBe(false);
  });

  it("should enforce max 500 chars on thinkingExcerpt", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const tooLongExcerpt = {
      claimCharacteristics: {
        type: "event_claim",
        verifiabilityAssessment: "Verifiable",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        domainExpertise: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        patternMatching: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["Evidence A"],
        whatWouldProveFalse: ["Evidence B"],
      },
      thinkingExcerpt: "x".repeat(501),
    };

    const result = SearchStrategySchema.safeParse(tooLongExcerpt);
    expect(result.success).toBe(false);
  });

  it("should reject missing falsification criteria", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const missingFalsification = {
      claimCharacteristics: {
        type: "scientific_claim",
        verifiabilityAssessment: "Verifiable via scientific literature",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["pubmed.gov"],
          lookFor: "Peer-reviewed studies",
        },
        domainExpertise: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["nature.com"],
          lookFor: "Expert analysis",
        },
        patternMatching: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["snopes.com"],
          lookFor: "Previous debunks",
        },
      },
      // falsificationCriteria is missing entirely
      thinkingExcerpt: "Some thinking",
    };

    const result = SearchStrategySchema.safeParse(missingFalsification);
    expect(result.success).toBe(false);
  });

  it("should allow optional suspectedPattern", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const withoutPattern = {
      claimCharacteristics: {
        type: "policy_claim",
        // suspectedPattern omitted
        verifiabilityAssessment: "Can be verified via official records",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["gov.in"],
          lookFor: "Official records",
        },
        domainExpertise: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["reuters.com"],
          lookFor: "Policy analysis",
        },
        patternMatching: {
          targetQueries: ["query 1", "query 2"],
          prioritySources: ["factcheck.org"],
          lookFor: "Previous checks",
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["Official announcement"],
        whatWouldProveFalse: ["No official source"],
      },
      thinkingExcerpt: "Analyzing the policy claim",
    };

    const result = SearchStrategySchema.safeParse(withoutPattern);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.claimCharacteristics.suspectedPattern).toBeUndefined();
    }
  });

  it("should enforce max 5 target queries per investigator", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const tooManyQueries = {
      claimCharacteristics: {
        type: "viral_forward",
        verifiabilityAssessment: "Verifiable",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["q1", "q2", "q3", "q4", "q5", "q6"], // 6 — too many
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        domainExpertise: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        patternMatching: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["Evidence A"],
        whatWouldProveFalse: ["Evidence B"],
      },
      thinkingExcerpt: "Thinking",
    };

    const result = SearchStrategySchema.safeParse(tooManyQueries);
    expect(result.success).toBe(false);
  });

  it("should enforce max 200 chars on verifiabilityAssessment", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const tooLongAssessment = {
      claimCharacteristics: {
        type: "factual_statistic",
        verifiabilityAssessment: "x".repeat(201),
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        domainExpertise: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
        patternMatching: {
          targetQueries: ["q1", "q2"],
          prioritySources: ["example.com"],
          lookFor: "Something",
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["Evidence A"],
        whatWouldProveFalse: ["Evidence B"],
      },
      thinkingExcerpt: "Thinking",
    };

    const result = SearchStrategySchema.safeParse(tooLongAssessment);
    expect(result.success).toBe(false);
  });

  it("should accept all valid claim type enum values", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const types = [
      "factual_statistic",
      "authority_claim",
      "event_claim",
      "scientific_claim",
      "policy_claim",
      "viral_forward",
    ];

    for (const type of types) {
      const data = {
        claimCharacteristics: {
          type,
          verifiabilityAssessment: "Verifiable",
        },
        investigatorGuidance: {
          sourceVerification: {
            targetQueries: ["q1", "q2"],
            prioritySources: ["example.com"],
            lookFor: "Something",
          },
          domainExpertise: {
            targetQueries: ["q1", "q2"],
            prioritySources: ["example.com"],
            lookFor: "Something",
          },
          patternMatching: {
            targetQueries: ["q1", "q2"],
            prioritySources: ["example.com"],
            lookFor: "Something",
          },
        },
        falsificationCriteria: {
          whatWouldProveTrue: ["Evidence"],
          whatWouldProveFalse: ["Counter-evidence"],
        },
        thinkingExcerpt: "Thinking about this",
      };

      const result = SearchStrategySchema.safeParse(data);
      expect(result.success, `type "${type}" should be valid`).toBe(true);
    }
  });

  it("should accept all valid suspectedPattern enum values", async () => {
    const { SearchStrategySchema } = await import(
      "../../../src/schemas/search-strategy.js"
    );

    const patterns = [
      "zombie_claim",
      "statistical_distortion",
      "authority_impersonation",
      "out_of_context",
      "fabrication",
      "exaggeration",
      "unknown",
    ];

    for (const pattern of patterns) {
      const data = {
        claimCharacteristics: {
          type: "factual_statistic",
          suspectedPattern: pattern,
          verifiabilityAssessment: "Verifiable",
        },
        investigatorGuidance: {
          sourceVerification: {
            targetQueries: ["q1", "q2"],
            prioritySources: ["example.com"],
            lookFor: "Something",
          },
          domainExpertise: {
            targetQueries: ["q1", "q2"],
            prioritySources: ["example.com"],
            lookFor: "Something",
          },
          patternMatching: {
            targetQueries: ["q1", "q2"],
            prioritySources: ["example.com"],
            lookFor: "Something",
          },
        },
        falsificationCriteria: {
          whatWouldProveTrue: ["Evidence"],
          whatWouldProveFalse: ["Counter-evidence"],
        },
        thinkingExcerpt: "Thinking",
      };

      const result = SearchStrategySchema.safeParse(data);
      expect(result.success, `suspectedPattern "${pattern}" should be valid`).toBe(true);
    }
  });
});
