import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

interface ColumnInfo {
  name: string;
  type: string;
  notnull: number;
  dflt_value: string | null;
  pk: number;
}

describe("Platform-agnostic database migrations", () => {
  const testDbs: { db: Database.Database; path: string }[] = [];

  afterEach(() => {
    for (const { db, path } of testDbs) {
      try {
        db.close();
      } catch {
        // Ignore close errors
      }
      try {
        if (existsSync(path)) unlinkSync(path);
        if (existsSync(`${path}-wal`)) unlinkSync(`${path}-wal`);
        if (existsSync(`${path}-shm`)) unlinkSync(`${path}-shm`);
      } catch {
        // Ignore cleanup errors
      }
    }
    testDbs.length = 0;
  });

  function createTestDb(): Database.Database {
    const { createDatabase } = require("../../../src/db/connection.js") as {
      createDatabase: (path: string) => Database.Database;
    };
    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });
    return db;
  }

  it("should add source_platform column with default 'telegram'", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });

    runMigrations(db);

    const columns = db.pragma("table_info(investigations)") as ColumnInfo[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("source_platform");

    const sourcePlatformCol = columns.find((c) => c.name === "source_platform");
    expect(sourcePlatformCol?.dflt_value).toBe("'telegram'");

    // Verify default is applied on insert
    db.prepare("INSERT INTO investigations (id, original_message) VALUES (?, ?)").run("test-1", "test msg");
    const row = db.prepare("SELECT source_platform FROM investigations WHERE id = ?").get("test-1") as { source_platform: string };
    expect(row.source_platform).toBe("telegram");
  });

  it("should add platform_chat_id and platform_message_id columns", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });

    runMigrations(db);

    const columns = db.pragma("table_info(investigations)") as ColumnInfo[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("platform_chat_id");
    expect(columnNames).toContain("platform_message_id");

    // Verify columns are writable
    db.prepare(
      "INSERT INTO investigations (id, original_message, platform_chat_id, platform_message_id) VALUES (?, ?, ?, ?)",
    ).run("test-2", "test msg", "chat-123", "msg-456");

    const row = db.prepare("SELECT platform_chat_id, platform_message_id FROM investigations WHERE id = ?").get("test-2") as {
      platform_chat_id: string;
      platform_message_id: string;
    };
    expect(row.platform_chat_id).toBe("chat-123");
    expect(row.platform_message_id).toBe("msg-456");
  });

  it("should add platform_user_id_hash column to feedback table", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });

    runMigrations(db);

    const columns = db.pragma("table_info(feedback)") as ColumnInfo[];
    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("platform_user_id_hash");

    // Verify column is writable
    db.prepare(
      "INSERT INTO feedback (id, type, title, description, source_channel, platform_user_id_hash) VALUES (?, ?, ?, ?, ?, ?)",
    ).run("fb-1", "bug", "Test", "Description text", "whatsapp", "hash-abc-123");

    const row = db.prepare("SELECT platform_user_id_hash FROM feedback WHERE id = ?").get("fb-1") as {
      platform_user_id_hash: string;
    };
    expect(row.platform_user_id_hash).toBe("hash-abc-123");
  });

  it("should be idempotent — running twice doesn't error", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });

    // Run twice — should not throw
    runMigrations(db);
    runMigrations(db);

    // Verify all platform columns still exist
    const invColumns = db.pragma("table_info(investigations)") as ColumnInfo[];
    const invColumnNames = invColumns.map((c) => c.name);
    expect(invColumnNames).toContain("source_platform");
    expect(invColumnNames).toContain("platform_chat_id");
    expect(invColumnNames).toContain("platform_message_id");

    const fbColumns = db.pragma("table_info(feedback)") as ColumnInfo[];
    const fbColumnNames = fbColumns.map((c) => c.name);
    expect(fbColumnNames).toContain("platform_user_id_hash");
  });

  it("should backfill platform columns from telegram columns", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });

    // Simulate pre-migration state: create table without platform columns, insert data
    db.exec(`
      CREATE TABLE IF NOT EXISTS investigations (
        id TEXT PRIMARY KEY,
        original_message TEXT NOT NULL,
        extracted_claim TEXT,
        status TEXT NOT NULL DEFAULT 'pending',
        classifier_result JSON,
        search_strategy JSON,
        agent_reports JSON,
        challenge_report JSON,
        final_verdict JSON,
        telegram_chat_id TEXT,
        telegram_message_id TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        completed_at TEXT,
        total_cost_usd REAL DEFAULT 0,
        pipeline_duration_ms INTEGER
      )
    `);

    // Add source_url column as it would exist pre-migration
    try {
      db.exec("ALTER TABLE investigations ADD COLUMN source_url TEXT");
    } catch {
      /* already exists */
    }

    // Create feedback table too
    db.exec(`
      CREATE TABLE IF NOT EXISTS feedback (
        id TEXT PRIMARY KEY,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL,
        source_channel TEXT NOT NULL,
        user_agent TEXT,
        telegram_username TEXT,
        telegram_user_id TEXT,
        github_issue_url TEXT,
        github_issue_number INTEGER,
        ip_address TEXT,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
      )
    `);

    // Insert pre-existing data with telegram columns
    db.prepare(
      "INSERT INTO investigations (id, original_message, telegram_chat_id, telegram_message_id) VALUES (?, ?, ?, ?)",
    ).run("old-1", "Old message", "tg-chat-999", "tg-msg-888");

    db.prepare(
      "INSERT INTO investigations (id, original_message) VALUES (?, ?)",
    ).run("old-2", "No telegram data");

    // Now run migrations (which should add platform columns and backfill)
    runMigrations(db);

    // The row with telegram data should have been backfilled
    const row1 = db.prepare("SELECT source_platform, platform_chat_id, platform_message_id FROM investigations WHERE id = ?").get("old-1") as {
      source_platform: string;
      platform_chat_id: string | null;
      platform_message_id: string | null;
    };
    expect(row1.source_platform).toBe("telegram");
    expect(row1.platform_chat_id).toBe("tg-chat-999");
    expect(row1.platform_message_id).toBe("tg-msg-888");

    // The row without telegram data should NOT be backfilled (platform columns should be null)
    const row2 = db.prepare("SELECT source_platform, platform_chat_id, platform_message_id FROM investigations WHERE id = ?").get("old-2") as {
      source_platform: string;
      platform_chat_id: string | null;
      platform_message_id: string | null;
    };
    expect(row2.source_platform).toBe("telegram"); // default value
    expect(row2.platform_chat_id).toBeNull();
    expect(row2.platform_message_id).toBeNull();
  });
});
