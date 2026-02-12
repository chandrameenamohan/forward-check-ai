import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";

describe("Database connection", () => {
  const testDbPaths: string[] = [];

  function getTestDbPath(): string {
    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    testDbPaths.push(dbPath);
    return dbPath;
  }

  afterEach(() => {
    for (const dbPath of testDbPaths) {
      try {
        if (existsSync(dbPath)) unlinkSync(dbPath);
        // WAL mode creates -wal and -shm files
        const walPath = `${dbPath}-wal`;
        const shmPath = `${dbPath}-shm`;
        if (existsSync(walPath)) unlinkSync(walPath);
        if (existsSync(shmPath)) unlinkSync(shmPath);
      } catch {
        // Ignore cleanup errors
      }
    }
    testDbPaths.length = 0;
  });

  it("should create database file at specified path", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const dbPath = getTestDbPath();

    const db = createDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });

  it("should enable WAL mode", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const dbPath = getTestDbPath();

    const db = createDatabase(dbPath);
    const result = db.pragma("journal_mode") as { journal_mode: string }[];
    expect(result[0]?.journal_mode).toBe("wal");
    db.close();
  });

  it("should enable foreign keys", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const dbPath = getTestDbPath();

    const db = createDatabase(dbPath);
    const result = db.pragma("foreign_keys") as { foreign_keys: number }[];
    expect(result[0]?.foreign_keys).toBe(1);
    db.close();
  });

  it("should create parent directories if they do not exist", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const dir = join(tmpdir(), "forwardcheck-test", `nested-${randomUUID()}`);
    const dbPath = join(dir, "test.db");
    testDbPaths.push(dbPath);

    const db = createDatabase(dbPath);
    expect(existsSync(dbPath)).toBe(true);
    db.close();
  });
});
