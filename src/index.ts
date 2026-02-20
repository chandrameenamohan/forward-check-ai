import { loadEnv } from "./config/env.js";
import { createLogger } from "./config/logger.js";
import { createDatabase } from "./db/connection.js";
import { runMigrations } from "./db/migrations.js";
import { InvestigationRepository } from "./db/investigation-repository.js";
import { FeedbackRepository } from "./db/feedback-repository.js";
import { ClaudeClient } from "./services/claude-client.js";
import { GitHubIssueService } from "./services/github-issues.js";
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
import { PipelineEventBus } from "./orchestrator/pipeline-events.js";
import { createApp } from "./server/app.js";
import { TelegramAdapter } from "./platforms/telegram/adapter.js";
import { WhatsAppAdapter } from "./platforms/whatsapp/adapter.js";
import { createMessageRouter } from "./platforms/message-router.js";
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

// 4b. Create feedback repository
const feedbackRepo = new FeedbackRepository(db);

// 4c. Conditionally create GitHub issue service
let githubService: GitHubIssueService | undefined;
if (config.GITHUB_TOKEN) {
  githubService = new GitHubIssueService({
    token: config.GITHUB_TOKEN,
    owner: config.GITHUB_REPO_OWNER,
    repo: config.GITHUB_REPO_NAME,
  });
  logger.info("GitHub issue service initialized");
} else {
  logger.warn("GITHUB_TOKEN not set — feedback will be saved locally only");
}

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

// 7. Create pipeline event bus for real-time SSE streaming
const eventBus = new PipelineEventBus();

// 8. Create investigation pipeline (with event bus for live streaming)
const pipeline = new InvestigationPipeline(client, toolRegistry, repo, undefined, eventBus);

// 9. Resolve base URL
const railwayPublicDomain = process.env["RAILWAY_PUBLIC_DOMAIN"];
const baseUrl = config.BASE_URL
  ?? (railwayPublicDomain
    ? `https://${railwayPublicDomain}`
    : `http://localhost:${config.PORT}`);
logger.info({ baseUrl }, "Base URL resolved");

// 10. Create shared message router for all platform adapters
const messageRouter = createMessageRouter(pipeline, repo, baseUrl);

// 11. Create Telegram adapter
const telegramAdapter = new TelegramAdapter(
  config.TELEGRAM_BOT_TOKEN,
  pipeline,
  baseUrl,
  repo,
  feedbackRepo,
  githubService,
);

// 12. Conditionally create WhatsApp adapter
let whatsAppAdapter: WhatsAppAdapter | undefined;
if (
  config.WHATSAPP_ENABLED &&
  config.WHATSAPP_PHONE_NUMBER_ID &&
  config.WHATSAPP_ACCESS_TOKEN &&
  config.WHATSAPP_VERIFY_TOKEN
) {
  whatsAppAdapter = new WhatsAppAdapter(
    config.WHATSAPP_PHONE_NUMBER_ID,
    config.WHATSAPP_ACCESS_TOKEN,
    config.WHATSAPP_VERIFY_TOKEN,
    config.WHATSAPP_APP_SECRET,
    messageRouter,
  );
  logger.info("WhatsApp adapter initialized");
} else if (config.WHATSAPP_ENABLED) {
  logger.warn(
    "WHATSAPP_ENABLED is true but required credentials are missing (WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN). WhatsApp adapter not started.",
  );
}

// 13. Create Express app with routes (with event bus for SSE endpoint)
const app = createApp(repo, eventBus, pipeline, feedbackRepo, githubService, config.TELEGRAM_BOT_USERNAME, whatsAppAdapter);

// 14. Start Express server
let server: Server;
server = app.listen(config.PORT, () => {
  logger.info(
    { port: config.PORT, env: config.NODE_ENV },
    "Express server started",
  );
});

// 15. Start Telegram adapter (long polling with retry on 409 conflict)
telegramAdapter.start().catch((err: unknown) => {
  logger.error({ err }, "Telegram adapter failed to start");
});

// 16. Start WhatsApp adapter (no-op for webhook-based, but logs readiness)
if (whatsAppAdapter) {
  whatsAppAdapter.start().catch((err: unknown) => {
    logger.error({ err }, "WhatsApp adapter failed to start");
  });
}

// 17. Graceful shutdown
function shutdown(signal: string): void {
  logger.info({ signal }, "Received shutdown signal");

  telegramAdapter.stop().catch((err: unknown) => {
    logger.error({ err }, "Telegram adapter failed to stop");
  });
  logger.info("Telegram adapter stopped");

  if (whatsAppAdapter) {
    whatsAppAdapter.stop().catch((err: unknown) => {
      logger.error({ err }, "WhatsApp adapter failed to stop");
    });
    logger.info("WhatsApp adapter stopped");
  }

  server.close(() => {
    logger.info("Express server stopped");
    eventBus.destroy();
    logger.info("Pipeline event bus destroyed");
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
