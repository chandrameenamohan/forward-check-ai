import { Router } from "express";
import type { Request, Response } from "express";
import type { InvestigationRepository } from "../../db/investigation-repository.js";
import type { InvestigationPipeline } from "../../orchestrator/pipeline.js";
import { detectUrl } from "../../services/url-extractor.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

const MIN_MESSAGE_LENGTH = 10;
const MAX_MESSAGE_LENGTH = 5000;

/**
 * Strip all HTML tags from a string.
 */
function stripHtmlTags(input: string): string {
  return input.replace(/<[^>]*>/g, "");
}

/**
 * Create chat API routes.
 * POST /api/chat/message — accept a claim from web chat, validate, create investigation, kick off pipeline
 */
export function createChatRouter(
  repo: InvestigationRepository,
  pipeline: InvestigationPipeline,
): Router {
  const router = Router();

  router.post("/api/chat/message", (req: Request, res: Response) => {
    const { message } = req.body as { message?: unknown };

    // Validate message is present and is a string
    if (message === undefined || message === null || typeof message !== "string") {
      res.status(400).json({
        error: "Message is required and must be a string",
      });
      return;
    }

    // Sanitize: strip HTML tags
    const sanitized = stripHtmlTags(message);

    // Trim and validate length
    const trimmed = sanitized.trim();
    if (trimmed.length < MIN_MESSAGE_LENGTH || trimmed.length > MAX_MESSAGE_LENGTH) {
      res.status(400).json({
        error: `Message must be between ${MIN_MESSAGE_LENGTH} and ${MAX_MESSAGE_LENGTH} characters`,
      });
      return;
    }

    // Detect URL in input for logging — pipeline handles extraction
    const url = detectUrl(trimmed);
    if (url) {
      logger.info({ url }, "URL detected in chat message");
    }

    // Create investigation in DB
    const id = repo.create(trimmed, { platform: "web" });
    logger.info({ id, messageLength: trimmed.length }, "Chat investigation created");

    // Trigger pipeline in the background (do NOT await)
    // Pass the pre-created investigation ID so pipeline reuses it instead of creating a duplicate
    pipeline.investigate(trimmed, {
      investigationId: id,
      platform: "web",
      onInvestigationCreated: () => {
        // Investigation already created above — no-op
      },
    }).then((result) => {
      logger.info(
        { id: result.investigationId, verdict: result.verdict?.category },
        "Chat pipeline completed",
      );
    }).catch((err: unknown) => {
      logger.error({ err, id }, "Chat pipeline failed");
    });

    res.status(201).json({
      id,
      status: "pending",
      streamUrl: `/api/live/${id}/stream`,
    });
  });

  return router;
}
