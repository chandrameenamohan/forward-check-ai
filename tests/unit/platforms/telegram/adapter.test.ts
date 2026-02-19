import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import type { InvestigationPipeline, InvestigateResult } from "../../../../src/orchestrator/pipeline.js";
import type { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import type { FeedbackRepository } from "../../../../src/db/feedback-repository.js";
import type { GitHubIssueService } from "../../../../src/services/github-issues.js";
import { makeFinalVerdict } from "../../../fixtures/index.js";

vi.mock("../../../../src/services/url-extractor.js", () => ({
  detectUrl: vi.fn().mockReturnValue(null),
  enrichMessageWithUrl: vi.fn(),
  fetchUrlContent: vi.fn(),
}));

const FAKE_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";
const BASE_URL = "http://localhost:3000";

const fakeBotInfo: UserFromGetMe = {
  id: 123456,
  is_bot: true,
  first_name: "forward_check_opus_bot",
  username: "forward_check_opus_bot",
  can_join_groups: true,
  can_read_all_group_messages: false,
  supports_inline_queries: false,
  can_connect_to_business: false,
  has_main_web_app: false,
};

function makeMessageUpdate(overrides: Record<string, unknown>): Update {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: {
        id: 100,
        type: "private" as const,
        first_name: "Test",
        last_name: "User",
      },
      from: { id: 100, is_bot: false, first_name: "Test", last_name: "User" },
      ...overrides,
    },
  } as Update;
}

