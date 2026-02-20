import { describe, it, expect, beforeEach } from "vitest";
import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { makeFinalVerdict } from "../../../fixtures/index.js";

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

describe("TelegramResponder", () => {
  let bot: Bot;
  const apiCalls: Array<{ method: string; payload: Record<string, unknown> }> =
    [];

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

  it("sendText should call api.sendMessage with numeric chatId", async () => {
    const { TelegramResponder } = await import(
      "../../../../src/platforms/telegram/responder.js"
    );
    const responder = new TelegramResponder(bot.api);

    await responder.sendText("12345", "Hello from test");

    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]!.method).toBe("sendMessage");
    expect(apiCalls[0]!.payload["chat_id"]).toBe(12345);
    expect(apiCalls[0]!.payload["text"]).toBe("Hello from test");
  });

  it("sendVerdict should format with Telegram HTML and include InlineKeyboard", async () => {
    const { TelegramResponder } = await import(
      "../../../../src/platforms/telegram/responder.js"
    );
    const responder = new TelegramResponder(bot.api);

    const verdict = makeFinalVerdict({ category: "likely-false", confidence: 15 });
    const analysisUrl = "https://example.com/v/abc123";

    await responder.sendVerdict("99999", verdict, analysisUrl);

    expect(apiCalls.length).toBeGreaterThanOrEqual(1);

    // Find the verdict message (HTML parse mode)
    const verdictCall = apiCalls.find(
      (c) => c.method === "sendMessage" && c.payload["parse_mode"] === "HTML",
    );
    expect(verdictCall).toBeDefined();
    expect(verdictCall!.payload["chat_id"]).toBe(99999);

    // Should contain formatted verdict text
    const text = verdictCall!.payload["text"] as string;
    expect(text).toContain("LIKELY FALSE");

    // Should include InlineKeyboard with analysis URL
    const replyMarkup = verdictCall!.payload["reply_markup"] as
      | Record<string, unknown>
      | undefined;
    expect(replyMarkup).toBeDefined();
    const keyboard = replyMarkup!["inline_keyboard"] as Array<
      Array<{ text: string; url: string }>
    >;
    expect(keyboard).toBeDefined();
    expect(keyboard[0]![0]!.text).toBe("View Full Analysis");
    expect(keyboard[0]![0]!.url).toBe(analysisUrl);
  });

  it("sendInitial should store message ID for later edits", async () => {
    const { TelegramResponder } = await import(
      "../../../../src/platforms/telegram/responder.js"
    );
    const responder = new TelegramResponder(bot.api);

    await responder.sendInitial("77777");

    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]!.method).toBe("sendMessage");
    expect(apiCalls[0]!.payload["chat_id"]).toBe(77777);
    const text = apiCalls[0]!.payload["text"] as string;
    expect(text.toLowerCase()).toContain("investigat");

    // Now send a status update — should edit the stored message
    await responder.sendStatusUpdate("77777", "planning");

    expect(apiCalls).toHaveLength(2);
    expect(apiCalls[1]!.method).toBe("editMessageText");
    expect(apiCalls[1]!.payload["message_id"]).toBe(42);
    expect(apiCalls[1]!.payload["chat_id"]).toBe(77777);
  });

  it("sendStatusUpdate should edit the stored message", async () => {
    const { TelegramResponder } = await import(
      "../../../../src/platforms/telegram/responder.js"
    );
    const responder = new TelegramResponder(bot.api);

    await responder.sendInitial("55555");

    await responder.sendStatusUpdate("55555", "searching");

    const editCall = apiCalls.find((c) => c.method === "editMessageText");
    expect(editCall).toBeDefined();
    expect(editCall!.payload["chat_id"]).toBe(55555);
    const text = editCall!.payload["text"] as string;
    expect(text).toMatch(/search/i);
  });

  it("should handle API errors gracefully without throwing", async () => {
    const failBot = new Bot(FAKE_TOKEN);
    failBot.botInfo = fakeBotInfo;

    failBot.api.config.use((_prev, method) => {
      if (method === "sendMessage") {
        throw new Error("Telegram API rate limit");
      }
      if (method === "editMessageText") {
        throw new Error("Telegram API error");
      }
      return { ok: true, result: true } as never;
    });

    const { TelegramResponder } = await import(
      "../../../../src/platforms/telegram/responder.js"
    );
    const responder = new TelegramResponder(failBot.api);

    // None of these should throw
    await expect(responder.sendText("123", "test")).resolves.not.toThrow();
    await expect(responder.sendInitial("123")).resolves.not.toThrow();
    await expect(
      responder.sendStatusUpdate("123", "planning"),
    ).resolves.not.toThrow();
    await expect(
      responder.sendVerdict("123", makeFinalVerdict(), "https://example.com"),
    ).resolves.not.toThrow();
    await expect(
      responder.sendLink("123", "Click here", "https://example.com"),
    ).resolves.not.toThrow();
  });

  it("sendLink should send text with InlineKeyboard URL button", async () => {
    const { TelegramResponder } = await import(
      "../../../../src/platforms/telegram/responder.js"
    );
    const responder = new TelegramResponder(bot.api);

    await responder.sendLink(
      "88888",
      "Watch Live Investigation",
      "https://example.com/live/abc",
    );

    expect(apiCalls).toHaveLength(1);
    expect(apiCalls[0]!.method).toBe("sendMessage");
    expect(apiCalls[0]!.payload["chat_id"]).toBe(88888);

    const replyMarkup = apiCalls[0]!.payload["reply_markup"] as
      | Record<string, unknown>
      | undefined;
    expect(replyMarkup).toBeDefined();
    const keyboard = replyMarkup!["inline_keyboard"] as Array<
      Array<{ text: string; url: string }>
    >;
    expect(keyboard[0]![0]!.text).toBe("Watch Live Investigation");
    expect(keyboard[0]![0]!.url).toBe("https://example.com/live/abc");
  });

  it("sendVerdict should fall back to plain text link for non-HTTPS URLs", async () => {
    const { TelegramResponder } = await import(
      "../../../../src/platforms/telegram/responder.js"
    );
    const responder = new TelegramResponder(bot.api);

    const verdict = makeFinalVerdict({ category: "likely-true", confidence: 90 });
    const analysisUrl = "http://localhost:3000/v/abc123";

    await responder.sendVerdict("11111", verdict, analysisUrl);

    // Should send verdict text with appended URL (no InlineKeyboard)
    const verdictCall = apiCalls.find(
      (c) => c.method === "sendMessage" && c.payload["parse_mode"] === "HTML",
    );
    expect(verdictCall).toBeDefined();
    const text = verdictCall!.payload["text"] as string;
    expect(text).toContain(analysisUrl);

    // No inline keyboard for non-HTTPS
    const replyMarkup = verdictCall!.payload["reply_markup"];
    expect(replyMarkup).toBeUndefined();
  });
});
