import express from "express";
import type { Request, Response, NextFunction } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../config/logger.js";
import type { InvestigationRepository } from "../db/investigation-repository.js";
import { createInvestigateRouter } from "./routes/investigate.js";
import { createVerdictRouter } from "./routes/verdict.js";
import { createLiveStreamRouter } from "./routes/live-stream.js";
import { createChatRouter } from "./routes/chat.js";
import { createFeedbackRouter } from "./routes/feedback.js";
import type { PipelineEventBus } from "../orchestrator/pipeline-events.js";
import type { InvestigationPipeline } from "../orchestrator/pipeline.js";
import type { FeedbackRepository } from "../db/feedback-repository.js";
import type { GitHubIssueService } from "../services/github-issues.js";
import { createRateLimiter } from "./middleware/rate-limit.js";

const logger = createLogger({ level: "info" });

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure the Express application.
 * Does NOT call app.listen() — that belongs in the entry point.
 *
 * @param repo - Optional InvestigationRepository for API routes.
 *               When provided, mounts /api/investigate and /api/investigation/:id routes.
 * @param eventBus - Optional PipelineEventBus for SSE live-stream routes.
 *                   When provided with repo, mounts /api/live/:id/stream route.
 */
export function createApp(repo?: InvestigationRepository, eventBus?: PipelineEventBus, pipeline?: InvestigationPipeline, feedbackRepo?: FeedbackRepository, githubService?: GitHubIssueService): express.Express {
  const app = express();

  // JSON body parsing
  app.use(express.json());

  // EJS view engine
  app.set("view engine", "ejs");
  app.set("views", join(__dirname, "views"));

  // Serve static files from /public directory under /static path
  app.use("/static", express.static(join(__dirname, "..", "..", "public")));

  // Landing page
  app.get("/", (_req: Request, res: Response) => {
    let recentInvestigationId: string | null = null;
    if (repo) {
      try {
        const recent = repo.getRecent(1);
        if (recent.length > 0) {
          recentInvestigationId = recent[0]!.id;
        }
      } catch {
        // DB query failed — fall back to no recent investigation
      }
    }
    res.render("landing", { recentInvestigationId });
  });

  // Health endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // Chat page
  app.get("/chat", (_req: Request, res: Response) => {
    res.render("chat");
  });

  // Investigation API routes (only when repo is provided)
  if (repo) {
    app.use(createInvestigateRouter(repo));
    app.use(createVerdictRouter(repo));

    // SSE live-stream route (requires both repo and event bus)
    if (eventBus) {
      app.use(createLiveStreamRouter(repo, eventBus));
    }

    // Chat API route (requires both repo and pipeline)
    if (pipeline) {
      const chatRateLimiter = createRateLimiter(10, 60_000);
      app.use("/api/chat/message", chatRateLimiter);
      app.use(createChatRouter(repo, pipeline));
    }
  }

  // Dev-only: trigger pipeline from HTTP (no Telegram needed)
  if (pipeline && process.env["NODE_ENV"] !== "production") {
    app.post("/api/dev/trigger", (req: Request, res: Response) => {
      const { message } = req.body as { message?: string };
      if (!message) {
        res.status(400).json({ error: "message is required" });
        return;
      }
      let idResolve: (id: string) => void;
      const idPromise = new Promise<string>((resolve) => { idResolve = resolve; });

      pipeline.investigate(message, {
        onInvestigationCreated: (id) => { idResolve(id); },
      }).then((result) => {
        logger.info({ id: result.investigationId, verdict: result.verdict?.category }, "Dev trigger completed");
      }).catch((err: unknown) => {
        logger.error({ err }, "Dev trigger failed");
      });

      idPromise.then((id) => {
        res.json({ id, liveUrl: `/live/${id}`, streamUrl: `/api/live/${id}/stream` });
      });
    });
  }

  // Feedback routes (optional — works without InvestigationRepository)
  if (feedbackRepo) {
    const feedbackRateLimiter = createRateLimiter(5, 900_000);
    app.use("/api/feedback", feedbackRateLimiter);
    app.use(createFeedbackRouter(feedbackRepo, githubService));
  }

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
