import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/** Response shape returned by all WhatsAppCloudClient methods. */
export interface WhatsAppSendResult {
  messageId: string;
  success: boolean;
}

/** A reply button for interactive messages. */
export interface WhatsAppReplyButton {
  id: string;
  title: string;
}

/**
 * Typed HTTP client for the Meta WhatsApp Cloud API.
 *
 * Handles sending text messages, interactive button messages,
 * CTA URL messages, and marking messages as read.
 * All methods handle errors gracefully — they log and return
 * `{ success: false }` instead of throwing.
 */
export class WhatsAppCloudClient {
  private readonly baseUrl: string;
  private readonly accessToken: string;
  private readonly retryDelaysMs: readonly number[];

  /**
   * @param retryDelaysMs - Waits before each retry of a send that failed for a passing reason
   *   (network error, 429, 5xx). Empty = no retry.
   */
  constructor(
    phoneNumberId: string,
    accessToken: string,
    apiVersion: string = "v21.0",
    retryDelaysMs: readonly number[] = [1000, 3000, 9000],
  ) {
    this.baseUrl = `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
    this.accessToken = accessToken;
    this.retryDelaysMs = retryDelaysMs;
  }

  /**
   * Send a plain text message.
   */
  async sendTextMessage(
    to: string,
    text: string,
  ): Promise<WhatsAppSendResult> {
    return this.post({
      messaging_product: "whatsapp",
      to,
      type: "text",
      text: { body: text },
    });
  }

  /**
   * Send an interactive message with reply buttons.
   */
  async sendInteractiveMessage(
    to: string,
    body: string,
    buttons: WhatsAppReplyButton[],
  ): Promise<WhatsAppSendResult> {
    return this.post({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "button",
        body: { text: body },
        action: {
          buttons: buttons.map((btn) => ({
            type: "reply",
            reply: { id: btn.id, title: btn.title },
          })),
        },
      },
    });
  }

  /**
   * Send an interactive CTA URL button message.
   */
  async sendCtaUrlMessage(
    to: string,
    body: string,
    buttonText: string,
    url: string,
  ): Promise<WhatsAppSendResult> {
    return this.post({
      messaging_product: "whatsapp",
      to,
      type: "interactive",
      interactive: {
        type: "cta_url",
        body: { text: body },
        action: {
          name: "cta_url",
          parameters: {
            display_text: buttonText,
            url,
          },
        },
      },
    });
  }

  /**
   * Mark an incoming message as read.
   */
  async markAsRead(messageId: string): Promise<WhatsAppSendResult> {
    return this.post({
      messaging_product: "whatsapp",
      status: "read",
      message_id: messageId,
    });
  }

  /**
   * Internal POST helper — sends JSON to the Cloud API and parses the response.
   * Handles both HTTP and network errors gracefully.
   */
  private async post(body: Record<string, unknown>): Promise<WhatsAppSendResult> {
    for (const delayMs of this.retryDelaysMs) {
      const { result, retryable } = await this.postOnce(body);
      if (!retryable) return result;
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
    return (await this.postOnce(body)).result;
  }

  private async postOnce(body: Record<string, unknown>): Promise<{ result: WhatsAppSendResult; retryable: boolean }> {
    try {
      const response = await fetch(this.baseUrl, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${this.accessToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as Record<string, unknown>;
        logger.error(
          { status: response.status, error: errorData },
          "WhatsAppCloudClient: API error",
        );
        return { result: { messageId: "", success: false }, retryable: response.status === 429 || response.status >= 500 };
      }

      const data = await response.json() as Record<string, unknown>;
      const messages = data["messages"] as Array<{ id: string }> | undefined;
      const messageId = messages?.[0]?.id ?? "";

      return { result: { messageId, success: true }, retryable: false };
    } catch (err: unknown) {
      logger.error({ err }, "WhatsAppCloudClient: network error");
      return { result: { messageId: "", success: false }, retryable: true };
    }
  }
}
