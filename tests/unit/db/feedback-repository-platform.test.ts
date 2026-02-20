import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

describe("FeedbackRepository — platform-agnostic fields", () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    dbPath = join(dir, `test-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
      if (existsSync(`${dbPath}-wal`)) unlinkSync(`${dbPath}-wal`);
      if (existsSync(`${dbPath}-shm`)) unlinkSync(`${dbPath}-shm`);
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should write platform_user_id_hash when provided in create()", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const id = repo.create({
      type: "bug",
      title: "WhatsApp bug report",
      description: "Something broke on WhatsApp",
      sourceChannel: "whatsapp",
      platformUserIdHash: "abc123hash456def",
    });

    // Verify at DB level that the column was written
    const row = db
      .prepare("SELECT platform_user_id_hash FROM feedback WHERE id = ?")
      .get(id) as { platform_user_id_hash: string | null } | undefined;

    expect(row).toBeDefined();
    expect(row?.platform_user_id_hash).toBe("abc123hash456def");
  });

  it("should still work with telegramUsername and telegramUserId without platformUserIdHash", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const id = repo.create({
      type: "feedback",
      title: "Telegram feedback",
      description: "Feedback from a Telegram user",
      sourceChannel: "telegram",
      telegramUsername: "teleuser",
      telegramUserId: "99999",
    });

    const feedback = repo.getById(id);

    expect(feedback).not.toBeNull();
    expect(feedback?.telegram_username).toBe("teleuser");
    expect(feedback?.telegram_user_id).toBe("99999");
    expect(feedback?.platform_user_id_hash).toBeNull();
  });

  it("should return platformUserIdHash from getById()", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const id = repo.create({
      type: "feature",
      title: "WhatsApp feature request",
      description: "Would love dark mode on WhatsApp",
      sourceChannel: "whatsapp",
      platformUserIdHash: "sha256_hashed_phone",
    });

    const feedback = repo.getById(id);

    expect(feedback).not.toBeNull();
    expect(feedback?.platform_user_id_hash).toBe("sha256_hashed_phone");
    expect(feedback?.source_channel).toBe("whatsapp");
  });

  it("should return platformUserIdHash from getRecent()", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    repo.create({
      type: "bug",
      title: "Recent WhatsApp feedback",
      description: "Bug from WhatsApp user",
      sourceChannel: "whatsapp",
      platformUserIdHash: "recent_hash_value",
    });

    const recent = repo.getRecent(1);
    expect(recent).toHaveLength(1);
    expect(recent[0]?.platform_user_id_hash).toBe("recent_hash_value");
  });

  it("should default platformUserIdHash to null when not provided", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const id = repo.create({
      type: "bug",
      title: "Web feedback",
      description: "Bug from web user",
      sourceChannel: "web",
    });

    const feedback = repo.getById(id);

    expect(feedback).not.toBeNull();
    expect(feedback?.platform_user_id_hash).toBeNull();
  });
});
