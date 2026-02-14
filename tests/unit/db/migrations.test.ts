import { describe, it, expect, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

describe("Database migrations", () => {
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

  it("should create investigations table with all columns", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });

    runMigrations(db);

    // Query table info to verify all columns exist
    const columns = db.pragma("table_info(investigations)") as {
      name: string;
      type: string;
      notnull: number;
      dflt_value: string | null;
      pk: number;
    }[];

    const columnNames = columns.map((c) => c.name);

    expect(columnNames).toContain("id");
    expect(columnNames).toContain("original_message");
    expect(columnNames).toContain("extracted_claim");
    expect(columnNames).toContain("status");
    expect(columnNames).toContain("classifier_result");
    expect(columnNames).toContain("search_strategy");
    expect(columnNames).toContain("agent_reports");
    expect(columnNames).toContain("challenge_report");
    expect(columnNames).toContain("final_verdict");
    expect(columnNames).toContain("telegram_chat_id");
    expect(columnNames).toContain("telegram_message_id");
    expect(columnNames).toContain("created_at");
    expect(columnNames).toContain("completed_at");
    expect(columnNames).toContain("total_cost_usd");
    expect(columnNames).toContain("pipeline_duration_ms");

    // Verify id is primary key
    const idCol = columns.find((c) => c.name === "id");
    expect(idCol?.pk).toBe(1);
    expect(idCol?.type).toBe("TEXT");

    // Verify NOT NULL constraints
    const originalMessageCol = columns.find(
      (c) => c.name === "original_message",
    );
    expect(originalMessageCol?.notnull).toBe(1);

    const statusCol = columns.find((c) => c.name === "status");
    expect(statusCol?.notnull).toBe(1);

    const createdAtCol = columns.find((c) => c.name === "created_at");
    expect(createdAtCol?.notnull).toBe(1);

    // Verify defaults
    expect(statusCol?.dflt_value).toBe("'pending'");
    expect(createdAtCol?.dflt_value).toBe("datetime('now')");

    const costCol = columns.find((c) => c.name === "total_cost_usd");
    expect(costCol?.dflt_value).toBe("0");
  });

  it("should be idempotent — running twice doesn't error", async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    const dbPath = join(dir, `test-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    testDbs.push({ db, path: dbPath });

    // Run migrations twice — should not throw
    runMigrations(db);
    runMigrations(db);

    // Table should still exist and be functional
    const columns = db.pragma("table_info(investigations)") as {
      name: string;
    }[];
    expect(columns.length).toBeGreaterThan(0);

    // Should be able to insert a row after double migration
    const stmt = db.prepare(
      "INSERT INTO investigations (id, original_message) VALUES (?, ?)",
    );
    stmt.run("test-id", "test message");

    const row = db
      .prepare("SELECT * FROM investigations WHERE id = ?")
      .get("test-id") as { id: string; original_message: string } | undefined;
    expect(row?.id).toBe("test-id");
    expect(row?.original_message).toBe("test message");
  });
});
