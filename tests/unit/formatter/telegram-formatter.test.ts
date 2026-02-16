import { describe, it, expect } from "vitest";
import { formatTelegramVerdict } from "../../../src/formatter/telegram-formatter.js";
import { makeFinalVerdict as makeVerdict } from "../../fixtures/index.js";

describe("formatTelegramVerdict", () => {
  it("should format likely-false verdict with red emoji", () => {
    const verdict = makeVerdict({
      category: "likely-false",
      confidence: 8,
      summary: "This claim is fabricated with no credible sources.",
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("\u{1F534}"); // red circle emoji
    expect(html).toContain("LIKELY FALSE");
    expect(html).toContain("8%");
  });

  it("should format likely-true verdict with green emoji", () => {
    const verdict = makeVerdict({
      category: "likely-true",
      confidence: 92,
      summary: "This claim is well-supported.",
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("\u{1F7E2}"); // green circle emoji
    expect(html).toContain("LIKELY TRUE");
    expect(html).toContain("92%");
  });

  it("should format partially-true verdict with yellow emoji", () => {
    const verdict = makeVerdict({
      category: "partially-true",
      confidence: 65,
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("\u{1F7E1}"); // yellow circle emoji
    expect(html).toContain("PARTIALLY TRUE");
    expect(html).toContain("65%");
  });

  it("should format unverified verdict with grey emoji", () => {
    const verdict = makeVerdict({
      category: "unverified",
      confidence: 40,
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("\u{26AA}"); // white/grey circle emoji
    expect(html).toContain("UNVERIFIED");
    expect(html).toContain("40%");
  });

  it("should format satire verdict with theatre emoji", () => {
    const verdict = makeVerdict({
      category: "satire",
      confidence: 85,
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("\u{1F3AD}"); // performing arts emoji
    expect(html).toContain("SATIRE");
  });

  it("should format opinion verdict with thought emoji", () => {
    const verdict = makeVerdict({
      category: "opinion",
      confidence: 70,
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("\u{1F4AD}"); // thought balloon emoji
    expect(html).toContain("OPINION");
  });

  it("should include nuanceTag when present", () => {
    const verdict = makeVerdict({
      category: "likely-false",
      confidence: 8,
      nuanceTag: "fabricated",
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Fabricated");
  });

  it("should not include nuanceTag section when absent", () => {
    const verdict = makeVerdict({
      category: "likely-true",
      confidence: 90,
      nuanceTag: undefined,
    });
    const html = formatTelegramVerdict(verdict);
    // Should not have an empty nuance line
    expect(html).not.toContain("undefined");
  });

  it("should include manipulation techniques with severity and expandable blockquote", () => {
    const verdict = makeVerdict({
      category: "likely-false",
      confidence: 10,
      manipulationTechniques: [
        {
          technique: "Fabricated Authority",
          description: "Claims government backing without evidence",
          evidenceQuote: "PM Modi announced...",
          severity: 90,
        },
        {
          technique: "Emotional Appeal",
          description: "Uses urgency to bypass critical thinking",
          evidenceQuote: "Direct transfer to ALL citizens",
          severity: 75,
        },
        {
          technique: "Third technique",
          description: "Should not appear",
          evidenceQuote: "...",
          severity: 50,
        },
      ],
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Fabricated Authority");
    expect(html).toContain("Emotional Appeal");
    expect(html).toContain("90/100");
    expect(html).toContain("75/100");
    expect(html).toContain("blockquote expandable");
    // Only top 2 should appear
    expect(html).not.toContain("Third technique");
  });

  it("should handle empty manipulation techniques", () => {
    const verdict = makeVerdict({
      manipulationTechniques: [],
    });
    const html = formatTelegramVerdict(verdict);
    // Should still produce valid HTML without errors
    expect(html).toBeTruthy();
    expect(html).not.toContain("Manipulation");
  });

  it("should include confidence percentage", () => {
    const verdict = makeVerdict({ confidence: 42 });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("42%");
  });

  it("should include summary text", () => {
    const verdict = makeVerdict({
      summary: "This is a well-researched summary about the claim.",
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("This is a well-researched summary about the claim.");
  });

  it("should not exceed 4000 characters", () => {
    const verdict = makeVerdict({
      summary: "A".repeat(300),
      reasoning: "B".repeat(1000),
      manipulationTechniques: [
        {
          technique: "Technique One",
          description: "D".repeat(200),
          evidenceQuote: "E".repeat(200),
          severity: 80,
        },
        {
          technique: "Technique Two",
          description: "F".repeat(200),
          evidenceQuote: "G".repeat(200),
          severity: 70,
        },
      ],
    });
    const html = formatTelegramVerdict(verdict);
    expect(html.length).toBeLessThanOrEqual(4000);
  });

  it("should use only Telegram-safe HTML tags", () => {
    const verdict = makeVerdict({
      category: "likely-false",
      confidence: 15,
      nuanceTag: "fabricated",
      manipulationTechniques: [
        {
          technique: "Test",
          description: "Test desc",
          evidenceQuote: "Quote",
          severity: 80,
        },
      ],
    });
    const html = formatTelegramVerdict(verdict);
    // Should not contain unsupported tags
    const unsupportedTags = /<(?!\/?(b|i|a|code|pre|u|s|tg-spoiler|blockquote)\b)[a-z]/gi;
    const matches = html.match(unsupportedTags);
    expect(matches).toBeNull();
  });

  it("should include deep reasoning indicator when activated", () => {
    const verdict = makeVerdict({
      deepReasoningActivated: true,
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Deep Reasoning");
  });

  it("should not include deep reasoning indicator when not activated", () => {
    const verdict = makeVerdict({
      deepReasoningActivated: false,
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).not.toContain("Deep Reasoning");
  });

  it("should return a string", () => {
    const verdict = makeVerdict();
    const result = formatTelegramVerdict(verdict);
    expect(typeof result).toBe("string");
  });

  it("should include confidence decomposition bars", () => {
    const verdict = makeVerdict({
      confidenceDecomposition: {
        evidenceStrength: 50,
        sourceReliability: 80,
        claimComplexity: 30,
        counterArgumentResilience: 10,
      },
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Confidence Breakdown");
    expect(html).toContain("Evidence");
    expect(html).toContain("Sources");
    expect(html).toContain("Complexity");
    expect(html).toContain("Resilience");
    // Check bar chars exist
    expect(html).toContain("▓");
    expect(html).toContain("░");
  });

  it("should include key findings (max 3)", () => {
    const verdict = makeVerdict({
      keyFindings: [
        "Finding one",
        "Finding two",
        "Finding three",
        "Finding four should be hidden",
      ],
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Key Findings");
    expect(html).toContain("Finding one");
    expect(html).toContain("Finding two");
    expect(html).toContain("Finding three");
    expect(html).not.toContain("Finding four");
  });

  it("should include devil's advocate outcome", () => {
    const verdict = makeVerdict({
      devilsAdvocateOutcome: "counter_argument_failed",
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Devil's Advocate");
    expect(html).toContain("Challenge failed");
  });

  it("should show partially succeeded DA outcome", () => {
    const verdict = makeVerdict({
      devilsAdvocateOutcome: "counter_argument_partially_succeeded",
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Partially succeeded");
  });

  it("should include source count", () => {
    const verdict = makeVerdict({
      sources: [
        { url: "https://a.com", title: "A", relevance: "high" },
        { url: "https://b.com", title: "B", relevance: "medium" },
        { url: "https://c.com", title: "C", relevance: "low" },
      ],
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Based on 3 sources");
  });

  it("should use singular 'source' for count of 1", () => {
    const verdict = makeVerdict({
      sources: [{ url: "https://a.com", title: "A", relevance: "high" }],
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("Based on 1 source");
    expect(html).not.toContain("1 sources");
  });

  it("should not show source line when no sources", () => {
    const verdict = makeVerdict({ sources: [] });
    const html = formatTelegramVerdict(verdict);
    expect(html).not.toContain("Based on");
  });

  it("should escape HTML in key findings", () => {
    const verdict = makeVerdict({
      keyFindings: ["Test <script>alert('xss')</script> finding"],
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain("<script>");
  });

  it("should escape HTML in evidence quotes", () => {
    const verdict = makeVerdict({
      manipulationTechniques: [
        {
          technique: "Test",
          description: "Desc with <b>html</b>",
          evidenceQuote: "Quote with <i>tags</i>",
          severity: 80,
        },
      ],
    });
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("&lt;i&gt;tags&lt;/i&gt;");
  });

  it("should include section separators", () => {
    const verdict = makeVerdict();
    const html = formatTelegramVerdict(verdict);
    expect(html).toContain("━━━");
  });
});
