import { Bot, type Context } from "grammy";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Create and configure the Grammy Telegram bot.
 * Sets up handlers for forwarded messages and direct text messages.
 * Does NOT call bot.start() — that belongs in the entry point.
 */
export function createBot(token: string): Bot {
  const bot = new Bot(token);

  // Handle all text messages (both forwarded and direct)
  bot.on("message:text", async (ctx: Context) => {
    const message = ctx.message;
    if (!message) return;

    const text = message.text;
    if (!text) return;

    const isForwarded = message.forward_origin !== undefined;

    if (isForwarded) {
      logger.info(
        { chatId: message.chat.id, originType: message.forward_origin?.type },
        "Received forwarded message",
      );
    } else {
      logger.info(
        { chatId: message.chat.id },
        "Received direct text message",
      );
    }

    await ctx.reply(
      "🔍 Investigating your claim... This may take up to 60 seconds.",
    );
  });

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error }, "Bot error");
  });

  return bot;
}
