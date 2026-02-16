import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import type { InvestigationPipeline, InvestigateResult } from "../../../src/orchestrator/pipeline.js";
import { createMessageHandler } from "../../../src/bot/message-handler.js";
import { makeFinalVerdict } from "../../fixtures/index.js";
import type { FeedbackRepository } from "../../../src/db/feedback-repository.js";
import type { GitHubIssueService, CreateIssueResult } from "../../../src/services/github-issues.js";

const FAKE_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

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

const BASE_URL = "http://localhost:3000";

function makeCommandUpdate(command: string, text: string): Update {
  return {
    update_id: 1,
    message: {
      message_id: 1,
      date: Math.floor(Date.now() / 1000),
      chat: { id: 100, type: "private" as const, first_name: "Test", last_name: "User" },
      from: { id: 200, is_bot: false, first_name: "TestUser", last_name: "Smith", username: "testuser123" },
      text: `/${command} ${text}`.trim(),
      entities: [
        {
          type: "bot_command" as const,
          offset: 0,
          length: command.length + 1,
        },
      ],
    },
  } as Update;
}

function createMockPipeline(): InvestigationPipeline {
  return {
    investigate: vi.fn().mockResolvedValue({
      verdict: makeFinalVerdict(),
      investigationId: "test-inv",
      totalCostUsd: 0.25,
      durationMs: 5000,
    } satisfies InvestigateResult),
  } as unknown as InvestigationPipeline;
}

function createMockFeedbackRepo(): FeedbackRepository {
  return {
    create: vi.fn().mockReturnValue("feedback-id-123"),
    updateGitHubIssue: vi.fn(),
    getById: vi.fn(),
    getRecent: vi.fn(),
  } as unknown as FeedbackRepository;
}

function createMockGitHubService(result?: CreateIssueResult): GitHubIssueService {
  return {
    createIssue: vi.fn().mockResolvedValue(
      result ?? {
        success: true,
        issueUrl: "https://github.com/test/repo/issues/99",
        issueNumber: 99,
      },
    ),
  } as unknown as GitHubIssueService;
}

describe("Telegram feedback commands", () => {
  let bot: Bot;
  const apiCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];

  beforeEach(() => {
    apiCalls.length = 0;
    bot = new Bot(FAKE_TOKEN);
    bot.botInfo = fakeBotInfo;

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
  });

  it("/bug with valid description should create feedback and reply with issue URL", async () => {
    const feedbackRepo = createMockFeedbackRepo();
    const githubService = createMockGitHubService();
    const pipeline = createMockPipeline();

    createMessageHandler(bot, pipeline, BASE_URL, feedbackRepo, githubService);

    const update = makeCommandUpdate("bug", "The bot crashes when I send an image with text overlay and it produces no output");
    await bot.handleUpdate(update);

    // Should create feedback via the repository
    expect(feedbackRepo.create).toHaveBeenCalledTimes(1);
    const createArgs = (feedbackRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(createArgs["type"]).toBe("bug");
    expect(createArgs["sourceChannel"]).toBe("telegram");
    expect(createArgs["telegramUsername"]).toBe("testuser123");
    expect(createArgs["telegramUserId"]).toBe("200");

    // Should create GitHub issue
    expect(githubService.createIssue).toHaveBeenCalledTimes(1);

    // Should update feedback with GitHub issue info
    expect(feedbackRepo.updateGitHubIssue).toHaveBeenCalledWith(
      "feedback-id-123",
      "https://github.com/test/repo/issues/99",
      99,
    );

    // Should reply with confirmation including issue URL
    const replySend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).includes("github.com"),
    );
    expect(replySend).toBeDefined();
  });

  it("/bug with short description should reply with error message", async () => {
    const feedbackRepo = createMockFeedbackRepo();
    const githubService = createMockGitHubService();
    const pipeline = createMockPipeline();

    createMessageHandler(bot, pipeline, BASE_URL, feedbackRepo, githubService);

    const update = makeCommandUpdate("bug", "short");
    await bot.handleUpdate(update);

    // Should NOT create feedback
    expect(feedbackRepo.create).not.toHaveBeenCalled();

    // Should reply with an error/usage hint
    const replySend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).toLowerCase().includes("10"),
    );
    expect(replySend).toBeDefined();
  });

  it("/bug without description should reply with usage hint", async () => {
    const feedbackRepo = createMockFeedbackRepo();
    const githubService = createMockGitHubService();
    const pipeline = createMockPipeline();

    createMessageHandler(bot, pipeline, BASE_URL, feedbackRepo, githubService);

    const update = makeCommandUpdate("bug", "");
    await bot.handleUpdate(update);

    // Should NOT create feedback
    expect(feedbackRepo.create).not.toHaveBeenCalled();

    // Should reply with usage hint
    const replySend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        ((c.payload["text"] as string).includes("/bug") ||
         (c.payload["text"] as string).toLowerCase().includes("usage")),
    );
    expect(replySend).toBeDefined();
  });

  it("/feedback with valid description should create feedback", async () => {
    const feedbackRepo = createMockFeedbackRepo();
    const githubService = createMockGitHubService();
    const pipeline = createMockPipeline();

    createMessageHandler(bot, pipeline, BASE_URL, feedbackRepo, githubService);

    const update = makeCommandUpdate("feedback", "The verdict page looks great but I wish it showed more source details");
    await bot.handleUpdate(update);

    // Should create feedback via the repository with type "feedback"
    expect(feedbackRepo.create).toHaveBeenCalledTimes(1);
    const createArgs = (feedbackRepo.create as ReturnType<typeof vi.fn>).mock.calls[0]![0] as Record<string, unknown>;
    expect(createArgs["type"]).toBe("feedback");
    expect(createArgs["sourceChannel"]).toBe("telegram");

    // Should reply with confirmation
    const replySend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        ((c.payload["text"] as string).toLowerCase().includes("thank") ||
         (c.payload["text"] as string).toLowerCase().includes("received") ||
         (c.payload["text"] as string).toLowerCase().includes("submitted")),
    );
    expect(replySend).toBeDefined();
  });

  it("/bug should work without GitHub service (local-only)", async () => {
    const feedbackRepo = createMockFeedbackRepo();
    const pipeline = createMockPipeline();

    // No GitHub service passed
    createMessageHandler(bot, pipeline, BASE_URL, feedbackRepo, undefined);

    const update = makeCommandUpdate("bug", "The bot crashes when processing large messages with many URLs included");
    await bot.handleUpdate(update);

    // Should still create feedback
    expect(feedbackRepo.create).toHaveBeenCalledTimes(1);

    // Should NOT try to update GitHub issue
    expect(feedbackRepo.updateGitHubIssue).not.toHaveBeenCalled();

    // Should reply with confirmation (without GitHub URL)
    const replySend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).toLowerCase().includes("saved"),
    );
    expect(replySend).toBeDefined();
  });
});
