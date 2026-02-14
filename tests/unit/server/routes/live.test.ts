import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import { PipelineEventBus } from "../../../../src/orchestrator/pipeline-events.js";
import {
  makeFinalVerdict,
  makeChallengeReport,
  makeAgentReport,
  makeClassifierResult,
  makeSearchStrategy,
} from "../../../fixtures/index.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";

describe("Live verdict page routes", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let eventBus: PipelineEventBus;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-live-page-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
    repo = new InvestigationRepository(db);
    eventBus = new PipelineEventBus({
      historyTtlMs: 60_000,
      cleanupIntervalMs: 60_000,
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    eventBus.destroy();
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
      const app = createApp(repo, eventBus);
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });
  }

  function seedCompletedInvestigation(): string {
    const id = repo.create("Test claim for live page");
    repo.updateClassifierResult(id, makeClassifierResult());
    repo.updateSearchStrategy(id, makeSearchStrategy());
    repo.updateAgentReports(id, [makeAgentReport()]);
    repo.updateChallengeReport(id, makeChallengeReport());
    repo.updateFinalVerdict(id, makeFinalVerdict(), 120000, 0.55);
    return id;
  }

  it("GET /live/:id should return 200 for pending investigation", async () => {
    const port = await startServer();
    const id = repo.create("Some pending claim");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("ForwardCheck");
    expect(html).toContain("Some pending claim");
  });

  it("GET /live/:id should redirect to /v/:id for completed investigation", async () => {
    const port = await startServer();
    const id = seedCompletedInvestigation();

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`, {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/v/${id}`);
  });

  it("GET /live/:id should return 404 for non-existent id", async () => {
    const port = await startServer();

    const res = await fetch(`http://127.0.0.1:${port}/live/nonexistent-id`);

    expect(res.status).toBe(404);
  });

  it("GET /live/:id should contain SSE connection script", async () => {
    const port = await startServer();
    const id = repo.create("Claim for SSE test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("EventSource");
    expect(html).toContain("/api/live/");
    expect(html).toContain("/stream");
    // Verify the investigation ID is embedded for the SSE URL
    expect(html).toContain(id);
  });

  it("GET /live/:id should render for investigating status", async () => {
    const port = await startServer();
    const id = repo.create("Claim being investigated");
    repo.updateStatus(id, "investigating");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Claim being investigated");
  });

  it("GET /live/:id should include design system tokens", async () => {
    const port = await startServer();
    const id = repo.create("Design system test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("--fc-bg");
    expect(html).toContain("--fc-surface");
    expect(html).toContain("Satoshi");
  });

  it("GET /live/:id should have responsive viewport meta tag", async () => {
    const port = await startServer();
    const id = repo.create("Responsive test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width");
  });

  // ── Task 2.2: SSE client and event dispatcher ──

  it("GET /live/:id should contain event handler for pipeline:complete", async () => {
    const port = await startServer();
    const id = repo.create("Complete handler test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("pipeline:complete");
    expect(html).toContain("/v/");
  });

  it("GET /live/:id should contain event handlers for all pipeline stages", async () => {
    const port = await startServer();
    const id = repo.create("Event handler test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // All pipeline event types the client should handle
    expect(html).toContain("classifier:start");
    expect(html).toContain("classifier:complete");
    expect(html).toContain("strategist:start");
    expect(html).toContain("strategist:complete");
    expect(html).toContain("investigators:start");
    expect(html).toContain("investigator:complete");
    expect(html).toContain("da:start");
    expect(html).toContain("da:complete");
    expect(html).toContain("judge:start");
    expect(html).toContain("judge:complete");
    expect(html).toContain("pipeline:complete");
    expect(html).toContain("pipeline:error");
  });

  it("GET /live/:id should contain UI update functions for each agent", async () => {
    const port = await startServer();
    const id = repo.create("UI function test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("updateClassifier");
    expect(html).toContain("updateStrategist");
    expect(html).toContain("updateInvestigators");
    expect(html).toContain("updateDA");
    expect(html).toContain("updateJudge");
  });

  it("GET /live/:id should show connecting spinner on initial load", async () => {
    const port = await startServer();
    const id = repo.create("Spinner test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-connecting-spinner");
    expect(html).toContain("Connecting to investigation");
  });

  it("GET /live/:id should close EventSource on pipeline completion", async () => {
    const port = await startServer();
    const id = repo.create("Close test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // EventSource should be closed in both complete and error handlers
    expect(html).toContain("evtSource.close()");
  });
});
