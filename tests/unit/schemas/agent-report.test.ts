import { describe, it, expect } from "vitest";

describe("AgentReport schema", () => {
  it("should validate a correct AgentReport", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const valid = {
      agentRole: "source_verification",
      summary: "The claim about Modi announcing Rs 5000 transfer has no official backing.",
      findings: [
        {
          claim: "PM Modi announced Rs 5000 direct transfer",
          assessment: "contradicted",
          confidence: 85,
          sources: [
            {
              url: "https://pib.gov.in/releases",
              title: "PIB Official Releases",
              credibility: "high",
              relevantSnippet: "No such announcement was made by the Prime Minister.",
            },
          ],
        },
      ],
      manipulationIndicators: ["urgency language", "fabricated authority"],
      overallAssessment: "The claim is fabricated with no official source.",
      confidenceScore: 88,
    };

    const result = AgentReportSchema.safeParse(valid);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.agentRole).toBe("source_verification");
      expect(result.data.findings).toHaveLength(1);
      expect(result.data.findings[0]?.sources).toHaveLength(1);
      expect(result.data.confidenceScore).toBe(88);
    }
  });

  it("should validate findings with nested sources", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const multipleFindings = {
      agentRole: "domain_expertise",
      summary: "Health claim investigation revealed mixed evidence.",
      findings: [
        {
          claim: "Green tea cures cancer",
          assessment: "contradicted",
          confidence: 90,
          sources: [
            {
              url: "https://pubmed.ncbi.nlm.nih.gov/12345",
              title: "Meta-analysis of green tea and cancer",
              credibility: "high",
              relevantSnippet: "No conclusive evidence supports curative properties.",
            },
            {
              url: "https://cancer.gov/tea-research",
              title: "NCI Tea Research Summary",
              credibility: "high",
              relevantSnippet: "Green tea may have preventive but not curative effects.",
            },
          ],
        },
        {
          claim: "WHO officially endorses green tea for cancer treatment",
          assessment: "contradicted",
          confidence: 95,
          sources: [
            {
              url: "https://who.int/news",
              title: "WHO Cancer Treatment Guidelines",
              credibility: "high",
              relevantSnippet: "WHO does not endorse green tea as a cancer treatment.",
            },
          ],
          rawSnippets: ["Some raw search result text"],
        },
      ],
      overallAssessment: "Both claims are contradicted by authoritative medical sources.",
      confidenceScore: 92,
    };

    const result = AgentReportSchema.safeParse(multipleFindings);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.findings).toHaveLength(2);
      expect(result.data.findings[0]?.sources).toHaveLength(2);
      expect(result.data.findings[1]?.sources).toHaveLength(1);
      expect(result.data.findings[1]?.rawSnippets).toEqual(["Some raw search result text"]);
    }
  });

  it("should enforce confidence score 0-100 range", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const makeReport = (score: number) => ({
      agentRole: "pattern_matching" as const,
      summary: "Test summary",
      findings: [],
      overallAssessment: "Test assessment",
      confidenceScore: score,
    });

    // Valid boundaries
    const zeroResult = AgentReportSchema.safeParse(makeReport(0));
    expect(zeroResult.success).toBe(true);

    const hundredResult = AgentReportSchema.safeParse(makeReport(100));
    expect(hundredResult.success).toBe(true);

    const fiftyResult = AgentReportSchema.safeParse(makeReport(50));
    expect(fiftyResult.success).toBe(true);

    // Invalid: below 0
    const belowZero = AgentReportSchema.safeParse(makeReport(-1));
    expect(belowZero.success).toBe(false);

    // Invalid: above 100
    const aboveHundred = AgentReportSchema.safeParse(makeReport(101));
    expect(aboveHundred.success).toBe(false);
  });

  it("should allow optional manipulationIndicators", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const withoutIndicators = {
      agentRole: "source_verification",
      summary: "Investigation summary.",
      findings: [
        {
          claim: "Test claim",
          assessment: "supported",
          confidence: 75,
          sources: [
            {
              url: "https://example.com",
              title: "Example Source",
              credibility: "medium",
              relevantSnippet: "Supporting evidence found.",
            },
          ],
        },
      ],
      // manipulationIndicators omitted
      overallAssessment: "Claim appears supported.",
      confidenceScore: 75,
    };

    const result = AgentReportSchema.safeParse(withoutIndicators);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.manipulationIndicators).toBeUndefined();
    }
  });

  it("should reject missing required fields", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    // Missing agentRole
    const noRole = {
      summary: "Summary",
      findings: [],
      overallAssessment: "Assessment",
      confidenceScore: 50,
    };
    expect(AgentReportSchema.safeParse(noRole).success).toBe(false);

    // Missing summary
    const noSummary = {
      agentRole: "source_verification",
      findings: [],
      overallAssessment: "Assessment",
      confidenceScore: 50,
    };
    expect(AgentReportSchema.safeParse(noSummary).success).toBe(false);

    // Missing overallAssessment
    const noAssessment = {
      agentRole: "source_verification",
      summary: "Summary",
      findings: [],
      confidenceScore: 50,
    };
    expect(AgentReportSchema.safeParse(noAssessment).success).toBe(false);

    // Missing confidenceScore
    const noScore = {
      agentRole: "source_verification",
      summary: "Summary",
      findings: [],
      overallAssessment: "Assessment",
    };
    expect(AgentReportSchema.safeParse(noScore).success).toBe(false);
  });

  it("should reject invalid agentRole enum value", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const invalidRole = {
      agentRole: "unknown_role",
      summary: "Summary",
      findings: [],
      overallAssessment: "Assessment",
      confidenceScore: 50,
    };

    expect(AgentReportSchema.safeParse(invalidRole).success).toBe(false);
  });

  it("should reject invalid assessment enum in findings", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const invalidAssessment = {
      agentRole: "domain_expertise",
      summary: "Summary",
      findings: [
        {
          claim: "Test claim",
          assessment: "definitely_true", // invalid
          confidence: 80,
          sources: [],
        },
      ],
      overallAssessment: "Assessment",
      confidenceScore: 80,
    };

    expect(AgentReportSchema.safeParse(invalidAssessment).success).toBe(false);
  });

  it("should reject invalid credibility enum in sources", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const invalidCredibility = {
      agentRole: "pattern_matching",
      summary: "Summary",
      findings: [
        {
          claim: "Test claim",
          assessment: "supported",
          confidence: 70,
          sources: [
            {
              url: "https://example.com",
              title: "Example",
              credibility: "very_high", // invalid
              relevantSnippet: "Snippet",
            },
          ],
        },
      ],
      overallAssessment: "Assessment",
      confidenceScore: 70,
    };

    expect(AgentReportSchema.safeParse(invalidCredibility).success).toBe(false);
  });

  it("should enforce confidence 0-100 range in findings", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const invalidFindingConfidence = {
      agentRole: "source_verification",
      summary: "Summary",
      findings: [
        {
          claim: "Test claim",
          assessment: "mixed",
          confidence: 150, // invalid
          sources: [],
        },
      ],
      overallAssessment: "Assessment",
      confidenceScore: 50,
    };

    expect(AgentReportSchema.safeParse(invalidFindingConfidence).success).toBe(false);
  });

  it("should enforce max 500 chars on summary", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const longSummary = {
      agentRole: "source_verification",
      summary: "x".repeat(501),
      findings: [],
      overallAssessment: "Assessment",
      confidenceScore: 50,
    };

    expect(AgentReportSchema.safeParse(longSummary).success).toBe(false);
  });

  it("should accept all valid agentRole enum values", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const roles = ["source_verification", "domain_expertise", "pattern_matching"];

    for (const role of roles) {
      const data = {
        agentRole: role,
        summary: "Summary",
        findings: [],
        overallAssessment: "Assessment",
        confidenceScore: 50,
      };

      const result = AgentReportSchema.safeParse(data);
      expect(result.success, `agentRole "${role}" should be valid`).toBe(true);
    }
  });

  it("should accept all valid assessment enum values", async () => {
    const { AgentReportSchema } = await import(
      "../../../src/schemas/agent-report.js"
    );

    const assessments = ["supported", "contradicted", "insufficient_evidence", "mixed"];

    for (const assessment of assessments) {
      const data = {
        agentRole: "source_verification",
        summary: "Summary",
        findings: [
          {
            claim: "Test claim",
            assessment,
            confidence: 50,
            sources: [],
          },
        ],
        overallAssessment: "Assessment",
        confidenceScore: 50,
      };

      const result = AgentReportSchema.safeParse(data);
      expect(result.success, `assessment "${assessment}" should be valid`).toBe(true);
    }
  });

  it("should export AgentReport TypeScript type", async () => {
    const mod = await import("../../../src/schemas/agent-report.js");
    expect(mod.AgentReportSchema).toBeDefined();
    // Type export is verified at compile time by tsc --noEmit
  });
});
