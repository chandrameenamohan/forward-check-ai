import { loadEnv } from "./config/env.js";
import { createLogger } from "./config/logger.js";
import { createDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrations.js";
import { InvestigationRepository } from "./db/investigation-repository.js";
import { ClaudeClient } from "./services/claude-client.js";
import { ToolRegistry } from "./tools/tool-registry.js";
import {
  braveWebSearch,
  braveSearchToolDefinition,
} from "./tools/brave-search.js";
import {
  googleFactCheckSearch,
  googleFactCheckToolDefinition,
} from "./tools/google-factcheck.js";
import { InvestigationPipeline } from "./orchestrator/pipeline.js";
import { createApp } from "./server/app.js";
import { createBot } from "./bot/bot.js";
import { createMessageHandler } from "./bot/message-handler.js";
import type { Server } from "node:http";

// 1. Load and validate environment config
const config = loadEnv();

// 2. Initialize logger
const logger = createLogger({
  level: config.LOG_LEVEL,
  pretty: config.NODE_ENV === "development",
});

// 3. Create SQLite database and run migrations
const db = createDatabase(config.DATABASE_PATH);
runMigrations(db);
logger.info({ path: config.DATABASE_PATH }, "Database initialized");

// 4. Create investigation repository
const repo = new InvestigationRepository(db);

// 5. Create Claude client
const client = new ClaudeClient(config.ANTHROPIC_API_KEY);

// 6. Create tool registry and register search tools
const toolRegistry = new ToolRegistry();

toolRegistry.register(
  "brave_web_search",
  async (input) => {
    const { query, count } = input as { query: string; count?: number };
    const result = await braveWebSearch(
      query,
      count,
      config.BRAVE_SEARCH_API_KEY ?? "",
    );
    return JSON.stringify(result);
  },
  braveSearchToolDefinition,
);

toolRegistry.register(
  "google_fact_check_search",
  async (input) => {
    const { query } = input as { query: string };
    const result = await googleFactCheckSearch(
      query,
      config.GOOGLE_FACTCHECK_API_KEY ?? "",
    );
    return JSON.stringify(result);
  },
  googleFactCheckToolDefinition,
);

// 7. Create investigation pipeline
const pipeline = new InvestigationPipeline(client, toolRegistry, repo);

// 8. Create Express app with routes
const app = createApp(repo);

// 9. Create Telegram bot and wire message handler
const bot = createBot(config.TELEGRAM_BOT_TOKEN);
const baseUrl = config.NODE_ENV === "production"
  ? `https://forwardcheck.ai`
  : `http://localhost:${config.PORT}`;
createMessageHandler(bot, pipeline, baseUrl);

// 10. Start Express server
let server: Server;
server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    "Express server started",
  );
});

// 11. Start bot long polling
bot.start({
  onStart: (botInfo) => {
    logger.info(
      { username: botInfo.username, id: botInfo.id },
      "Telegram bot started",
    );
  },
});

// 12. Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ signal }, "Received shutdown signal");

  bot.stop();
  logger.info("Telegram bot stopped");

  server.close(() => {
    logger.info("Express server stopped");
    db.close();
    logger.info("Database connection closed");
    process.exit(0);
  });
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

logger.info(
  {
    port: config.PORT,
    database: config.DATABASE_PATH,
    env: config.NODE_ENV,
  },
  "ForwardCheck-AI is running",
);
