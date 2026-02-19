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

describe("Investigation API routes", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-investigate-${randomUUID()}.db`);
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

  it("POST /api/investigate should create investigation and return id", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/investigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "PM Modi announced Rs 5000 transfer" }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe("string");
    expect(body.status).toBe("pending");

    // Verify it was saved to DB
    const investigation = repo.getById(body.id);
    expect(investigation).not.toBeNull();
    expect(investigation!.original_message).toBe(
      "PM Modi announced Rs 5000 transfer",
    );
  });

  it("POST /api/investigate should accept optional chatId", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/investigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Test claim",
        chatId: "12345",
      }),
    });
    const body = await res.json();

    expect(res.status).toBe(201);

    const investigation = repo.getById(body.id);
    expect(investigation).not.toBeNull();
    expect(investigation!.platform_chat_id).toBe("12345");
  });

  it("POST /api/investigate should reject empty message", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/investigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "" }),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("POST /api/investigate should reject missing message", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/investigate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("GET /api/investigation/:id should return investigation", async () => {
    const port = await startServer();

    // Create an investigation first
    const id = repo.create("Some claim to check");

    const res = await fetch(
      `http://127.0.0.1:${port}/api/investigation/${id}`,
    );
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.id).toBe(id);
    expect(body.original_message).toBe("Some claim to check");
    expect(body.status).toBe("pending");
  });

  it("GET /api/investigation/:id should return 404 for non-existent id", async () => {
    const port = await startServer();
    const res = await fetch(
      `http://127.0.0.1:${port}/api/investigation/nonexistent-id`,
    );
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toBeDefined();
  });
});
