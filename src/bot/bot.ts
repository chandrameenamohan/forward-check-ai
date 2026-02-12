import { Bot } from "grammy";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Create and configure the Grammy Telegram bot.
 * Does NOT register message handlers — use createMessageHandler() to wire the pipeline.
 * Does NOT call bot.start() — that belongs in the entry point.
 */
export function createBot(token: string): Bot {
  const bot = new Bot(token);

  // Error handler
  bot.catch((err) => {
    logger.error({ err: err.error }, "Bot error");
  });

  return bot;
}
