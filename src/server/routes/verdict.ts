import { Router } from "express";
import type { Request, Response } from "express";
import type { InvestigationRepository } from "../../db/investigation-repository.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Create verdict page routes.
 * GET /v/:id — renders the web verdict page for a completed investigation.
 */
export function createVerdictRouter(
  repo: InvestigationRepository,
): Router {
  const router = Router();

  router.get("/v/:id", (req: Request, res: Response) => {
    const rawId = req.params["id"];
    const id = Array.isArray(rawId) ? rawId[0] : rawId;
    if (!id) {
      res.status(400).send("Missing investigation ID");
      return;
    }

    const investigation = repo.getById(id);
    if (!investigation) {
      logger.info({ id }, "Verdict page: investigation not found");
      res.status(404).render("verdict-not-found", { id });
      return;
    }

    // Show pending page for investigations still in progress
    if (
      investigation.status === "pending" ||
      investigation.status === "investigating"
    ) {
      res.render("verdict-pending", {
        id: investigation.id,
        status: investigation.status,
        originalMessage: investigation.original_message,
      });
      return;
    }

    // For completed investigations, pass parsed data to the template
    res.render("verdict", {
      id: investigation.id,
      originalMessage: investigation.original_message,
      verdict: investigation.final_verdict,
      challengeReport: investigation.challenge_report,
      searchStrategy: investigation.search_strategy,
      agentReports: investigation.agent_reports,
      pipelineDurationMs: investigation.pipeline_duration_ms,
      totalCostUsd: investigation.total_cost_usd,
      createdAt: investigation.created_at,
      completedAt: investigation.completed_at,
    });
  });

  return router;
}
