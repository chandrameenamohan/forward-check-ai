import { Router } from "express";
import type { Request, Response } from "express";
import { z } from "zod";
import type { FeedbackRepository } from "../../db/feedback-repository.js";
import type { GitHubIssueService } from "../../services/github-issues.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

const feedbackBodySchema = z.object({
  type: z.enum(["bug", "feedback", "feature"]),
  title: z.string().min(5).max(200),
  description: z.string().min(10).max(5000),
});

/**
 * Create feedback routes.
 * GET  /feedback      — renders the feedback EJS view
 * POST /api/feedback  — validates with Zod, saves to DB, creates GitHub issue
 */
export function createFeedbackRouter(
  feedbackRepo: FeedbackRepository,
  githubService?: GitHubIssueService,
): Router {
  const router = Router();

  router.get("/feedback", (_req: Request, res: Response) => {
    res.render("feedback");
  });

  router.post("/api/feedback", async (req: Request, res: Response) => {
    const parsed = feedbackBodySchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: parsed.error.issues.map((i) => i.message).join("; "),
      });
      return;
    }

    const { type, title, description } = parsed.data;

    const userAgent = req.headers["user-agent"] ?? undefined;
    const ipAddress = req.ip ?? req.socket.remoteAddress ?? undefined;

    const id = feedbackRepo.create({
      type,
      title,
      description,
      sourceChannel: "web",
      userAgent,
      ipAddress,
    });

    logger.info({ id, type, title }, "Feedback created");

    let githubIssueUrl: string | undefined;

    if (githubService) {
      const typeEmoji = type === "bug" ? "🐛" : type === "feature" ? "✨" : "💬";
      const body = [
        `**${typeEmoji} ${type.charAt(0).toUpperCase() + type.slice(1)}**`,
        "",
        `**Title:** ${title}`,
        "",
        description,
        "",
        "---",
        `**Source:** web`,
        `**IP:** ${ipAddress ?? "unknown"}`,
        `**User-Agent:** ${userAgent ?? "unknown"}`,
        `**Feedback ID:** ${id}`,
      ].join("\n");

      const labels = [type === "feature" ? "feature-request" : type, "from-web", "triage"];

      const result = await githubService.createIssue({
        title: `[${type}] ${title}`,
        body,
        labels,
      });

      if (result.success && result.issueUrl && result.issueNumber) {
        githubIssueUrl = result.issueUrl;
        feedbackRepo.updateGitHubIssue(id, result.issueUrl, result.issueNumber);
        logger.info({ id, issueUrl: result.issueUrl }, "GitHub issue created for feedback");
      } else {
        logger.warn({ id, error: result.error }, "GitHub issue creation failed — feedback saved locally");
      }
    }

    const responseBody: { id: string; status: string; githubIssueUrl?: string } = {
      id,
      status: "created",
    };

    if (githubIssueUrl) {
      responseBody.githubIssueUrl = githubIssueUrl;
    }

    res.status(201).json(responseBody);
  });

  return router;
}
