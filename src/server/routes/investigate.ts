import { Router } from "express";
import type { Request, Response } from "express";
import type { InvestigationRepository } from "../../db/investigation-repository.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Create investigation API routes.
 * POST /api/investigate — create a new investigation
 * GET /api/investigation/:id — get investigation status/result
 */
export function createInvestigateRouter(
  repo: InvestigationRepository,
): Router {
  const router = Router();

  router.post("/api/investigate", (req: Request, res: Response) => {
    const { message, chatId } = req.body as {
      message?: string;
      chatId?: string;
    };

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      res.status(400).json({ error: "message is required and must be a non-empty string" });
      return;
    }

    const id = repo.create(message, chatId);
    logger.info({ id, messageLength: message.length }, "Investigation created");

    res.status(201).json({ id, status: "pending" });
  });

  router.get("/api/investigation/:id", (req: Request, res: Response) => {
    const { id } = req.params as { id: string };

    const investigation = repo.getById(id);
    if (!investigation) {
      res.status(404).json({ error: "Investigation not found" });
      return;
    }

    // Reshape: expose final_verdict as both "verdict" and "final_verdict"
    // so consumers can use the intuitive name
    res.json({
      ...investigation,
      verdict: investigation.final_verdict,
    });
  });

  return router;
}
