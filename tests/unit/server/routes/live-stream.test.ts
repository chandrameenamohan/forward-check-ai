import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
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

describe("SSE Live Stream endpoint", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let eventBus: PipelineEventBus;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-live-stream-${randomUUID()}.db`);
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

  it("GET /api/live/:id/stream should return SSE content type", async () => {
    const port = await startServer();
    const id = repo.create("Test claim for SSE");

    const controller = new AbortController();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/${id}/stream`,
      { signal: controller.signal, headers: { Accept: "text/event-stream" } },
    );

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("text/event-stream");
    expect(res.headers.get("cache-control")).toBe("no-cache");
    expect(res.headers.get("connection")).toBe("keep-alive");

    controller.abort();
  });

  it("should flush historical events on connect", async () => {
    const port = await startServer();
    const id = repo.create("Test claim for history");

    // Emit events BEFORE client connects
    const historicalEvent: PipelineEvent = {
      kind: "pipeline:start",
      investigationId: id,
      message: "Test claim for history",
      timestamp: Date.now(),
    };
    eventBus.emit(historicalEvent);

    const classifierEvent: PipelineEvent = {
      kind: "classifier:start",
      investigationId: id,
      timestamp: Date.now(),
    };
    eventBus.emit(classifierEvent);

    const controller = new AbortController();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/${id}/stream`,
      { signal: controller.signal },
    );

    // Read some data from the stream
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let accumulated = "";

    // Read chunks until we get both historical events
    const readUntil = async (target: string, maxReads = 20): Promise<string> => {
      for (let i = 0; i < maxReads; i++) {
        const { value, done } = await reader.read();
        if (done) break;
        accumulated += decoder.decode(value, { stream: true });
        if (accumulated.includes(target)) break;
      }
      return accumulated;
    };

    await readUntil("classifier:start");

    expect(accumulated).toContain("event: pipeline:start");
    expect(accumulated).toContain("event: classifier:start");

    controller.abort();
    reader.cancel().catch(() => {});
  });

  it("should stream new events as they arrive", async () => {
    const port = await startServer();
    const id = repo.create("Test claim for streaming");

    const controller = new AbortController();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/${id}/stream`,
      { signal: controller.signal },
    );

    const reader = res.body!.getReader();
    const decoder = new TextDecoder();

    // Emit an event AFTER the client connects
    // Small delay to ensure subscription is set up
    await new Promise((resolve) => setTimeout(resolve, 50));

    eventBus.emit({
      kind: "pipeline:start",
      investigationId: id,
      message: "Test claim for streaming",
      timestamp: Date.now(),
    });

    // Read the event
    let accumulated = "";
    for (let i = 0; i < 20; i++) {
      const { value, done } = await reader.read();
      if (done) break;
      accumulated += decoder.decode(value, { stream: true });
      if (accumulated.includes("pipeline:start")) break;
    }

    expect(accumulated).toContain("event: pipeline:start");
    expect(accumulated).toContain('"kind":"pipeline:start"');

    controller.abort();
    reader.cancel().catch(() => {});
  });

  it("should return 404 for non-existent investigation", async () => {
    const port = await startServer();

    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/nonexistent-id/stream`,
    );

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it("should clean up subscription on disconnect", async () => {
    const port = await startServer();
    const id = repo.create("Test claim for cleanup");

    const controller = new AbortController();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/live/${id}/stream`,
      { signal: controller.signal },
    );

    expect(res.status).toBe(200);

    // Abort to simulate disconnect
    controller.abort();

    // Wait for cleanup to happen
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Emitting an event after disconnect should not throw
    // (subscription was removed, no callback to call)
    expect(() => {
      eventBus.emit({
        kind: "pipeline:start",
        investigationId: id,
        message: "After disconnect",
        timestamp: Date.now(),
      });
    }).not.toThrow();
  });
});
