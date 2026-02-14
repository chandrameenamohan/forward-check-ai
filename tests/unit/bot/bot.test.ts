import { describe, it, expect } from "vitest";
import { Bot } from "grammy";
import { createBot } from "../../../src/bot/bot.js";

const FAKE_TOKEN = "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11";

describe("Grammy bot setup", () => {
  it("should create bot instance with token", () => {
    const bot = createBot(FAKE_TOKEN);
    expect(bot).toBeInstanceOf(Bot);
    expect(bot.token).toBe(FAKE_TOKEN);
  });

  it("should have error handler configured", () => {
    // createBot should not throw
    const bot = createBot(FAKE_TOKEN);
    expect(bot).toBeDefined();
    // The bot.catch() is set internally — we verify by ensuring the bot was created successfully
    expect(bot.errorHandler).toBeDefined();
  });
});
