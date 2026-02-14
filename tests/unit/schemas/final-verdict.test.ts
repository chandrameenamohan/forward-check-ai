import { describe, it, expect } from "vitest";

describe("FinalVerdict schema", () => {
  const makeValidVerdict = (overrides: Record<string, unknown> = {}) => ({
    category: "likely-false",
    nuanceTag: "fabricated",
    confidence: 12,
    confidenceDecomposition: {
      evidenceStrength: 20,
      sourceReliability: 15,
      claimComplexity: 40,
      counterArgumentResilience: 85,
    },
    summary: "No official government source confirms this claim.",
    reasoning:
      "After thorough investigation, no credible evidence supports the claim that PM Modi announced Rs 5000 direct transfer.",
    manipulationTechniques: [
      {
        technique: "Appeal to Authority",
        description:
          "The claim invokes the Prime Minister's name to lend credibility to a fabricated announcement.",
        evidenceQuote:
          "PM Modi announced Rs 5000 direct transfer to all citizens",
        severity: 90,
      },
      {
        technique: "Urgency Framing",
        description:
          "The message implies time-sensitive action to pressure sharing.",
        evidenceQuote: "direct transfer to all citizens",
        severity: 60,
      },
    ],
    keyFindings: [
      "No official PIB press release matches this claim",
      "Similar viral messages debunked by AltNews in 2023",
      "Government transfer schemes require registration, not automatic distribution",
    ],
    sources: [
      {
        url: "https://pib.gov.in",
        title: "Press Information Bureau",
        relevance: "Official government press release database",
      },
      {
        url: "https://altnews.in/debunk-modi-5000",
        title: "AltNews Fact Check",
        relevance: "Previous debunk of similar claim",
      },
    ],
    whatWouldChangeMyMind:
      "An official PIB press release or gazette notification confirming this transfer scheme.",
    falsificationCriteria: {
      whatWouldProveTrue: [
        "Official PIB announcement",
        "Gazette notification",
      ],
      whatWouldProveFalse: [
        "No PIB record exists",
        "Government denial statement",
      ],
    },
    devilsAdvocateOutcome: "counter_argument_failed",
    deepReasoningActivated: false,
    thinkingSummary:
      "After reviewing all evidence, the claim appears to be entirely fabricated with no official backing.",
    ...overrides,
  });

  it("should validate a correct FinalVerdict", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    const result = FinalVerdictSchema.safeParse(makeValidVerdict());
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.category).toBe("likely-false");
      expect(result.data.nuanceTag).toBe("fabricated");
      expect(result.data.confidence).toBe(12);
      expect(result.data.manipulationTechniques).toHaveLength(2);
      expect(result.data.keyFindings).toHaveLength(3);
      expect(result.data.sources).toHaveLength(2);
    }
  });

  it("should validate all 6 verdict categories", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    const categories = [
      "likely-true",
      "partially-true",
      "unverified",
      "likely-false",
      "satire",
      "opinion",
    ];

    for (const category of categories) {
      const result = FinalVerdictSchema.safeParse(
        makeValidVerdict({ category }),
      );
      expect(result.success, `category "${category}" should be valid`).toBe(
        true,
      );
    }

    // Invalid category
    const invalid = FinalVerdictSchema.safeParse(
      makeValidVerdict({ category: "maybe-true" }),
    );
    expect(invalid.success).toBe(false);
  });

  it("should validate confidence decomposition with 4 components", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    // Valid: all 4 components
    const valid = FinalVerdictSchema.safeParse(makeValidVerdict());
    expect(valid.success).toBe(true);
    if (valid.success) {
      const decomp = valid.data.confidenceDecomposition;
      expect(decomp.evidenceStrength).toBe(20);
      expect(decomp.sourceReliability).toBe(15);
      expect(decomp.claimComplexity).toBe(40);
      expect(decomp.counterArgumentResilience).toBe(85);
    }

    // Missing one component
    const missingComponent = FinalVerdictSchema.safeParse(
      makeValidVerdict({
        confidenceDecomposition: {
          evidenceStrength: 20,
          sourceReliability: 15,
          claimComplexity: 40,
          // missing counterArgumentResilience
        },
      }),
    );
    expect(missingComponent.success).toBe(false);

    // Out of range (> 100)
    const outOfRange = FinalVerdictSchema.safeParse(
      makeValidVerdict({
        confidenceDecomposition: {
          evidenceStrength: 101,
          sourceReliability: 15,
          claimComplexity: 40,
          counterArgumentResilience: 85,
        },
      }),
    );
    expect(outOfRange.success).toBe(false);

    // Out of range (< 0)
    const belowZero = FinalVerdictSchema.safeParse(
      makeValidVerdict({
        confidenceDecomposition: {
          evidenceStrength: -1,
          sourceReliability: 15,
          claimComplexity: 40,
          counterArgumentResilience: 85,
        },
      }),
    );
    expect(belowZero.success).toBe(false);
  });

  it("should allow optional nuanceTag", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    // Without nuanceTag
    const withoutTag = makeValidVerdict();
    delete (withoutTag as Record<string, unknown>).nuanceTag;
    const result = FinalVerdictSchema.safeParse(withoutTag);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.nuanceTag).toBeUndefined();
    }

    // With valid nuanceTag values
    const nuanceTags = [
      "misleading",
      "out-of-context",
      "exaggerated",
      "fabricated",
      "recirculated",
      "scam",
    ];
    for (const nuanceTag of nuanceTags) {
      const tagResult = FinalVerdictSchema.safeParse(
        makeValidVerdict({ nuanceTag }),
      );
      expect(tagResult.success, `nuanceTag "${nuanceTag}" should be valid`).toBe(
        true,
      );
    }

    // Invalid nuanceTag
    const invalidTag = FinalVerdictSchema.safeParse(
      makeValidVerdict({ nuanceTag: "incorrect" }),
    );
    expect(invalidTag.success).toBe(false);
  });

  it("should validate manipulation techniques array", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    // Empty array is valid
    const emptyTechniques = FinalVerdictSchema.safeParse(
      makeValidVerdict({ manipulationTechniques: [] }),
    );
    expect(emptyTechniques.success).toBe(true);

    // Technique with severity out of range
    const badSeverity = FinalVerdictSchema.safeParse(
      makeValidVerdict({
        manipulationTechniques: [
          {
            technique: "Test",
            description: "Test description",
            evidenceQuote: "Test quote",
            severity: 101,
          },
        ],
      }),
    );
    expect(badSeverity.success).toBe(false);

    // Technique missing required field
    const missingField = FinalVerdictSchema.safeParse(
      makeValidVerdict({
        manipulationTechniques: [
          {
            technique: "Test",
            // missing description
            evidenceQuote: "Test quote",
            severity: 50,
          },
        ],
      }),
    );
    expect(missingField.success).toBe(false);
  });

  it("should validate confidence 0-100 range", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    // Valid boundaries
    const zero = FinalVerdictSchema.safeParse(
      makeValidVerdict({ confidence: 0 }),
    );
    expect(zero.success).toBe(true);

    const hundred = FinalVerdictSchema.safeParse(
      makeValidVerdict({ confidence: 100 }),
    );
    expect(hundred.success).toBe(true);

    // Invalid: below 0
    const belowZero = FinalVerdictSchema.safeParse(
      makeValidVerdict({ confidence: -1 }),
    );
    expect(belowZero.success).toBe(false);

    // Invalid: above 100
    const aboveHundred = FinalVerdictSchema.safeParse(
      makeValidVerdict({ confidence: 101 }),
    );
    expect(aboveHundred.success).toBe(false);
  });

  it("should enforce max 500 chars on summary", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    const atLimit = FinalVerdictSchema.safeParse(
      makeValidVerdict({ summary: "x".repeat(500) }),
    );
    expect(atLimit.success).toBe(true);

    const overLimit = FinalVerdictSchema.safeParse(
      makeValidVerdict({ summary: "x".repeat(501) }),
    );
    expect(overLimit.success).toBe(false);
  });

  it("should validate devilsAdvocateOutcome enum", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    const outcomes = [
      "counter_argument_failed",
      "counter_argument_partially_succeeded",
      "counter_argument_succeeded",
    ];

    for (const outcome of outcomes) {
      const result = FinalVerdictSchema.safeParse(
        makeValidVerdict({ devilsAdvocateOutcome: outcome }),
      );
      expect(result.success, `outcome "${outcome}" should be valid`).toBe(true);
    }

    const invalid = FinalVerdictSchema.safeParse(
      makeValidVerdict({ devilsAdvocateOutcome: "unknown" }),
    );
    expect(invalid.success).toBe(false);
  });

  it("should default deepReasoningActivated to false", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    const withoutFlag = makeValidVerdict();
    delete (withoutFlag as Record<string, unknown>).deepReasoningActivated;
    const result = FinalVerdictSchema.safeParse(withoutFlag);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.deepReasoningActivated).toBe(false);
    }
  });

  it("should validate sources array with required fields", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    // Source missing url
    const missingUrl = FinalVerdictSchema.safeParse(
      makeValidVerdict({
        sources: [{ title: "Test", relevance: "Test relevance" }],
      }),
    );
    expect(missingUrl.success).toBe(false);

    // Source missing title
    const missingTitle = FinalVerdictSchema.safeParse(
      makeValidVerdict({
        sources: [{ url: "https://example.com", relevance: "Test" }],
      }),
    );
    expect(missingTitle.success).toBe(false);
  });

  it("should allow optional falsificationCriteria", async () => {
    const { FinalVerdictSchema } = await import(
      "../../../src/schemas/final-verdict.js"
    );

    const withoutCriteria = makeValidVerdict();
    delete (withoutCriteria as Record<string, unknown>).falsificationCriteria;
    const result = FinalVerdictSchema.safeParse(withoutCriteria);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.falsificationCriteria).toBeUndefined();
    }
  });

  it("should export FinalVerdict TypeScript type", async () => {
    const mod = await import("../../../src/schemas/final-verdict.js");
    expect(mod.FinalVerdictSchema).toBeDefined();
    // Type export is verified at compile time by tsc --noEmit
  });
});
