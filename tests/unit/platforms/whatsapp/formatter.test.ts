import { describe, it, expect } from "vitest";
import { makeFinalVerdict as makeVerdict } from "../../../fixtures/index.js";

describe("formatWhatsAppVerdict", () => {
  async function importFormatter() {
    return import("../../../../src/platforms/whatsapp/formatter.js");
  }

  it("should format likely-false verdict with red emoji", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "likely-false",
      confidence: 8,
      summary: "This claim is fabricated with no credible sources.",
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toContain("\u{1F534}"); // red circle emoji
    expect(text).toContain("LIKELY FALSE");
    expect(text).toContain("8%");
  });

  it("should use WhatsApp markdown (*bold*, _italic_) instead of HTML", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "likely-true",
      confidence: 92,
      summary: "Well-supported claim.",
    });
    const text = formatWhatsAppVerdict(verdict);

    // Should contain WhatsApp bold syntax
    expect(text).toContain("*LIKELY TRUE*");
    expect(text).toContain("*Confidence Breakdown*");

    // Must NOT contain any HTML tags
    expect(text).not.toMatch(/<\/?[a-z][^>]*>/i);
  });

  it("should include nuanceTag when present", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "likely-false",
      confidence: 12,
      nuanceTag: "fabricated",
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toContain("Fabricated");
  });

  it("should include confidence breakdown", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      confidenceDecomposition: {
        evidenceStrength: 80,
        sourceReliability: 60,
        claimComplexity: 40,
        counterArgumentResilience: 90,
      },
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toContain("Evidence");
    expect(text).toContain("Sources");
    expect(text).toContain("Complexity");
    expect(text).toContain("Resilience");
    // Should contain the bar characters
    expect(text).toContain("▓");
    expect(text).toContain("░");
  });

  it("should include manipulation techniques", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      manipulationTechniques: [
        {
          technique: "Appeal to Authority",
          description: "Cites unnamed experts",
          evidenceQuote: "experts say",
          severity: 80,
        },
        {
          technique: "Emotional Language",
          description: "Uses fear",
          evidenceQuote: "terrifying new study",
          severity: 65,
        },
        {
          technique: "Minor technique",
          description: "Low severity",
          evidenceQuote: "a bit misleading",
          severity: 20,
        },
      ],
    });
    const text = formatWhatsAppVerdict(verdict);
    // Top 2 by severity
    expect(text).toContain("Appeal to Authority");
    expect(text).toContain("80/100");
    expect(text).toContain("Emotional Language");
    expect(text).toContain("65/100");
    // Third technique not included
    expect(text).not.toContain("Minor technique");
  });

  it("should not exceed 4000 characters", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      summary: "A".repeat(500),
      reasoning: "B".repeat(500),
      keyFindings: [
        "C".repeat(200),
        "D".repeat(200),
        "E".repeat(200),
      ],
      manipulationTechniques: [
        {
          technique: "Long Technique Name Here",
          description: "F".repeat(200),
          evidenceQuote: "G".repeat(200),
          severity: 90,
        },
        {
          technique: "Another Long Technique",
          description: "H".repeat(200),
          evidenceQuote: "I".repeat(200),
          severity: 85,
        },
      ],
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text.length).toBeLessThanOrEqual(4000);
  });

  it("should include Devil's Advocate outcome", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();

    const failedVerdict = makeVerdict({
      devilsAdvocateOutcome: "counter_argument_failed",
    });
    expect(formatWhatsAppVerdict(failedVerdict)).toContain(
      "Challenge failed",
    );

    const succeededVerdict = makeVerdict({
      devilsAdvocateOutcome: "counter_argument_succeeded",
    });
    expect(formatWhatsAppVerdict(succeededVerdict)).toContain(
      "Challenge succeeded",
    );

    const partialVerdict = makeVerdict({
      devilsAdvocateOutcome: "counter_argument_partially_succeeded",
    });
    expect(formatWhatsAppVerdict(partialVerdict)).toContain(
      "Partially succeeded",
    );
  });

  it("should include deep reasoning indicator when activated", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({ deepReasoningActivated: true });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toContain("Deep Reasoning");
  });

  it("should not include deep reasoning indicator when not activated", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({ deepReasoningActivated: false });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).not.toContain("Deep Reasoning");
  });

  it("should include key findings", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      keyFindings: [
        "No official government announcement found",
        "Reuters debunked this claim in January",
        "Similar claim circulated in 2024",
        "This fourth finding should be excluded",
      ],
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toContain("No official government announcement found");
    expect(text).toContain("Reuters debunked this claim in January");
    expect(text).toContain("Similar claim circulated in 2024");
    // Only top 3 findings included
    expect(text).not.toContain("This fourth finding should be excluded");
  });

  it("should include source count", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      sources: [
        { url: "https://example.com/1", title: "Source 1", relevance: "high" },
        { url: "https://example.com/2", title: "Source 2", relevance: "medium" },
        { url: "https://example.com/3", title: "Source 3", relevance: "low" },
      ],
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toContain("3 sources");
  });

  it("should format all 6 categories with correct emojis", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();

    const categories = [
      { category: "likely-true" as const, emoji: "\u{1F7E2}", label: "LIKELY TRUE" },
      { category: "partially-true" as const, emoji: "\u{1F7E1}", label: "PARTIALLY TRUE" },
      { category: "unverified" as const, emoji: "\u{26AA}", label: "UNVERIFIED" },
      { category: "likely-false" as const, emoji: "\u{1F534}", label: "LIKELY FALSE" },
      { category: "satire" as const, emoji: "\u{1F3AD}", label: "SATIRE" },
      { category: "opinion" as const, emoji: "\u{1F4AD}", label: "OPINION" },
    ];

    for (const { category, emoji, label } of categories) {
      const verdict = makeVerdict({ category });
      const text = formatWhatsAppVerdict(verdict);
      expect(text).toContain(emoji);
      expect(text).toContain(label);
    }
  });
});
