import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import { PipelineEventBus } from "../../../../src/orchestrator/pipeline-events.js";
import type { PipelineEvent } from "../../../../src/orchestrator/pipeline-events.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";

describe("SSE Live Stream integration (pipeline → SSE)", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let eventBus: PipelineEventBus;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-live-integration-${randomUUID()}.db`);
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

  it("should stream events from pipeline through SSE endpoint", async () => {
    const port = await startServer();
    const id = repo.create("Test claim for pipeline integration");

    // Connect SSE client
    const controller = new AbortController();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/${id}/stream`,
      { signal: controller.signal },
    );

    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Wait for SSE subscription to be set up
    await new Promise((resolve) => setTimeout(resolve, 50));

    // Simulate pipeline emitting events (as the real pipeline would)
    const events: PipelineEvent[] = [
      { kind: "pipeline:start", investigationId: id, message: "Test claim", timestamp: Date.now() },
      { kind: "classifier:start", investigationId: id, timestamp: Date.now() },
      { kind: "classifier:complete", investigationId: id, result: {
        category: "factual_claim", extractedClaim: "Test claim",
        isCompound: false, domain: "general", language: "en",
        urgency: "medium", reasoning: "test",
      }, costUsd: 0.01, timestamp: Date.now() },
      { kind: "strategist:start", investigationId: id, claim: "Test claim", timestamp: Date.now() },
      { kind: "strategist:complete", investigationId: id, costUsd: 0.20, timestamp: Date.now() },
    ];

    for (const event of events) {
      eventBus.emit(event);
    }

    // Read SSE data and verify all events arrived
    let accumulated = "";
    for (let i = 0; i < 30; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (accumulated.includes("strategist:complete")) break;
    }

    expect(accumulated).toContain("event: pipeline:start");
    expect(accumulated).toContain("event: classifier:start");
    expect(accumulated).toContain("event: classifier:complete");
    expect(accumulated).toContain("event: strategist:start");
    expect(accumulated).toContain("event: strategist:complete");

    // Verify event data is parseable JSON
    const lines = accumulated.split("\n");
    const dataLines = lines.filter((l) => l.startsWith("data: "));
    expect(dataLines.length).toBe(5);

    for (const line of dataLines) {
      const json = line.slice(6); // strip "data: "
      const parsed = JSON.parse(json);
      expect(parsed.investigationId).toBe(id);
      expect(parsed.kind).toBeDefined();
      expect(parsed.timestamp).toBeDefined();
    }

    controller.abort();
    reader.cancel().catch(() => {});
  });

  it("should handle catch-up for late-joining SSE clients after pipeline events", async () => {
    const port = await startServer();
    const id = repo.create("Late join claim");

    // Pipeline emits events BEFORE any SSE client connects
    eventBus.emit({ kind: "pipeline:start", investigationId: id, message: "Late join claim", timestamp: Date.now() });
    eventBus.emit({ kind: "classifier:start", investigationId: id, timestamp: Date.now() });
    eventBus.emit({ kind: "classifier:complete", investigationId: id, result: {
      category: "factual_claim", extractedClaim: "Late join claim",
      isCompound: false, domain: "general", language: "en",
      urgency: "low", reasoning: "test",
    }, costUsd: 0.01, timestamp: Date.now() });

    // NOW a client connects (late join)
    const controller = new AbortController();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/${id}/stream`,
      { signal: controller.signal },
    );

    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Read catch-up events
    let accumulated = "";
    for (let i = 0; i < 20; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (accumulated.includes("classifier:complete")) break;
    }

    // Client should receive all historical events
    expect(accumulated).toContain("event: pipeline:start");
    expect(accumulated).toContain("event: classifier:start");
    expect(accumulated).toContain("event: classifier:complete");

    // Then emit a NEW event — client should receive it too
    await new Promise((resolve) => setTimeout(resolve, 50));
    eventBus.emit({ kind: "strategist:start", investigationId: id, claim: "Late join claim", timestamp: Date.now() });

    for (let i = 0; i < 20; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (accumulated.includes("strategist:start")) break;
    }

    expect(accumulated).toContain("event: strategist:start");

    controller.abort();
    reader.cancel().catch(() => {});
  });

  it("should only stream events for the requested investigation", async () => {
    const port = await startServer();
    const id1 = repo.create("Claim A");
    const id2 = repo.create("Claim B");

    // Subscribe to investigation 1
    const controller = new AbortController();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/${id1}/stream`,
      { signal: controller.signal },
    );

    expect(res.status).toBe(200);
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    await new Promise((resolve) => setTimeout(resolve, 50));

    // Emit event for investigation 2 (should NOT appear in stream)
    eventBus.emit({ kind: "pipeline:start", investigationId: id2, message: "Claim B", timestamp: Date.now() });

    // Emit event for investigation 1 (should appear)
    eventBus.emit({ kind: "pipeline:start", investigationId: id1, message: "Claim A", timestamp: Date.now() });

    let accumulated = "";
    for (let i = 0; i < 20; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (accumulated.includes("Claim A")) break;
    }

    expect(accumulated).toContain("Claim A");
    expect(accumulated).not.toContain("Claim B");

    controller.abort();
    reader.cancel().catch(() => {});
  });

  it("existing app startup tests pass — createApp with no eventBus still works", async () => {
    // createApp with repo but no eventBus should work (backward compat)
    const app = createApp(repo);
    const port = await new Promise<number>((resolve) => {
      const s = app.listen(0, () => {
        const addr = s.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
      server = s;
    });

    // Health endpoint still works
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.status).toBe("ok");

    // SSE endpoint returns 404 (not mounted)
    const sseRes = await fetch(`http://127.0.0.1:${port}/api/live/some-id/stream`);
    expect(sseRes.status).toBe(404);
  });
});
