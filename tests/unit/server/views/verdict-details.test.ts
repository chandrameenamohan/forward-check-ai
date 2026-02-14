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
    keyFindings: [
      "No official announcement found on PIB",
      "Known viral forward circulating since 2023",
      "Multiple fact-checkers have debunked this claim",
    ],
    sources: [
      {
        url: "https://pib.gov.in/factcheck",
        title: "PIB Fact Check",
        relevance: "Official government fact-checking portal",
      },
      {
        url: "https://www.altnews.in/debunk-modi-5000",
        title: "AltNews Debunk",
        relevance: "Independent fact-check of the viral claim",
      },
    ],
    whatWouldChangeMyMind:
      "Official PIB press release confirming the scheme.",
    falsificationCriteria: {
      whatWouldProveTrue: ["Official government notification"],
      whatWouldProveFalse: ["PIB fact-check debunking the claim"],
    },
    deepReasoningActivated: true,
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
    summary: `${role} investigation found the claim to be unsupported`,
    findings: [
      {
        claim: "PM Modi Rs 5000 transfer",
        assessment: "contradicted",
        confidence: 85,
        sources: [
          {
            url: "https://pib.gov.in",
            title: "Press Information Bureau",
            credibility: "high",
            relevantSnippet: "No such scheme has been announced by the government.",
          },
        ],
      },
      {
        claim: "Direct bank transfer program",
        assessment: "insufficient_evidence",
        confidence: 60,
        sources: [
          {
            url: "https://example.com/dbt",
            title: "DBT Portal",
            credibility: "medium",
            relevantSnippet: "Existing DBT schemes differ significantly.",
          },
        ],
      },
    ],
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

describe("Verdict page — Agent reports, sources, and details sections", () => {
  it("should render agent reports section with all 3 agents", () => {
    const html = renderVerdict();
    expect(html).toContain("Agent Reports");
    expect(html).toContain("source_verification");
    expect(html).toContain("domain_expertise");
    expect(html).toContain("pattern_matching");
  });

  it("should render agent report summaries", () => {
    const html = renderVerdict();
    expect(html).toContain("source_verification investigation found the claim to be unsupported");
    expect(html).toContain("domain_expertise investigation found the claim to be unsupported");
    expect(html).toContain("pattern_matching investigation found the claim to be unsupported");
  });

  it("should render agent report findings with assessments", () => {
    const html = renderVerdict();
    expect(html).toContain("contradicted");
    expect(html).toContain("insufficient_evidence");
    expect(html).toContain("PM Modi Rs 5000 transfer");
  });

  it("should render agent report finding sources with links", () => {
    const html = renderVerdict();
    expect(html).toContain('href="https://pib.gov.in"');
    expect(html).toContain("Press Information Bureau");
    expect(html).toContain("No such scheme has been announced by the government.");
  });

  it("should render agent report confidence scores", () => {
    const html = renderVerdict();
    // Each agent has confidence score 15 — should appear in the agent section
    // Use a pattern to match the confidence display in agent report context
    const agentSection = html.slice(html.indexOf("Agent Reports"));
    expect(agentSection).toContain("15");
  });

  it("should render collapsible accordion structure for agent reports", () => {
    const html = renderVerdict();
    // Bootstrap accordion attributes
    expect(html).toContain("accordion");
    expect(html).toContain("collapse");
  });

  it("should render sources section with links and relevance", () => {
    const html = renderVerdict();
    expect(html).toContain('href="https://pib.gov.in/factcheck"');
    expect(html).toContain("PIB Fact Check");
    expect(html).toContain("Official government fact-checking portal");
    expect(html).toContain('href="https://www.altnews.in/debunk-modi-5000"');
    expect(html).toContain("AltNews Debunk");
  });

  it("should render original claim text", () => {
    const html = renderVerdict();
    expect(html).toContain("Original Claim");
    expect(html).toContain("PM Modi announced Rs 5000 direct transfer to all citizens");
  });

  it("should render pipeline metadata in footer", () => {
    const html = renderVerdict();
    expect(html).toContain("120.0");  // duration in seconds
    expect(html).toContain("0.55");   // cost
    expect(html).toContain("test-abc123"); // investigation ID
  });

  it("should render deep reasoning indicator in footer when activated", () => {
    const html = renderVerdict();
    const footerStart = html.indexOf('<footer class="fc-footer">');
    const footerSection = html.slice(footerStart);
    expect(footerSection).toContain("Deep Reasoning");
  });

  it("should gracefully render with empty agent reports array", () => {
    const html = renderVerdict({ agentReports: [] });
    expect(html).toBeTruthy();
    // Should not show agent reports section when empty
    expect(html).not.toContain("Agent Reports");
  });

  it("should gracefully render with null agent reports", () => {
    const html = renderVerdict({ agentReports: null });
    expect(html).toBeTruthy();
    expect(html).not.toContain("Agent Reports");
  });

  it("should render without sources when verdict has no sources", () => {
    const v = sampleVerdict();
    v.sources = [];
    const html = renderVerdict({ verdict: v });
    expect(html).toBeTruthy();
    // The Sources section title should not appear when empty
    expect(html).not.toContain(">Sources<");
  });
});
