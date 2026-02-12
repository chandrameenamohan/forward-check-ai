import { describe, it, expect } from "vitest";

describe("ChallengeReport schema", () => {
  it("should validate a correct ChallengeReport", async () => {
    const { ChallengeReportSchema } = await import(
      "../../../src/schemas/challenge-report.js"
    );

    const valid = {
      challenges: [
        {
          targetAgent: "source_verification",
          claim: "PM Modi announced Rs 5000 direct transfer",
          challenge: "The original source could be a satirical article misinterpreted as news.",
          severity: "moderate",
          evidence: "Several satirical news sites have published similar headlines.",
        },
        {
          targetAgent: "domain_expertise",
          claim: "No official government announcement exists",
          challenge: "Government announcements sometimes appear on regional portals before national ones.",
          severity: "minor",
          evidence: "Regional government portals occasionally publish announcements first.",
        },
      ],
      overallAssessment:
        "The investigator consensus that this claim is false is well-supported. Counter-arguments are weak.",
      suggestedConfidenceAdjustment: -5,
      counterArgumentSucceeded: false,
      counterArgumentSummary:
        "I attempted to argue that the claim could be based on a real but misreported announcement, but the evidence strongly contradicts this.",
      thinkingExcerpt:
        "Let me examine the investigators' findings carefully. The source verification agent found no official press releases...",
    };

    const result = ChallengeReportSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.challenges).toHaveLength(2);
      expect(result.data.counterArgumentSucceeded).toBe(false);
      expect(result.data.suggestedConfidenceAdjustment).toBe(-5);
    }
  });

  it("should enforce confidence adjustment range -30 to +30", async () => {
    const { ChallengeReportSchema } = await import(
      "../../../src/schemas/challenge-report.js"
    );

    const makeReport = (adjustment: number) => ({
      challenges: [],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: adjustment,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "Test excerpt",
    });

    // Valid boundaries
    const minResult = ChallengeReportSchema.safeParse(makeReport(-30));
    expect(minResult.success).toBe(true);

    const maxResult = ChallengeReportSchema.safeParse(makeReport(30));
    expect(maxResult.success).toBe(true);

    const zeroResult = ChallengeReportSchema.safeParse(makeReport(0));
    expect(zeroResult.success).toBe(true);

    // Invalid: below -30
    const belowMin = ChallengeReportSchema.safeParse(makeReport(-31));
    expect(belowMin.success).toBe(false);

    // Invalid: above +30
    const aboveMax = ChallengeReportSchema.safeParse(makeReport(31));
    expect(aboveMax.success).toBe(false);
  });

  it("should require counterArgumentSucceeded boolean", async () => {
    const { ChallengeReportSchema } = await import(
      "../../../src/schemas/challenge-report.js"
    );

    // Missing counterArgumentSucceeded
    const missingField = {
      challenges: [],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "Test excerpt",
    };
    expect(ChallengeReportSchema.safeParse(missingField).success).toBe(false);

    // counterArgumentSucceeded as string instead of boolean
    const wrongType = {
      challenges: [],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: "false",
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "Test excerpt",
    };
    expect(ChallengeReportSchema.safeParse(wrongType).success).toBe(false);

    // counterArgumentSucceeded = true (valid)
    const succeeded = {
      challenges: [],
      overallAssessment: "Counter-argument was strong enough to challenge the consensus.",
      suggestedConfidenceAdjustment: 20,
      counterArgumentSucceeded: true,
      counterArgumentSummary: "Found credible counter-evidence.",
      thinkingExcerpt: "The evidence suggests...",
    };
    const result = ChallengeReportSchema.safeParse(succeeded);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.counterArgumentSucceeded).toBe(true);
    }
  });

  it("should enforce max 500 chars on thinkingExcerpt", async () => {
    const { ChallengeReportSchema } = await import(
      "../../../src/schemas/challenge-report.js"
    );

    // Exactly 500 chars — valid
    const atLimit = {
      challenges: [],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "x".repeat(500),
    };
    expect(ChallengeReportSchema.safeParse(atLimit).success).toBe(true);

    // 501 chars — invalid
    const overLimit = {
      challenges: [],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "x".repeat(501),
    };
    expect(ChallengeReportSchema.safeParse(overLimit).success).toBe(false);
  });

  it("should validate challenge severity enum values", async () => {
    const { ChallengeReportSchema } = await import(
      "../../../src/schemas/challenge-report.js"
    );

    const severities = ["critical", "moderate", "minor"];

    for (const severity of severities) {
      const data = {
        challenges: [
          {
            targetAgent: "source_verification",
            claim: "Test claim",
            challenge: "Test challenge",
            severity,
            evidence: "Test evidence",
          },
        ],
        overallAssessment: "Test assessment",
        suggestedConfidenceAdjustment: 0,
        counterArgumentSucceeded: false,
        counterArgumentSummary: "Test summary",
        thinkingExcerpt: "Test excerpt",
      };

      const result = ChallengeReportSchema.safeParse(data);
      expect(result.success, `severity "${severity}" should be valid`).toBe(true);
    }

    // Invalid severity
    const invalidSeverity = {
      challenges: [
        {
          targetAgent: "source_verification",
          claim: "Test claim",
          challenge: "Test challenge",
          severity: "extreme",
          evidence: "Test evidence",
        },
      ],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "Test excerpt",
    };
    expect(ChallengeReportSchema.safeParse(invalidSeverity).success).toBe(false);
  });

  it("should reject missing required fields", async () => {
    const { ChallengeReportSchema } = await import(
      "../../../src/schemas/challenge-report.js"
    );

    // Missing overallAssessment
    const noAssessment = {
      challenges: [],
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "Test excerpt",
    };
    expect(ChallengeReportSchema.safeParse(noAssessment).success).toBe(false);

    // Missing counterArgumentSummary
    const noSummary = {
      challenges: [],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      thinkingExcerpt: "Test excerpt",
    };
    expect(ChallengeReportSchema.safeParse(noSummary).success).toBe(false);

    // Missing thinkingExcerpt
    const noExcerpt = {
      challenges: [],
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "Test summary",
    };
    expect(ChallengeReportSchema.safeParse(noExcerpt).success).toBe(false);

    // Missing challenges
    const noChallenges = {
      overallAssessment: "Test assessment",
      suggestedConfidenceAdjustment: 0,
      counterArgumentSucceeded: false,
      counterArgumentSummary: "Test summary",
      thinkingExcerpt: "Test excerpt",
    };
    expect(ChallengeReportSchema.safeParse(noChallenges).success).toBe(false);
  });

  it("should export ChallengeReport TypeScript type", async () => {
    const mod = await import("../../../src/schemas/challenge-report.js");
    expect(mod.ChallengeReportSchema).toBeDefined();
    // Type export is verified at compile time by tsc --noEmit
  });
});
