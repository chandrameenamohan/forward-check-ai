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
        description: "Uses PM's name for credibility",
        evidenceQuote: "PM Modi announced...",
        severity: 85,
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
      whatWouldProveTrue: ["Official government notification"],
      whatWouldProveFalse: ["PIB fact-check debunking the claim"],
    },
    thinkingSummary: "Analyzed all evidence carefully.",
  });
}

function sampleChallengeReport() {
  return makeChallengeReport({
    challenges: [
      {
        targetAgent: "source_verification",
        claim: "No official source found",
        challenge: "Could there be a regional announcement?",
        severity: "minor",
        evidence: "Some state schemes exist",
      },
    ],
    overallAssessment: "Counter-argument was weak.",
    counterArgumentSummary: "The counter-argument did not hold up.",
    thinkingExcerpt: "Tried to find supporting evidence but failed.",
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

describe("Verdict page EJS template", () => {
  it("should render verdict page without errors", () => {
    const html = renderVerdict();
    expect(html).toBeTruthy();
    expect(html).toContain("<!DOCTYPE html>");
  });

  it("should display verdict badge with category", () => {
    const html = renderVerdict();
    expect(html).toContain("likely-false");
  });

  it("should display confidence percentage", () => {
    const html = renderVerdict();
    expect(html).toContain("12");
    expect(html).toContain("%");
  });

  it("should display nuanceTag when present", () => {
    const html = renderVerdict();
    expect(html).toContain("fabricated");
  });

  it("should display confidence decomposition bars", () => {
    const html = renderVerdict();
    // All 4 components should be in the rendered output
    expect(html).toContain("Evidence Strength");
    expect(html).toContain("Source Reliability");
    expect(html).toContain("Claim Complexity");
    expect(html).toContain("Counter-Argument Resilience");
  });

  it("should display Deep Reasoning Mode indicator when activated", () => {
    const deepVerdict = sampleVerdict();
    deepVerdict.deepReasoningActivated = true;
    const html = renderVerdict({ verdict: deepVerdict });
    expect(html).toContain("Deep Reasoning");
  });

  it("should not display Deep Reasoning indicator when not activated", () => {
    const html = renderVerdict();
    expect(html).not.toContain("Deep Reasoning");
  });

  it("should include Bootstrap 5 CDN", () => {
    const html = renderVerdict();
    expect(html).toContain("bootstrap");
  });

  it("should render verdict summary text", () => {
    const html = renderVerdict();
    expect(html).toContain("This claim is fabricated and has no official backing.");
  });

  it("should render without nuanceTag when not present", () => {
    const noNuanceVerdict = sampleVerdict();
    delete (noNuanceVerdict as Record<string, unknown>)["nuanceTag"];
    const html = renderVerdict({ verdict: noNuanceVerdict });
    expect(html).toBeTruthy();
    expect(html).toContain("likely-false");
  });
});
