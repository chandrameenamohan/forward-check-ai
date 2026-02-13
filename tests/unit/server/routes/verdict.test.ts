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
import {
  makeFinalVerdict,
  makeChallengeReport,
  makeAgentReport,
  makeClassifierResult,
  makeSearchStrategy,
} from "../../../fixtures/index.js";

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
    repo.updateClassifierResult(id, makeClassifierResult({
      extractedClaim: "PM Modi announced Rs 5000 direct transfer",
      domain: "economics",
      reasoning: "Contains a specific monetary policy claim.",
    }));
    repo.updateSearchStrategy(id, makeSearchStrategy());
    repo.updateAgentReports(id, [
      makeAgentReport({ agentRole: "source_verification" }),
      makeAgentReport({ agentRole: "domain_expertise" }),
      makeAgentReport({ agentRole: "pattern_matching" }),
    ]);
    repo.updateChallengeReport(id, makeChallengeReport());
    repo.updateFinalVerdict(id, makeFinalVerdict({
      category: "likely-false",
      nuanceTag: "fabricated",
      confidence: 12,
      manipulationTechniques: [
        {
          technique: "Authority Impersonation",
          description: "Uses PM's name for credibility",
          evidenceQuote: "PM Modi announced...",
          severity: 85,
        },
      ],
      sources: [
        {
          url: "https://pib.gov.in",
          title: "Press Information Bureau",
          relevance: "Official government source",
        },
      ],
    }), 120000, 0.55);
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
