import { describe, it, expect, afterAll, beforeAll } from "vitest";
import { createApp } from "../../src/server/app.js";
import { createDatabase } from "../../src/db/connection.js";
import { runMigrations } from "../../src/db/migrations.js";
import { InvestigationRepository } from "../../src/db/investigation-repository.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import {
  makeFinalVerdict,
  makeChallengeReport,
  makeAgentReport,
  makeClassifierResult,
  makeSearchStrategy,
} from "../fixtures/index.js";

describe("API E2E tests", () => {
  let server: Server;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let baseUrl: string;

  beforeAll(async () => {
    db = createDatabase(":memory:");
    runMigrations(db);
    repo = new InvestigationRepository(db);

    const app = createApp(repo);
    await new Promise<void>((resolve) => {
      server = app.listen(0, () => {
        const addr = server.address();
        if (typeof addr === "object" && addr !== null) {
          baseUrl = `http://127.0.0.1:${addr.port}`;
        }
        resolve();
      });
    });
  });

  afterAll(() => {
    server.close();
    db.close();
  });

  it("GET /health returns 200 with status ok", async () => {
    const res = await fetch(`${baseUrl}/health`);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body["status"]).toBe("ok");
    expect(body["timestamp"]).toBeDefined();
    expect(body["uptime"]).toBeGreaterThanOrEqual(0);
  });

  it("POST /api/investigate with valid message returns 201 with id", async () => {
    const res = await fetch(`${baseUrl}/api/investigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "PM Modi announced Rs 5000 transfer" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(201);
    expect(typeof body["id"]).toBe("string");
    expect((body["id"] as string).length).toBeGreaterThan(0);
    expect(body["status"]).toBe("pending");
  });

  it("POST /api/investigate with empty message returns 400", async () => {
    const res = await fetch(`${baseUrl}/api/investigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(400);
    expect(body["error"]).toBeDefined();
  });

  it("GET /api/investigation/:id returns pending investigation", async () => {
    const id = repo.create("Test claim for retrieval");

    const res = await fetch(`${baseUrl}/api/investigation/${id}`);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(200);
    expect(body["id"]).toBe(id);
    expect(body["original_message"]).toBe("Test claim for retrieval");
    expect(body["status"]).toBe("pending");
  });

  it("GET /api/investigation/nonexistent returns 404", async () => {
    const res = await fetch(`${baseUrl}/api/investigation/nonexistent`);
    const body = (await res.json()) as Record<string, unknown>;

    expect(res.status).toBe(404);
    expect(body["error"]).toBeDefined();
  });

  it("GET /v/:id for completed investigation returns 200 HTML", async () => {
    const id = repo.create("PM Modi announced Rs 5000 direct transfer");
    repo.updateClassifierResult(
      id,
      makeClassifierResult({
        extractedClaim: "PM Modi announced Rs 5000 direct transfer",
        domain: "economics",
      }),
    );
    repo.updateSearchStrategy(id, makeSearchStrategy());
    repo.updateAgentReports(id, [
      makeAgentReport({ agentRole: "source_verification" }),
      makeAgentReport({ agentRole: "domain_expertise" }),
      makeAgentReport({ agentRole: "pattern_matching" }),
    ]);
    repo.updateChallengeReport(id, makeChallengeReport());
    repo.updateFinalVerdict(
      id,
      makeFinalVerdict({
        category: "likely-false",
        confidence: 12,
        sources: [
          {
            url: "https://pib.gov.in",
            title: "Press Information Bureau",
            relevance: "Official government source",
          },
        ],
      }),
      120000,
      0.55,
    );

    const res = await fetch(`${baseUrl}/v/${id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("likely-false");
    expect(html).toContain("PM Modi");
  });

  it("GET /v/nonexistent returns 404", async () => {
    const res = await fetch(`${baseUrl}/v/nonexistent`);

    expect(res.status).toBe(404);
    const html = await res.text();
    expect(html).toContain("not found");
  });
});
