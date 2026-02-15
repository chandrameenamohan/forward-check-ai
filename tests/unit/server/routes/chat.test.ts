import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import type { InvestigationPipeline, InvestigateResult } from "../../../../src/orchestrator/pipeline.js";
import type { PipelineEventBus } from "../../../../src/orchestrator/pipeline-events.js";
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

describe("Chat API routes — POST /api/chat/message", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let dbPath: string;
  let mockPipeline: InvestigationPipeline;
  let mockEventBus: PipelineEventBus;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-chat-${randomUUID()}.db`);
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

  it("POST /api/chat/message should create investigation and return id with streamUrl", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "PM Modi announced Rs 5000 direct transfer to every citizen" }),
    });
    const body = (await res.json()) as { id: string; status: string; streamUrl: string };

    expect(res.status).toBe(201);
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe("string");
    expect(body.status).toBe("pending");
    expect(body.streamUrl).toMatch(/^\/api\/live\/.+\/stream$/);

    // Verify investigation was saved to DB
    const investigation = repo.getById(body.id);
    expect(investigation).not.toBeNull();
    expect(investigation!.original_message).toBe("PM Modi announced Rs 5000 direct transfer to every citizen");
    // telegram fields should be null (web chat, not telegram)
    expect(investigation!.telegram_chat_id).toBeNull();

    // Verify pipeline.investigate was called in the background
    // Give it a tick to fire
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(mockPipeline.investigate).toHaveBeenCalled();
  });

  it("POST /api/chat/message should reject message shorter than 10 characters", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "short" }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.error).toContain("10");
    expect(body.error).toContain("5000");
  });

  it("POST /api/chat/message should reject message longer than 5000 characters", async () => {
    const port = await startServer();
    const longMessage = "a".repeat(5001);
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: longMessage }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
    expect(body.error).toContain("5000");
  });

  it("POST /api/chat/message should reject missing message field", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("POST /api/chat/message should strip HTML tags from input", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: '<script>alert("xss")</script>PM Modi announced Rs 5000 direct transfer',
      }),
    });
    const body = (await res.json()) as { id: string };

    expect(res.status).toBe(201);

    // Verify HTML tags were stripped from stored message
    const investigation = repo.getById(body.id);
    expect(investigation).not.toBeNull();
    expect(investigation!.original_message).not.toContain("<script>");
    expect(investigation!.original_message).not.toContain("</script>");
    expect(investigation!.original_message).toContain("PM Modi announced Rs 5000 direct transfer");
  });

  it("POST /api/chat/message should reject non-string message", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: 12345 }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("POST /api/chat/message should trim whitespace before length validation", async () => {
    const port = await startServer();
    // Message is only spaces + a few characters (< 10 trimmed)
    const res = await fetch(`http://127.0.0.1:${port}/api/chat/message`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "   hi   " }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });
});
