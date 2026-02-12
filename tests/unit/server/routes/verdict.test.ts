import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";
import type { FinalVerdict } from "../../../../src/schemas/final-verdict.js";
import type { ChallengeReport } from "../../../../src/schemas/challenge-report.js";
import type { AgentReport } from "../../../../src/schemas/agent-report.js";

/** Sample FinalVerdict for seeding completed investigations. */
function makeFinalVerdict(): FinalVerdict {
  return {
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
    devilsAdvocateOutcome: "counter_argument_failed",
    deepReasoningActivated: false,
    thinkingSummary: "Analyzed all evidence carefully.",
  };
}

function makeChallengeReport(): ChallengeReport {
  return {
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
    suggestedConfidenceAdjustment: -5,
    counterArgumentSucceeded: false,
    counterArgumentSummary: "The counter-argument did not hold up.",
    thinkingExcerpt: "Tried to find supporting evidence but failed.",
  };
}

function makeAgentReport(role: AgentReport["agentRole"]): AgentReport {
  return {
    agentRole: role,
    summary: `${role} investigation summary`,
    findings: [
      {
        claim: "PM Modi Rs 5000 transfer",
        assessment: "contradicted",
        confidence: 85,
        sources: [
          {
            url: "https://example.com",
            title: "Example Source",
            credibility: "high",
            relevantSnippet: "No such scheme exists.",
          },
        ],
      },
    ],
    overallAssessment: "Claim is not supported by evidence.",
    confidenceScore: 15,
  };
}

describe("Verdict page routes", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-verdict-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
    repo = new InvestigationRepository(db);
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    if (db) {
      db.close();
    }
    try {
      unlinkSync(dbPath);
      unlinkSync(dbPath + "-wal");
      unlinkSync(dbPath + "-shm");
    } catch {
      // ignore missing files
    }
  });

  function startServer(): Promise<number> {
    return new Promise((resolve) => {
      const app = createApp(repo);
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });
  }

  /** Seed a completed investigation with full pipeline data. */
  function seedCompletedInvestigation(): string {
    const id = repo.create("PM Modi announced Rs 5000 direct transfer");
    repo.updateClassifierResult(id, {
      category: "factual_claim",
      extractedClaim: "PM Modi announced Rs 5000 direct transfer",
      isCompound: false,
      domain: "economics",
      language: "en",
      urgency: "medium",
      reasoning: "Contains a specific monetary policy claim.",
    });
    repo.updateSearchStrategy(id, {
      claimCharacteristics: {
        type: "authority_claim",
        suspectedPattern: "authority_impersonation",
        verifiabilityAssessment: "Verifiable through official sources.",
      },
      investigatorGuidance: {
        sourceVerification: {
          targetQueries: ["Modi Rs 5000 transfer", "PIB fact check"],
          prioritySources: ["pib.gov.in"],
          lookFor: "Official announcements",
        },
        domainExpertise: {
          targetQueries: ["India direct benefit transfer", "DBT scheme"],
          prioritySources: ["rbi.org.in"],
          lookFor: "Economic policy details",
        },
        patternMatching: {
          targetQueries: ["Modi 5000 WhatsApp forward", "viral claim"],
          prioritySources: ["snopes.com"],
          lookFor: "Previous debunks",
        },
      },
      falsificationCriteria: {
        whatWouldProveTrue: ["Official PIB notification"],
        whatWouldProveFalse: ["PIB debunk"],
      },
      thinkingExcerpt: "Analyzing the claim characteristics...",
    });
    repo.updateAgentReports(id, [
      makeAgentReport("source_verification"),
      makeAgentReport("domain_expertise"),
      makeAgentReport("pattern_matching"),
    ]);
    repo.updateChallengeReport(id, makeChallengeReport());
    repo.updateFinalVerdict(id, makeFinalVerdict(), 120000, 0.55);
    return id;
  }

  it("GET /v/:id should return 200 for completed investigation", async () => {
    const port = await startServer();
    const id = seedCompletedInvestigation();

    const res = await fetch(`http://127.0.0.1:${port}/v/${id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("likely-false");
    expect(html).toContain("PM Modi");
  });

  it("GET /v/:id should return 404 for non-existent id", async () => {
    const port = await startServer();

    const res = await fetch(`http://127.0.0.1:${port}/v/nonexistent-id`);

    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("not found");
  });

  it("GET /v/:id should show pending page for in-progress investigation", async () => {
    const port = await startServer();
    const id = repo.create("Some claim being investigated");
    repo.updateStatus(id, "investigating");

    const res = await fetch(`http://127.0.0.1:${port}/v/${id}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("in progress");
  });

  it("GET /v/:id should show pending page for pending investigation", async () => {
    const port = await startServer();
    const id = repo.create("Some pending claim");

    const res = await fetch(`http://127.0.0.1:${port}/v/${id}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("in progress");
  });

  it("GET /v/:id should pass parsed verdict data to template", async () => {
    const port = await startServer();
    const id = seedCompletedInvestigation();

    const res = await fetch(`http://127.0.0.1:${port}/v/${id}`);
    const html = await res.text();

    // Verify key verdict data is rendered
    expect(html).toContain("fabricated"); // nuanceTag
    expect(html).toContain("Authority Impersonation"); // manipulation technique
    expect(html).toContain("Press Information Bureau"); // source
  });
});
