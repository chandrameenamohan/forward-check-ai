import { Router } from "express";
import type { Request, Response } from "express";
import type { PlatformMessage } from "../types.js";
import { parseWebhookPayload } from "./webhook-parser.js";
import { verifyWebhookSignature } from "./webhook-signature.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * Minimal interface for the adapter that the webhook router forwards messages to.
 * Kept minimal so the router doesn't depend on the full WhatsAppAdapter class.
 */
export interface WebhookMessageHandler {
  handleMessage(message: PlatformMessage): Promise<void>;
}

/**
 * Create Express routes for WhatsApp webhook verification (GET) and
 * incoming message handling (POST).
 *
 * GET  /webhook/whatsapp — Meta verification challenge
 * POST /webhook/whatsapp — Incoming webhook payloads (messages, statuses)
 *
 * @param handler     - Forwards parsed messages for pipeline processing
 * @param verifyToken - Token we set in Meta dashboard for webhook verification
 * @param appSecret   - Meta app secret for HMAC signature verification (optional)
 */
export function createWhatsAppWebhookRouter(
  handler: WebhookMessageHandler,
  verifyToken: string,
  appSecret?: string,
): Router {
  const router = Router();

  // --- GET: Webhook verification challenge ---
  router.get("/webhook/whatsapp", (req: Request, res: Response) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    if (mode === "subscribe" && token === verifyToken) {
      logger.info("WhatsApp webhook verification successful");
      res.status(200).send(challenge);
      return;
    }

    logger.warn({ mode, token }, "WhatsApp webhook verification failed");
    res.sendStatus(403);
  });

  // --- POST: Incoming webhook payloads ---
  router.post("/webhook/whatsapp", (req: Request, res: Response) => {
    // Verify signature BEFORE responding if app secret is configured
    if (appSecret) {
      const signature = req.headers["x-hub-signature-256"] as string | undefined;
      const rawBody = (req as unknown as Record<string, unknown>)["rawBody"] as string | undefined;
      const payload = rawBody ?? JSON.stringify(req.body);

      if (!signature || !verifyWebhookSignature(payload, signature, appSecret)) {
        logger.warn("WhatsApp webhook signature verification failed");
        res.sendStatus(403);
        return;
      }
    }

    // Respond 200 immediately — Meta requires fast acknowledgment
    res.sendStatus(200);

    // Parse and route asynchronously (don't block the response)
    const events = parseWebhookPayload(req.body);

    for (const event of events) {
      if (event.type === "message") {
        handler.handleMessage(event.message).catch((err: unknown) => {
          logger.error(
            { err, chatId: event.message.chatId },
            "Failed to handle WhatsApp message",
          );
        });
      }
    }
  });

  return router;
}
