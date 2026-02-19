import { describe, it, expect } from "vitest";
import { makeFinalVerdict as makeVerdict } from "../../../fixtures/index.js";

describe("formatWhatsAppVerdict — snapshot tests", () => {
  async function importFormatter() {
    return import("../../../../src/platforms/whatsapp/formatter.js");
  }

  it("should format likely-true verdict with high confidence", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "likely-true",
      confidence: 95,
      summary:
        "Multiple independent official sources confirm this announcement. The claim is well-documented and verified by Reuters and AP.",
      keyFindings: [
        "Official government press release confirms the policy",
        "Reuters and AP independently verified the announcement",
        "Timeline matches public records from the relevant ministry",
      ],
      confidenceDecomposition: {
        evidenceStrength: 95,
        sourceReliability: 92,
        claimComplexity: 30,
        counterArgumentResilience: 97,
      },
      sources: [
        { url: "https://reuters.com/article/1", title: "Reuters Report", relevance: "high" },
        { url: "https://apnews.com/article/2", title: "AP News Report", relevance: "high" },
        { url: "https://gov.in/press/3", title: "Official Press Release", relevance: "high" },
      ],
      devilsAdvocateOutcome: "counter_argument_failed",
      deepReasoningActivated: false,
      manipulationTechniques: [],
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toMatchSnapshot();
  });

  it("should format likely-false verdict with manipulation techniques", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "likely-false",
      confidence: 12,
      summary:
        "This claim is fabricated. No credible source supports the alleged government programme. Multiple fact-checkers have debunked identical variants.",
      keyFindings: [
        "No official government scheme matches the described programme",
        "Snopes and AltNews debunked identical chain messages in 2025",
        "The quoted official never made the attributed statement",
      ],
      confidenceDecomposition: {
        evidenceStrength: 10,
        sourceReliability: 15,
        claimComplexity: 20,
        counterArgumentResilience: 8,
      },
      manipulationTechniques: [
        {
          technique: "Appeal to Authority",
          description: "Attributes fabricated quotes to a real public official",
          evidenceQuote: "PM Modi personally announced Rs 5000 for every citizen",
          severity: 85,
        },
        {
          technique: "Urgency Framing",
          description: "Creates false urgency to encourage sharing",
          evidenceQuote: "Register before midnight or lose your chance!",
          severity: 72,
        },
      ],
      sources: [
        { url: "https://snopes.com/debunk/1", title: "Snopes Fact Check", relevance: "high" },
        { url: "https://altnews.in/check/2", title: "AltNews Analysis", relevance: "high" },
      ],
      devilsAdvocateOutcome: "counter_argument_failed",
      deepReasoningActivated: false,
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toMatchSnapshot();
  });

  it("should format partially-true verdict with nuance tag", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "partially-true",
      confidence: 64,
      nuanceTag: "exaggerated",
      summary:
        "The underlying research exists but the claim significantly exaggerates the findings. The original study found a modest correlation, not the causal proof claimed.",
      keyFindings: [
        "Harvard study exists but concludes correlation, not causation",
        "Original paper explicitly warns against the interpretation in the claim",
        "Media coverage progressively exaggerated the findings through each share",
      ],
      confidenceDecomposition: {
        evidenceStrength: 65,
        sourceReliability: 70,
        claimComplexity: 55,
        counterArgumentResilience: 60,
      },
      manipulationTechniques: [
        {
          technique: "Cherry-Picked Data",
          description: "Selects one favourable finding while ignoring caveats",
          evidenceQuote: "study proves chocolate prevents heart disease",
          severity: 68,
        },
      ],
      sources: [
        { url: "https://pubmed.ncbi.nlm.nih.gov/12345", title: "Original Harvard Study", relevance: "high" },
        { url: "https://factcheck.org/article/3", title: "FactCheck.org Analysis", relevance: "high" },
      ],
      devilsAdvocateOutcome: "counter_argument_partially_succeeded",
      deepReasoningActivated: false,
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toMatchSnapshot();
  });

  it("should format unverified verdict with deep reasoning activated", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "unverified",
      confidence: 45,
      summary:
        "Insufficient evidence to confirm or deny this claim. No official sources or credible media have reported on the alleged event. The claim cannot be verified at this time.",
      keyFindings: [
        "No primary sources found for the alleged event",
        "Social media posts are the only origin of this claim",
        "Official channels have not commented on the matter",
      ],
      confidenceDecomposition: {
        evidenceStrength: 35,
        sourceReliability: 40,
        claimComplexity: 60,
        counterArgumentResilience: 50,
      },
      manipulationTechniques: [],
      sources: [
        { url: "https://twitter.com/user/status/1", title: "Original Social Media Post", relevance: "low" },
      ],
      devilsAdvocateOutcome: "counter_argument_partially_succeeded",
      deepReasoningActivated: true,
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toMatchSnapshot();
  });

  it("should format satire verdict", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const verdict = makeVerdict({
      category: "satire",
      confidence: 98,
      summary:
        "This article is from a well-known satirical publication. The Onion is a recognized satire outlet and the article uses characteristic humorous exaggeration.",
      keyFindings: [
        "Source is The Onion, a well-known satirical publication",
        "Article uses absurdist humour typical of satire",
        "No real news outlet has reported this event",
      ],
      confidenceDecomposition: {
        evidenceStrength: 99,
        sourceReliability: 98,
        claimComplexity: 10,
        counterArgumentResilience: 99,
      },
      manipulationTechniques: [],
      sources: [
        { url: "https://theonion.com/article/1", title: "The Onion Article", relevance: "high" },
      ],
      devilsAdvocateOutcome: "counter_argument_failed",
      deepReasoningActivated: false,
    });
    const text = formatWhatsAppVerdict(verdict);
    expect(text).toMatchSnapshot();
  });

  it("should contain zero HTML tags in any output", async () => {
    const { formatWhatsAppVerdict } = await importFormatter();
    const htmlTagPattern = /<\/?[a-z][a-z0-9]*\b[^>]*>/i;

    const fixtures = [
      makeVerdict({ category: "likely-true", confidence: 95 }),
      makeVerdict({
        category: "likely-false",
        confidence: 12,
        manipulationTechniques: [
          {
            technique: "Appeal to Authority",
            description: "Uses fake authority",
            evidenceQuote: "experts say",
            severity: 80,
          },
        ],
      }),
      makeVerdict({ category: "partially-true", confidence: 64, nuanceTag: "exaggerated" }),
      makeVerdict({ category: "unverified", confidence: 45, deepReasoningActivated: true }),
      makeVerdict({ category: "satire", confidence: 98 }),
      makeVerdict({ category: "opinion", confidence: 75 }),
    ];

    for (const verdict of fixtures) {
      const text = formatWhatsAppVerdict(verdict);
      expect(text).not.toMatch(htmlTagPattern);
    }
  });
});
