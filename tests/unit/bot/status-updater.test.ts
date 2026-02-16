import { describe, it, expect, vi, beforeEach } from "vitest";
import { Bot } from "grammy";
import type { UserFromGetMe } from "grammy/types";
import { StatusUpdater, PIPELINE_STAGES, type PipelineStage } from "../../../src/bot/status-updater.js";

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

describe("StatusUpdater", () => {
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

  it("should define all pipeline stages", () => {
    const expectedStages: PipelineStage[] = [
      "planning",
      "searching",
      "analyzing",
      "challenging",
      "judging",
    ];

    for (const stage of expectedStages) {
      expect(PIPELINE_STAGES[stage]).toBeDefined();
      expect(typeof PIPELINE_STAGES[stage]).toBe("string");
      expect(PIPELINE_STAGES[stage].length).toBeGreaterThan(0);
    }
  });

  it("should format status message for each stage", () => {
    expect(PIPELINE_STAGES.planning).toMatch(/plan/i);
    expect(PIPELINE_STAGES.searching).toMatch(/search/i);
    expect(PIPELINE_STAGES.analyzing).toMatch(/analyz/i);
    expect(PIPELINE_STAGES.challenging).toMatch(/challeng/i);
    expect(PIPELINE_STAGES.judging).toMatch(/verdict/i);
  });

  it("should send initial investigating message", async () => {
    const updater = new StatusUpdater(bot.api, 100);

    await updater.sendInitial();

    expect(apiCalls.length).toBe(1);
    expect(apiCalls[0]!.method).toBe("sendMessage");
    expect(apiCalls[0]!.payload["chat_id"]).toBe(100);
    const text = apiCalls[0]!.payload["text"] as string;
    expect(text.toLowerCase()).toMatch(/investigat/);
  });

  it("should save the message id from sendInitial for later edits", async () => {
    const updater = new StatusUpdater(bot.api, 100);

    await updater.sendInitial();

    // Update should edit the initial message
    await updater.update("planning");

    expect(apiCalls.length).toBe(2);
    expect(apiCalls[1]!.method).toBe("editMessageText");
    expect(apiCalls[1]!.payload["message_id"]).toBe(42);
    expect(apiCalls[1]!.payload["chat_id"]).toBe(100);
  });

  it("should edit message with stage-appropriate text on update", async () => {
    const updater = new StatusUpdater(bot.api, 100);
    await updater.sendInitial();

    const stages: PipelineStage[] = [
      "planning",
      "searching",
      "analyzing",
      "challenging",
      "judging",
    ];

    for (const stage of stages) {
      await updater.update(stage);
      const lastCall = apiCalls[apiCalls.length - 1]!;
      expect(lastCall.method).toBe("editMessageText");
      const text = lastCall.payload["text"] as string;
      expect(text).toBe(PIPELINE_STAGES[stage]);
    }
  });

  it("should send verdict as a new message", async () => {
    const updater = new StatusUpdater(bot.api, 100);
    await updater.sendInitial();

    const verdictHtml = "<b>LIKELY FALSE</b>\nThis claim is not supported by evidence.";
    await updater.sendVerdict(verdictHtml);

    const verdictCall = apiCalls.find(
      (c) => c.method === "sendMessage" && c.payload["parse_mode"] === "HTML",
    );
    expect(verdictCall).toBeDefined();
    expect(verdictCall!.payload["text"]).toBe(verdictHtml);
    expect(verdictCall!.payload["chat_id"]).toBe(100);
  });

  it("should handle update errors gracefully", async () => {
    // Create a bot with a failing edit API
    const failBot = new Bot(FAKE_TOKEN);
    failBot.botInfo = fakeBotInfo;

    let callCount = 0;
    failBot.api.config.use((_prev, method, payload) => {
      callCount++;
      const p = payload as Record<string, unknown>;

      if (method === "sendMessage") {
        return {
          ok: true,
          result: {
            message_id: 99,
            date: Math.floor(Date.now() / 1000),
            chat: { id: p["chat_id"], type: "private" },
            text: p["text"],
          },
        } as never;
      }

      if (method === "editMessageText") {
        throw new Error("Telegram API rate limit");
      }

      return { ok: true, result: true } as never;
    });

    const updater = new StatusUpdater(failBot.api, 100);
    await updater.sendInitial();

    // Should not throw — error is handled gracefully
    await expect(updater.update("planning")).resolves.not.toThrow();
  });

  it("should handle sendVerdict errors gracefully", async () => {
    const failBot = new Bot(FAKE_TOKEN);
    failBot.botInfo = fakeBotInfo;

    failBot.api.config.use((_prev, method) => {
      if (method === "sendMessage") {
        throw new Error("Telegram API error");
      }
      return { ok: true, result: true } as never;
    });

    const updater = new StatusUpdater(failBot.api, 100);

    // Should not throw
    await expect(
      updater.sendVerdict("<b>Verdict</b>"),
    ).resolves.not.toThrow();
  });
});
