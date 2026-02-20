import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

describe("InvestigationRepository — platform-agnostic fields", () => {
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

  it("create() should write platform-agnostic fields", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim", {
      platform: "whatsapp",
      platformChatId: "wa-chat-123",
      platformMessageId: "wa-msg-456",
    });

    const investigation = repo.getById(id);
    expect(investigation).not.toBeNull();
    expect(investigation!.source_platform).toBe("whatsapp");
    expect(investigation!.platform_chat_id).toBe("wa-chat-123");
    expect(investigation!.platform_message_id).toBe("wa-msg-456");
  });

  it("create() should write telegram columns for backward compat when platform is telegram", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Telegram claim", {
      platform: "telegram",
      platformChatId: "tg-chat-789",
      platformMessageId: "tg-msg-012",
    });

    const investigation = repo.getById(id);
    expect(investigation).not.toBeNull();
    // New platform-agnostic columns
    expect(investigation!.source_platform).toBe("telegram");
    expect(investigation!.platform_chat_id).toBe("tg-chat-789");
    expect(investigation!.platform_message_id).toBe("tg-msg-012");
    // Old telegram columns for backward compat
    expect(investigation!.telegram_chat_id).toBe("tg-chat-789");
    expect(investigation!.telegram_message_id).toBe("tg-msg-012");
  });

  it("create() should write whatsapp platform correctly", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("WhatsApp forwarded claim", {
      platform: "whatsapp",
      platformChatId: "15551234567",
      platformMessageId: "wamid.abc123",
    });

    const investigation = repo.getById(id);
    expect(investigation).not.toBeNull();
    expect(investigation!.source_platform).toBe("whatsapp");
    expect(investigation!.platform_chat_id).toBe("15551234567");
    expect(investigation!.platform_message_id).toBe("wamid.abc123");
    // Should NOT write to telegram columns for non-telegram platform
    expect(investigation!.telegram_chat_id).toBeNull();
    expect(investigation!.telegram_message_id).toBeNull();
  });

  it("getById() should return platform fields", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Platform fields test", {
      platform: "web",
      platformChatId: "session-abc",
      platformMessageId: "msg-xyz",
      sourceUrl: "https://example.com/article",
    });

    const investigation = repo.getById(id);
    expect(investigation).not.toBeNull();
    expect(investigation!.source_platform).toBe("web");
    expect(investigation!.platform_chat_id).toBe("session-abc");
    expect(investigation!.platform_message_id).toBe("msg-xyz");
    expect(investigation!.source_url).toBe("https://example.com/article");
  });

  it("create() without options should default platform fields to null", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Plain text claim");
    const investigation = repo.getById(id);

    expect(investigation).not.toBeNull();
    expect(investigation!.platform_chat_id).toBeNull();
    expect(investigation!.platform_message_id).toBeNull();
  });
});
