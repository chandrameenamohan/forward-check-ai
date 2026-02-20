import type { Router } from "express";
import type { PlatformAdapter, PlatformMessage } from "../types.js";
import type { MessageRouter } from "../message-router.js";
import { WhatsAppCloudClient } from "./client.js";
import { WhatsAppResponder } from "./responder.js";
import { createWhatsAppWebhookRouter } from "./webhook.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/**
 * WhatsApp platform adapter — wires together the Cloud API client,
 * webhook parser, responder, and message router.
 *
 * Unlike Telegram (long-polling), WhatsApp uses webhooks so start/stop
 * are no-ops. The webhook routes are mounted on the Express server.
 */
export class WhatsAppAdapter implements PlatformAdapter {
  readonly platform = "whatsapp";

  private readonly client: WhatsAppCloudClient;
  private readonly responder: WhatsAppResponder;
  private readonly messageRouter: MessageRouter;
  private readonly verifyToken: string;
  private readonly appSecret: string | undefined;

  /** Tracks users who have already messaged to avoid repeat welcome messages. */
  private readonly seenUsers = new Set<string>();

  constructor(
    phoneNumberId: string,
    accessToken: string,
    verifyToken: string,
    appSecret: string | undefined,
    messageRouter: MessageRouter,
  ) {
    this.client = new WhatsAppCloudClient(phoneNumberId, accessToken);
    this.responder = new WhatsAppResponder(this.client);
    this.messageRouter = messageRouter;
    this.verifyToken = verifyToken;
    this.appSecret = appSecret;
  }

  /**
   * Handle an incoming WhatsApp message by routing it through the pipeline.
   * Sends a welcome message for first-time users.
   */
  async handleMessage(message: PlatformMessage): Promise<void> {
    const userId = message.sender.id;

    if (!this.seenUsers.has(userId)) {
      this.seenUsers.add(userId);
      logger.info({ chatId: message.chatId }, "First message from WhatsApp user — sending welcome");
      await this.responder.sendText(
        message.chatId,
        "Welcome to ForwardCheck! Forward me a message or send a claim, and I'll investigate whether it's true or false.",
      );
    }

    await this.messageRouter.route(message, this.responder);
  }

  /**
   * Returns the Express router containing GET (verification) and
   * POST (incoming messages) webhook endpoints.
   */
  getWebhookRouter(): Router {
    return createWhatsAppWebhookRouter(this, this.verifyToken, this.appSecret);
  }

  /** No-op — webhooks are mounted via Express, not started independently. */
  async start(): Promise<void> {
    logger.info("WhatsApp adapter started (webhook-based — no polling)");
  }

  /** No-op — nothing to disconnect for webhook-based adapter. */
  async stop(): Promise<void> {
    logger.info("WhatsApp adapter stopped");
  }
}
