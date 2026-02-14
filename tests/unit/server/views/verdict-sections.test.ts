import { describe, it, expect } from "vitest";
import ejs from "ejs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import {
  makeFinalVerdict,
  makeChallengeReport,
  makeAgentReport,
  makeSearchStrategy,
} from "../../../fixtures/index.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const viewsDir = join(__dirname, "../../../../src/server/views");

function sampleVerdict() {
  return makeFinalVerdict({
    category: "likely-false",
    nuanceTag: "fabricated",
    confidence: 12,
    confidenceDecomposition: {
      evidenceStrength: 15,
      sourceReliability: 10,
      claimComplexity: 40,
      counterArgumentResilience: 8,
    },
    summary: "This claim is fabricated and has no official backing.",
    reasoning: "No credible government source supports this claim.",
    manipulationTechniques: [
      {
        technique: "Authority Impersonation",
        description: "Uses PM's name to lend false credibility to the claim",
        evidenceQuote: "PM Modi announced Rs 5000...",
        severity: 85,
      },
      {
        technique: "Urgency Fabrication",
        description: "Creates false time pressure to share before verifying",
        evidenceQuote: "Apply before March 31st deadline...",
        severity: 62,
      },
    ],
    keyFindings: ["No official announcement found", "Known viral forward"],
    sources: [
      {
        url: "https://pib.gov.in",
        title: "Press Information Bureau",
        relevance: "Official government source",
      },
    ],
    whatWouldChangeMyMind:
      "Official PIB press release confirming the scheme.",
    falsificationCriteria: {
      whatWouldProveTrue: ["Official government notification", "RBI circular confirming the scheme"],
      whatWouldProveFalse: ["PIB fact-check debunking the claim"],
    },
    thinkingSummary: "Analyzed all evidence carefully and found no credible support.",
  });
}

function sampleChallengeReport() {
  return makeChallengeReport({
    challenges: [
      {
        targetAgent: "source_verification",
        claim: "No official source found",
        challenge: "Could there be a regional announcement not yet indexed?",
        severity: "minor",
        evidence: "Some state schemes exist with similar names",
      },
    ],
    overallAssessment: "The counter-argument was weak and did not hold up under scrutiny.",
    counterArgumentSummary: "The counter-argument did not hold up.",
    thinkingExcerpt: "I attempted to construct a scenario where this claim could be true by examining regional government schemes, but found no evidence supporting a nationwide Rs 5000 transfer program.",
  });
}

function sampleAgentReport(role: ReturnType<typeof makeAgentReport>["agentRole"]) {
  return makeAgentReport({
    agentRole: role,
    summary: `${role} investigation summary`,
    overallAssessment: "Claim is not supported by evidence.",
    confidenceScore: 15,
  });
}

function renderVerdict(overrides?: Record<string, unknown>): string {
  const templatePath = join(viewsDir, "verdict.ejs");
  const template = readFileSync(templatePath, "utf-8");

  const data = {
    id: "test-abc123",
    originalMessage: "PM Modi announced Rs 5000 direct transfer to all citizens",
    verdict: sampleVerdict(),
    challengeReport: sampleChallengeReport(),
    searchStrategy: makeSearchStrategy(),
    agentReports: [
      sampleAgentReport("source_verification"),
      sampleAgentReport("domain_expertise"),
      sampleAgentReport("pattern_matching"),
    ],
    pipelineDurationMs: 120000,
    totalCostUsd: 0.55,
    createdAt: "2026-02-13T10:00:00.000Z",
    completedAt: "2026-02-13T10:02:00.000Z",
    ...overrides,
  };

  return ejs.render(template, data, { filename: templatePath });
}

describe("Verdict page — Manipulation Techniques and AI Reasoning sections", () => {
  it("should render manipulation techniques cards", () => {
    const html = renderVerdict();
    expect(html).toContain("Manipulation Techniques");
    expect(html).toContain("Authority Impersonation");
    expect(html).toContain("Urgency Fabrication");
    expect(html).toContain("Uses PM&#39;s name to lend false credibility");
    expect(html).toContain("PM Modi announced Rs 5000...");
    // Severity bars should be present
    expect(html).toContain("85");
    expect(html).toContain("62");
  });

  it("should render manipulation technique severity as visual bar", () => {
    const html = renderVerdict();
    // Should contain severity bar styling with percentage width
    expect(html).toMatch(/width:\s*85%/);
    expect(html).toMatch(/width:\s*62%/);
  });

  it("should render DA thinking excerpt", () => {
    const html = renderVerdict();
    expect(html).toContain("Devil");
    expect(html).toContain("Advocate");
    expect(html).toContain("I attempted to construct a scenario");
  });

  it("should render DA outcome badge", () => {
    const html = renderVerdict();
    // Should show the counter-argument outcome
    expect(html).toContain("counter_argument_failed");
  });

  it("should render Judge thinking excerpt", () => {
    const html = renderVerdict();
    expect(html).toContain("Judge");
    expect(html).toContain("Analyzed all evidence carefully");
  });

  it("should render falsification criteria", () => {
    const html = renderVerdict();
    expect(html).toContain("What Would Change This Verdict");
    expect(html).toContain("Official government notification");
    expect(html).toContain("RBI circular confirming the scheme");
    expect(html).toContain("PIB fact-check debunking the claim");
  });

  it("should render without manipulation techniques when empty", () => {
    const v = sampleVerdict();
    v.manipulationTechniques = [];
    const html = renderVerdict({ verdict: v });
    expect(html).toBeTruthy();
    // Section should not appear
    expect(html).not.toContain("Manipulation Techniques");
  });

  it("should render without challenge report when null", () => {
    const html = renderVerdict({ challengeReport: null });
    expect(html).toBeTruthy();
    // DA block should not appear, but Judge reasoning still shows
    expect(html).not.toContain("Devil");
    expect(html).not.toContain("counter_argument_failed");
    // Judge reasoning still renders within AI Reasoning section
    expect(html).toContain("Analyzed all evidence carefully");
  });

  it("should render without falsification criteria when absent", () => {
    const v = sampleVerdict();
    delete (v as Record<string, unknown>)["falsificationCriteria"];
    const html = renderVerdict({ verdict: v });
    expect(html).toBeTruthy();
    expect(html).not.toContain("What Would Change This Verdict");
  });
});
