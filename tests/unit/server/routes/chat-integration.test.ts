import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import type { InvestigationPipeline, InvestigateResult } from "../../../../src/orchestrator/pipeline.js";
import type { PipelineEventBus } from "../../../../src/orchestrator/pipeline-events.js";
import { cleanupRateLimiter } from "../../../../src/server/middleware/rate-limit.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";

function createMockPipeline(): InvestigationPipeline {
  return {
    investigate: vi.fn().mockResolvedValue({
      verdict: null,
      investigationId: "mock-id",
      totalCostUsd: 0,
      durationMs: 0,
    } satisfies InvestigateResult),
  } as unknown as InvestigationPipeline;
}

function createMockEventBus(): PipelineEventBus {
  return {
    emit: vi.fn(),
    subscribe: vi.fn().mockReturnValue(() => {}),
    getHistory: vi.fn().mockReturnValue([]),
    destroy: vi.fn(),
  } as unknown as PipelineEventBus;
}

describe("Chat integration — routes mounted in app.ts", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let dbPath: string;
  let mockPipeline: InvestigationPipeline;
  let mockEventBus: PipelineEventBus;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-chat-int-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
    repo = new InvestigationRepository(db);
    mockPipeline = createMockPipeline();
    mockEventBus = createMockEventBus();
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    if (db) {
      db.close();
    }
    cleanupRateLimiter();
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
      const app = createApp(repo, mockEventBus, mockPipeline);
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });
  }

  it("POST /api/chat/message should return 201 when all dependencies provided", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "PM Modi announced Rs 5000 direct transfer to every citizen" }),
    });
    const body = (await res.json()) as { id: string; status: string; streamUrl: string };

    expect(res.status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe("pending");
    expect(body.streamUrl).toMatch(/^\/api\/live\/.+\/stream$/);
  });

  it("GET /health should still return 200 after chat routes mounted", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = (await res.json()) as { status: string };

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("existing API routes should remain functional", async () => {
    const port = await startServer();

    // Create an investigation via chat
    const chatRes = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "WHO says green tea cures cancer in 2026" }),
    });
    const chatBody = (await chatRes.json()) as { id: string };
    expect(chatRes.status).toBe(201);

    // GET /api/investigation/:id should still work
    const getRes = await fetch(`http://127.0.0.1:${port}/api/investigation/${chatBody.id}`);
    const getBody = (await getRes.json()) as { id: string; status: string };
    expect(getRes.status).toBe(200);
    expect(getBody.id).toBe(chatBody.id);

    // Landing page should still work
    const landingRes = await fetch(`http://127.0.0.1:${port}/`);
    expect(landingRes.status).toBe(200);
  });

  it("POST /api/chat/message should enforce rate limiting", async () => {
    const port = await startServer();
    const validMessage = "PM Modi announced Rs 5000 direct transfer to every citizen";

    // Send 10 requests (at the limit)
    for (let i = 0; i < 10; i++) {
      const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: validMessage }),
      });
      expect(res.status).toBe(201);
    }

    // 11th request should be rate limited
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: validMessage }),
    });
    expect(res.status).toBe(429);

    const body = (await res.json()) as { error: string };
    expect(body.error).toContain("Too many requests");
    expect(res.headers.get("retry-after")).toBeDefined();
  });

  it("rate limiting should not affect other routes", async () => {
    const port = await startServer();
    const validMessage = "PM Modi announced Rs 5000 direct transfer to every citizen";

    // Exhaust rate limit on chat endpoint
    for (let i = 0; i < 10; i++) {
      await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: validMessage }),
      });
    }

    // Health endpoint should still work
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthRes.status).toBe(200);

    // Landing page should still work
    const landingRes = await fetch(`http://127.0.0.1:${port}/`);
    expect(landingRes.status).toBe(200);
  });
});
