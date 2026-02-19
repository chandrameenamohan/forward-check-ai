import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";

/** Helper to clean up SQLite database files (including WAL/SHM) */
function cleanupDb(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const filePath = dbPath + suffix;
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

function createMockBot(): Record<string, unknown> {
  return {
    api: {
      config: { use: vi.fn() },
      sendMessage: vi.fn().mockResolvedValue({
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: { id: 1, type: "private" },
        text: "",
      }),
      editMessageText: vi.fn().mockResolvedValue({ ok: true }),
    },
    command: vi.fn(),
    on: vi.fn(),
    catch: vi.fn(),
    start: vi.fn().mockResolvedValue(undefined),
    stop: vi.fn(),
    botInfo: {
      id: 123,
      is_bot: true,
      first_name: "test",
      username: "test_bot",
      can_join_groups: true,
      can_read_all_group_messages: false,
      supports_inline_queries: false,
      can_connect_to_business: false,
      has_main_web_app: false,
    },
  };
}

// Mock Grammy Bot as a proper class
vi.mock("grammy", async () => {
  const actual = await vi.importActual<typeof import("grammy")>("grammy");
  class MockBot {
    api: Record<string, unknown>;
    botInfo: Record<string, unknown>;
    private handlers: Record<string, unknown> = {};

    constructor(_token: string) {
      const mock = createMockBot();
      this.api = mock.api as Record<string, unknown>;
      this.botInfo = mock.botInfo as Record<string, unknown>;
    }

    command = vi.fn();
    on = vi.fn();
    catch = vi.fn();
    start = vi.fn().mockResolvedValue(undefined);
    stop = vi.fn();
  }

  return {
    ...actual,
    Bot: MockBot,
  };
});

describe("TelegramAdapter integration", () => {
  const dbPath = join(tmpdir(), `forwardcheck-tg-adapter-${randomUUID()}.db`);

  afterEach(() => {
    cleanupDb(dbPath);
  });

  it("TelegramAdapter should start without errors", async () => {
    const { createDatabase } = await import("../../src/db/connection.js");
    const { runMigrations } = await import("../../src/db/migrations.js");
    const { InvestigationRepository } = await import("../../src/db/investigation-repository.js");
    const { ClaudeClient } = await import("../../src/services/claude-client.js");
    const { ToolRegistry } = await import("../../src/tools/tool-registry.js");
    const { InvestigationPipeline } = await import("../../src/orchestrator/pipeline.js");
    const { TelegramAdapter } = await import("../../src/platforms/telegram/adapter.js");

    const db = createDatabase(dbPath);
    runMigrations(db);
    const repo = new InvestigationRepository(db);
    const client = new ClaudeClient("test-key-not-real");
    const toolRegistry = new ToolRegistry();
    const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

    const adapter = new TelegramAdapter(
      "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      pipeline,
      "http://localhost:3000",
      repo,
    );

    expect(adapter.platform).toBe("telegram");

    // start() should not throw
    await expect(adapter.start()).resolves.toBeUndefined();

    db.close();
  });

  it("TelegramAdapter should stop cleanly", async () => {
    const { createDatabase } = await import("../../src/db/connection.js");
    const { runMigrations } = await import("../../src/db/migrations.js");
    const { InvestigationRepository } = await import("../../src/db/investigation-repository.js");
    const { ClaudeClient } = await import("../../src/services/claude-client.js");
    const { ToolRegistry } = await import("../../src/tools/tool-registry.js");
    const { InvestigationPipeline } = await import("../../src/orchestrator/pipeline.js");
    const { TelegramAdapter } = await import("../../src/platforms/telegram/adapter.js");

    const db = createDatabase(dbPath);
    runMigrations(db);
    const repo = new InvestigationRepository(db);
    const client = new ClaudeClient("test-key-not-real");
    const toolRegistry = new ToolRegistry();
    const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

    const adapter = new TelegramAdapter(
      "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      pipeline,
      "http://localhost:3000",
      repo,
    );

    await adapter.start();

    // stop() should not throw
    await expect(adapter.stop()).resolves.toBeUndefined();

    db.close();
  });
});
