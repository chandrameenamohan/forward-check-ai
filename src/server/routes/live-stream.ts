import { Router } from "express";
import type { Request, Response } from "express";
import type { InvestigationRepository } from "../../db/investigation-repository.js";
import type { PipelineEventBus } from "../../orchestrator/pipeline-events.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

const KEEPALIVE_INTERVAL_MS = 15_000;

/**
 * Create SSE live-stream routes and live verdict page.
 * GET /live/:id — live verdict page (renders EJS template)
 * GET /api/live/:id/stream — SSE endpoint for real-time pipeline events
 */
export function createLiveStreamRouter(
  repo: InvestigationRepository,
  eventBus: PipelineEventBus,
  telegramBotUsername?: string,
): Router {
  const router = Router();

  // Live verdict page
  router.get("/live/:id", (req: Request, res: Response) => {
    const rawId = req.params["id"];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res.status(400).json({ error: "Missing investigation ID" });
      return;
    }

    const investigation = repo.getById(id);
    if (!investigation) {
      logger.info({ id }, "Live page: investigation not found");
      res.status(404).json({ error: "Investigation not found" });
      return;
    }

    // Redirect to static verdict page if already completed
    if (
      investigation.status === "completed" ||
      investigation.status === "completed_non_factual"
    ) {
      res.redirect(`/v/${id}`);
      return;
    }

    res.render("live", {
      id: investigation.id,
      originalMessage: investigation.original_message,
      status: investigation.status,
      sourceUrl: investigation.source_url,
      telegramBotUsername: telegramBotUsername ?? "forward_check_beta_bot",
    });
  });

  // SSE stream endpoint
  router.get("/api/live/:id/stream", (req: Request, res: Response) => {
    const rawId = req.params["id"];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res.status(400).json({ error: "Missing investigation ID" });
      return;
    }

    // Verify investigation exists
    const investigation = repo.getById(id);
    if (!investigation) {
      logger.info({ id }, "SSE stream: investigation not found");
      res.status(404).json({ error: "Investigation not found" });
      return;
    }

    // Set SSE headers
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    const flushResponse = () => {
      if (typeof (res as any).flush === "function") {
        (res as any).flush();
      }
    };

    // Flush historical events (catch-up for late-joining clients)
    const history = eventBus.getHistory(id);
    for (const event of history) {
      res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      flushResponse();
    }

    // Subscribe to new events
    const unsubscribe = eventBus.subscribe(id, (event) => {
      res.write(`event: ${event.kind}\ndata: ${JSON.stringify(event)}\n\n`);
      flushResponse();
    });

    // Keepalive comment every 15 seconds
    const keepaliveTimer = setInterval(() => {
      res.write(":\n\n");
      flushResponse();
    }, KEEPALIVE_INTERVAL_MS);

    // Clean up on client disconnect
    req.on("close", () => {
      logger.debug({ id }, "SSE client disconnected");
      unsubscribe();
      clearInterval(keepaliveTimer);
    });
  });

  return router;
}
