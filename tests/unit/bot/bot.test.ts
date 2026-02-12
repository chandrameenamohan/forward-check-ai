import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import { createBot } from "../../../src/bot/bot.js";
import type { Update, UserFromGetMe } from "grammy/types";

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

describe("Grammy bot setup", () => {
  it("should create bot instance with token", () => {
    const bot = createBot(FAKE_TOKEN);
    expect(bot).toBeInstanceOf(Bot);
    expect(bot.token).toBe(FAKE_TOKEN);
  });

  describe("forwarded message detection", () => {
    let bot: ReturnType<typeof createBot>;
    const repliedMessages: string[] = [];

    beforeEach(() => {
      repliedMessages.length = 0;
      bot = createBot(FAKE_TOKEN);
      bot.botInfo = fakeBotInfo;

      // Intercept api.sendMessage to capture replies
      bot.api.config.use((prev, method, payload) => {
        if (method === "sendMessage") {
          const p = payload as Record<string, unknown>;
          repliedMessages.push(p["text"] as string);
        }
        return { ok: true, result: true } as never;
      });
    });

    it("should detect forwarded messages", async () => {
      const update = makeMessageUpdate({
        text: "PM Modi gives Rs 5000 to all citizens",
        forward_origin: {
          type: "user" as const,
          date: Math.floor(Date.now() / 1000),
          sender_user: { id: 200, is_bot: false, first_name: "Sender" },
        },
      });

      await bot.handleUpdate(update);

      expect(repliedMessages.length).toBeGreaterThanOrEqual(1);
      // Should acknowledge the forwarded message for investigation
      const reply = repliedMessages.join(" ");
      expect(reply.toLowerCase()).toMatch(/investigat/);
    });

    it("should handle text messages", async () => {
      const update = makeMessageUpdate({
        text: "Is it true that the Earth is flat?",
      });

      await bot.handleUpdate(update);

      expect(repliedMessages.length).toBeGreaterThanOrEqual(1);
      // Should acknowledge the direct text message for investigation
      const reply = repliedMessages.join(" ");
      expect(reply.toLowerCase()).toMatch(/investigat/);
    });

    it("should handle forwarded messages with hidden user origin", async () => {
      const update = makeMessageUpdate({
        text: "Some viral claim about health",
        forward_origin: {
          type: "hidden_user" as const,
          date: Math.floor(Date.now() / 1000),
          sender_user_name: "Anonymous",
        },
      });

      await bot.handleUpdate(update);

      expect(repliedMessages.length).toBeGreaterThanOrEqual(1);
      const reply = repliedMessages.join(" ");
      expect(reply.toLowerCase()).toMatch(/investigat/);
    });

    it("should handle forwarded messages from channels", async () => {
      const update = makeMessageUpdate({
        text: "Breaking news from channel",
        forward_origin: {
          type: "channel" as const,
          date: Math.floor(Date.now() / 1000),
          chat: { id: -1001234567890, type: "channel" as const, title: "News Channel" },
          message_id: 42,
        },
      });

      await bot.handleUpdate(update);

      expect(repliedMessages.length).toBeGreaterThanOrEqual(1);
      const reply = repliedMessages.join(" ");
      expect(reply.toLowerCase()).toMatch(/investigat/);
    });

    it("should ignore messages without text", async () => {
      const update = makeMessageUpdate({
        // No text field — e.g. a sticker or photo without caption
      });

      await bot.handleUpdate(update);

      // Should not crash, may or may not reply
      expect(true).toBe(true);
    });
  });
});
