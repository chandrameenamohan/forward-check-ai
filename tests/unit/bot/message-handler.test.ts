import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import type { Update, UserFromGetMe } from "grammy/types";
import type { InvestigationPipeline, InvestigateResult } from "../../../src/orchestrator/pipeline.js";
import { createMessageHandler } from "../../../src/bot/message-handler.js";
import { makeFinalVerdict } from "../../fixtures/index.js";

const FAKE_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

const fakeBotInfo: UserFromGetMe = {
  id: 123456,
  is_bot: true,
  first_name: "ForwardCheckBot",
  username: "ForwardCheckBot",
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
      chat: { id: 100, type: "private" as const, first_name: "Test", last_name: "User" },
      from: { id: 100, is_bot: false, first_name: "Test", last_name: "User" },
      ...overrides,
    },
  } as Update;
}

function makeFakeVerdict(overrides?: Parameters<typeof makeFinalVerdict>[0]) {
  return makeFinalVerdict({
    category: "likely-false",
    confidence: 15,
    summary: "This claim is not supported by evidence.",
    reasoning: "No credible source confirms this.",
    ...overrides,
  });
}

const BASE_URL = "http://localhost:3000";

describe("createMessageHandler", () => {
  let bot: Bot;
  const apiCalls: Array<{ method: string; payload: Record<string, unknown> }> = [];

  beforeEach(() => {
    apiCalls.length = 0;
    bot = new Bot(FAKE_TOKEN);
    bot.botInfo = fakeBotInfo;

    // Intercept all outgoing API calls
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

  it("should extract text from forwarded message", async () => {
    const mockPipeline = {
      investigate: vi.fn().mockResolvedValue({
        verdict: makeFakeVerdict(),
        investigationId: "test-inv-123",
        totalCostUsd: 0.25,
        durationMs: 5000,
      } satisfies InvestigateResult),
    } as unknown as InvestigationPipeline;

    createMessageHandler(bot, mockPipeline, BASE_URL);

    const update = makeMessageUpdate({
      text: "PM Modi gives Rs 5000 to all citizens",
      forward_origin: {
        type: "user" as const,
        date: Math.floor(Date.now() / 1000),
        sender_user: { id: 200, is_bot: false, first_name: "Sender" },
      },
    });

    await bot.handleUpdate(update);

    // Pipeline should be called with the message text
    expect(mockPipeline.investigate).toHaveBeenCalledTimes(1);
    const callArgs = mockPipeline.investigate.mock.calls[0];
    expect(callArgs![0]).toBe("PM Modi gives Rs 5000 to all citizens");
  });

  it("should trigger pipeline for factual claims", async () => {
    const fakeVerdict = makeFakeVerdict();
    const mockPipeline = {
      investigate: vi.fn().mockResolvedValue({
        verdict: fakeVerdict,
        investigationId: "test-inv-456",
        totalCostUsd: 0.30,
        durationMs: 8000,
      } satisfies InvestigateResult),
    } as unknown as InvestigationPipeline;

    createMessageHandler(bot, mockPipeline, BASE_URL);

    const update = makeMessageUpdate({
      text: "Is it true that the Earth is flat?",
    });

    await bot.handleUpdate(update);

    // Pipeline should have been called
    expect(mockPipeline.investigate).toHaveBeenCalledTimes(1);

    // Should have sent the initial "Investigating..." message
    const initialSend = apiCalls.find(
      (c) => c.method === "sendMessage" && (c.payload["text"] as string).toLowerCase().includes("investigat"),
    );
    expect(initialSend).toBeDefined();

    // Should have sent the verdict message (with HTML parse mode)
    const verdictSend = apiCalls.find(
      (c) => c.method === "sendMessage" && c.payload["parse_mode"] === "HTML",
    );
    expect(verdictSend).toBeDefined();
  });

  it("should send error message on pipeline failure", async () => {
    const mockPipeline = {
      investigate: vi.fn().mockRejectedValue(new Error("Pipeline exploded")),
    } as unknown as InvestigationPipeline;

    createMessageHandler(bot, mockPipeline, BASE_URL);

    const update = makeMessageUpdate({
      text: "Some claim to check",
    });

    await bot.handleUpdate(update);

    // Should have sent an error message to the user
    const errorSend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).toLowerCase().includes("error"),
    );
    expect(errorSend).toBeDefined();
  });

  it("should include View Full Analysis button for HTTPS URLs", async () => {
    const httpsUrl = "https://forwardcheck.ai";
    const mockPipeline = {
      investigate: vi.fn().mockResolvedValue({
        verdict: makeFakeVerdict(),
        investigationId: "inv-abc-789",
        totalCostUsd: 0.50,
        durationMs: 10000,
      } satisfies InvestigateResult),
    } as unknown as InvestigationPipeline;

    createMessageHandler(bot, mockPipeline, httpsUrl);

    const update = makeMessageUpdate({
      text: "WHO declares green tea cures cancer",
    });

    await bot.handleUpdate(update);

    // Should send a message with inline keyboard containing "View Full Analysis" URL
    const verdictSend = apiCalls.find(
      (c) => c.method === "sendMessage" && c.payload["reply_markup"] !== undefined,
    );
    expect(verdictSend).toBeDefined();

    const markup = verdictSend!.payload["reply_markup"] as {
      inline_keyboard: Array<Array<{ text: string; url: string }>>;
    };
    expect(markup.inline_keyboard).toBeDefined();

    const buttons = markup.inline_keyboard.flat();
    const analysisButton = buttons.find((b) => b.text.includes("Full Analysis"));
    expect(analysisButton).toBeDefined();
    expect(analysisButton!.url).toBe(`${httpsUrl}/v/inv-abc-789`);
  });

  it("should include analysis URL as plain text for non-HTTPS URLs", async () => {
    const mockPipeline = {
      investigate: vi.fn().mockResolvedValue({
        verdict: makeFakeVerdict(),
        investigationId: "inv-abc-789",
        totalCostUsd: 0.50,
        durationMs: 10000,
      } satisfies InvestigateResult),
    } as unknown as InvestigationPipeline;

    createMessageHandler(bot, mockPipeline, BASE_URL);

    const update = makeMessageUpdate({
      text: "WHO declares green tea cures cancer",
    });

    await bot.handleUpdate(update);

    // Should send verdict without inline keyboard (no reply_markup)
    const verdictSend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).includes("Full analysis") &&
        c.payload["reply_markup"] === undefined,
    );
    expect(verdictSend).toBeDefined();
    expect(verdictSend!.payload["text"]).toContain(`${BASE_URL}/v/inv-abc-789`);
  });

  it("should handle non-factual pipeline result", async () => {
    const mockPipeline = {
      investigate: vi.fn().mockResolvedValue({
        verdict: null,
        investigationId: "inv-nonfact-001",
        nonFactualResponse: "This looks like a greeting! I fact-check claims.",
        totalCostUsd: 0.01,
        durationMs: 500,
      } satisfies InvestigateResult),
    } as unknown as InvestigationPipeline;

    createMessageHandler(bot, mockPipeline, BASE_URL);

    const update = makeMessageUpdate({
      text: "Hello bot!",
    });

    await bot.handleUpdate(update);

    // Should send the non-factual response text (not a verdict)
    const responseSend = apiCalls.find(
      (c) =>
        c.method === "sendMessage" &&
        (c.payload["text"] as string).includes("greeting"),
    );
    expect(responseSend).toBeDefined();

    // Should NOT have a reply_markup (no "View Full Analysis" for non-factual)
    expect(responseSend!.payload["reply_markup"]).toBeUndefined();
  });

  it("should pass status update callback to pipeline", async () => {
    let capturedCallback: ((stage: string) => void) | undefined;

    const mockPipeline = {
      investigate: vi.fn().mockImplementation((_msg, options) => {
        capturedCallback = options?.onStatusUpdate;
        return Promise.resolve({
          verdict: makeFakeVerdict(),
          investigationId: "test-inv-cb",
          totalCostUsd: 0.10,
          durationMs: 3000,
        } satisfies InvestigateResult);
      }),
    } as unknown as InvestigationPipeline;

    createMessageHandler(bot, mockPipeline, BASE_URL);

    const update = makeMessageUpdate({
      text: "Some factual claim to check",
    });

    await bot.handleUpdate(update);

    // The pipeline should have received an onStatusUpdate callback
    expect(capturedCallback).toBeDefined();
  });
});
