import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

describe("FeedbackRepository", () => {
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

  it("should create feedback and return nanoid", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const id = repo.create({
      type: "bug",
      title: "Something is broken",
      description: "The app crashes when I click submit",
      sourceChannel: "web",
    });

    expect(id).toBeTypeOf("string");
    expect(id.length).toBe(21);
  });

  it("should retrieve feedback by id", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const id = repo.create({
      type: "feature",
      title: "Add dark mode",
      description: "It would be great to have a dark mode option",
      sourceChannel: "web",
      userAgent: "Mozilla/5.0",
      ipAddress: "192.168.1.1",
    });

    const feedback = repo.getById(id);

    expect(feedback).not.toBeNull();
    expect(feedback?.id).toBe(id);
    expect(feedback?.type).toBe("feature");
    expect(feedback?.title).toBe("Add dark mode");
    expect(feedback?.description).toBe(
      "It would be great to have a dark mode option",
    );
    expect(feedback?.source_channel).toBe("web");
    expect(feedback?.user_agent).toBe("Mozilla/5.0");
    expect(feedback?.ip_address).toBe("192.168.1.1");
    expect(feedback?.telegram_username).toBeNull();
    expect(feedback?.telegram_user_id).toBeNull();
    expect(feedback?.github_issue_url).toBeNull();
    expect(feedback?.github_issue_number).toBeNull();
    expect(feedback?.created_at).toBeTypeOf("string");
  });

  it("should return null for non-existent id", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const feedback = repo.getById("non-existent-id");

    expect(feedback).toBeNull();
  });

  it("should update GitHub issue fields", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    const id = repo.create({
      type: "bug",
      title: "Button not working",
      description: "The submit button does not respond to clicks",
      sourceChannel: "telegram",
      telegramUsername: "testuser",
      telegramUserId: "12345",
    });

    repo.updateGitHubIssue(
      id,
      "https://github.com/owner/repo/issues/42",
      42,
    );

    const feedback = repo.getById(id);
    expect(feedback?.github_issue_url).toBe(
      "https://github.com/owner/repo/issues/42",
    );
    expect(feedback?.github_issue_number).toBe(42);
    expect(feedback?.telegram_username).toBe("testuser");
    expect(feedback?.telegram_user_id).toBe("12345");
  });

  it("should list recent feedback", async () => {
    const { FeedbackRepository } = await import(
      "../../../src/db/feedback-repository.js"
    );
    const repo = new FeedbackRepository(db);

    repo.create({
      type: "bug",
      title: "First bug report",
      description: "This is the first bug report submitted",
      sourceChannel: "web",
    });
    repo.create({
      type: "feedback",
      title: "Second feedback item",
      description: "This is the second feedback item submitted",
      sourceChannel: "web",
    });
    repo.create({
      type: "feature",
      title: "Third feature request",
      description: "This is the third feature request submitted",
      sourceChannel: "telegram",
    });

    const recent = repo.getRecent(2);
    expect(recent).toHaveLength(2);
    // Most recent first (ordered by rowid DESC)
    expect(recent[0]?.title).toBe("Third feature request");
    expect(recent[1]?.title).toBe("Second feedback item");
  });
});