describe("TelegramAdapter", () => {
  const fakeRepo = {
    updateStatus: vi.fn(),
  } as unknown as InvestigationRepository;

  const fakeFeedbackRepo = {
    create: vi.fn().mockReturnValue("fb-001"),
    updateGitHubIssue: vi.fn(),
  } as unknown as FeedbackRepository;

  it("should create adapter with platform 'telegram'", async () => {
    const { TelegramAdapter } = await import(
      "../../../../src/platforms/telegram/adapter.js"
    );

    const mockPipeline = {
      investigate: vi.fn().mockResolvedValue({
        verdict: null,
        investigationId: "inv-001",
        nonFactualResponse: "Greeting",
        totalCostUsd: 0,
        durationMs: 0,
      } satisfies InvestigateResult),
    } as unknown as InvestigationPipeline;

    const adapter = new TelegramAdapter(
      FAKE_TOKEN,
      mockPipeline,
      BASE_URL,
      fakeRepo,
    );

    expect(adapter.platform).toBe("telegram");
  });

  it("should convert Grammy message to PlatformMessage", async () => {
    const { TelegramAdapter } = await import(
      "../../../../src/platforms/telegram/adapter.js"
    );

    let capturedOptions: Record<string, unknown> | undefined;

    const mockPipeline = {
      investigate: vi.fn().mockImplementation((_msg, options) => {
        capturedOptions = options;
        return Promise.resolve({
          verdict: makeFinalVerdict(),
          investigationId: "inv-convert-001",
          totalCostUsd: 0.25,
          durationMs: 5000,
        } satisfies InvestigateResult);
      }),
    } as unknown as InvestigationPipeline;

    const adapter = new TelegramAdapter(
      FAKE_TOKEN,
      mockPipeline,
      BASE_URL,
      fakeRepo,
    );

    // Access the internal bot for testing
    const bot = adapter.getBot();
    bot.botInfo = fakeBotInfo;

    // Intercept outgoing API calls
    bot.api.config.use((_prev, method, payload) => {
      const p = payload as Record<string, unknown>;
      if (method === "sendMessage") {
        return {
          ok: true,
          result: {
            message_id: 42,
            date: Math.floor(Date.now() / 1000),
            chat: { id: p["chat_id"], type: "private" },
            text: p["text"],
          },
        } as never;
      }
      if (method === "editMessageText") {
        return {
          ok: true,
          result: {
            message_id: p["message_id"],
            date: Math.floor(Date.now() / 1000),
            chat: { id: p["chat_id"], type: "private" },
            text: p["text"],
          },
        } as never;
      }
      return { ok: true, result: true } as never;
    });

    const update = makeMessageUpdate({
      text: "Is it true that Earth is flat?",
    });

    await bot.handleUpdate(update);

    expect(mockPipeline.investigate).toHaveBeenCalledTimes(1);
    const callArgs = mockPipeline.investigate.mock.calls[0]!;
    expect(callArgs[0]).toBe("Is it true that Earth is flat?");

    // Should pass platform-agnostic fields
    expect(capturedOptions).toBeDefined();
    expect(capturedOptions!["platform"]).toBe("telegram");
    expect(capturedOptions!["platformChatId"]).toBe("100");
    expect(capturedOptions!["platformMessageId"]).toBe("1");
  });

  it("should detect forwarded messages via forward_origin", async () => {
    const { TelegramAdapter } = await import(
      "../../../../src/platforms/telegram/adapter.js"
    );

    const mockPipeline = {
      investigate: vi.fn().mockResolvedValue({
        verdict: makeFinalVerdict(),
        investigationId: "inv-fwd-001",
        totalCostUsd: 0.25,
        durationMs: 5000,
      } satisfies InvestigateResult),
    } as unknown as InvestigationPipeline;

    const adapter = new TelegramAdapter(
      FAKE_TOKEN,
      mockPipeline,
      BASE_URL,
      fakeRepo,
    );

    const bot = adapter.getBot();
    bot.botInfo = fakeBotInfo;

    const apiCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use((_prev, method, payload) => {
      const p = payload as Record<string, unknown>;
      apiCalls.push({ method, payload: p });
      if (method === "sendMessage") {
        return {
          ok: true,
          result: {
            message_id: 42,
            date: Math.floor(Date.now() / 1000),
            chat: { id: p["chat_id"], type: "private" },
            text: p["text"],
          },
        } as never;
      }
      if (method === "editMessageText") {
        return {
          ok: true,
          result: {
            message_id: p["message_id"],
            date: Math.floor(Date.now() / 1000),
            chat: { id: p["chat_id"], type: "private" },
            text: p["text"],
          },
        } as never;
      }
      return { ok: true, result: true } as never;
    });

    const update = makeMessageUpdate({
      text: "PM Modi gives Rs 5000 to all citizens",
      forward_origin: {
        type: "user" as const,
        date: Math.floor(Date.now() / 1000),
        sender_user: { id: 200, is_bot: false, first_name: "Sender" },
      },
    });

    await bot.handleUpdate(update);

    // Pipeline should have been called
    expect(mockPipeline.investigate).toHaveBeenCalledTimes(1);
    const callArgs = mockPipeline.investigate.mock.calls[0]!;
    expect(callArgs[0]).toBe("PM Modi gives Rs 5000 to all citizens");
  });

  it("should handle /start command", async () => {
    const { TelegramAdapter } = await import(
      "../../../../src/platforms/telegram/adapter.js"
    );

    const mockPipeline = {
      investigate: vi.fn(),
    } as unknown as InvestigationPipeline;

    const adapter = new TelegramAdapter(
      FAKE_TOKEN,
      mockPipeline,
      BASE_URL,
      fakeRepo,
    );

    const bot = adapter.getBot();
    bot.botInfo = fakeBotInfo;

    const apiCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use((_prev, method, payload) => {
      const p = payload as Record<string, unknown>;
      apiCalls.push({ method, payload: p });
      if (method === "sendMessage") {
        return {
          ok: true,
          result: {
            message_id: 42,
            date: Math.floor(Date.now() / 1000),
            chat: { id: p["chat_id"], type: "private" },
            text: p["text"],
          },
        } as never;
      }
      return { ok: true, result: true } as never;
    });

    const update: Update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 100,
          type: "private" as const,
          first_name: "Test",
          last_name: "User",
        },
        from: {
          id: 100,
          is_bot: false,
          first_name: "Test",
          last_name: "User",
        },
        text: "/start",
        entities: [{ type: "bot_command", offset: 0, length: 6 }],
      },
    } as Update;

    await bot.handleUpdate(update);

    // Should have sent a welcome message (not called the pipeline)
    expect(mockPipeline.investigate).not.toHaveBeenCalled();

    const welcomeMsg = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).toLowerCase().includes("fact-check"),
    );
    expect(welcomeMsg).toBeDefined();
  });

  it("should handle /start command via registerHandlers", async () => {
    const { TelegramAdapter } = await import(
      "../../../../src/platforms/telegram/adapter.js"
    );

    const mockPipeline = {
      investigate: vi.fn(),
    } as unknown as InvestigationPipeline;

    const adapter = new TelegramAdapter(
      FAKE_TOKEN,
      mockPipeline,
      BASE_URL,
      fakeRepo,
      fakeFeedbackRepo,
    );

    const bot = adapter.getBot();
    bot.botInfo = fakeBotInfo;

    const apiCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];
    bot.api.config.use((_prev, method, payload) => {
      const p = payload as Record<string, unknown>;
      apiCalls.push({ method, payload: p });
      if (method === "sendMessage") {
        return {
          ok: true,
          result: {
            message_id: 42,
            date: Math.floor(Date.now() / 1000),
            chat: { id: p["chat_id"], type: "private" },
            text: p["text"],
          },
        } as never;
      }
      return { ok: true, result: true } as never;
    });

    // Test /bug command (too short)
    const bugUpdate: Update = {
      update_id: 1,
      message: {
        message_id: 1,
        date: Math.floor(Date.now() / 1000),
        chat: {
          id: 100,
          type: "private" as const,
          first_name: "Test",
          last_name: "User",
        },
        from: {
          id: 100,
          is_bot: false,
          first_name: "Test",
          last_name: "User",
        },
        text: "/bug short",
        entities: [{ type: "bot_command", offset: 0, length: 4 }],
      },
    } as Update;

    await bot.handleUpdate(bugUpdate);

    // Should have sent a message asking for more description
    const shortBugMsg = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).includes("at least 10 characters"),
    );
    expect(shortBugMsg).toBeDefined();
  });
});
