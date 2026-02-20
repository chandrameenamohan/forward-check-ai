import { describe, it, expect, beforeEach, vi } from "vitest";
import express from "express";
import type { PlatformMessage } from "../../../../src/platforms/types.js";

const VERIFY_TOKEN = "my-secret-verify-token";
const APP_SECRET = "my-app-secret";

/** Minimal interface matching what the webhook router needs from the adapter. */
interface MockAdapter {
  handleMessage: (message: PlatformMessage) => Promise<void>;
}

function createMockAdapter(): MockAdapter {
  return {
    handleMessage: vi.fn<[PlatformMessage], Promise<void>>().mockResolvedValue(undefined),
  };
}

function makeTextMessagePayload(text = "Is this claim true?", from = "15551234567") {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123456789",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15559876543",
                phone_number_id: "987654321",
              },
              contacts: [
                { profile: { name: "Test User" }, wa_id: from },
              ],
              messages: [
                {
                  from,
                  id: "wamid.test123",
                  timestamp: "1708300000",
                  type: "text",
                  text: { body: text },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function makeImageMessagePayload() {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "123456789",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15559876543",
                phone_number_id: "987654321",
              },
              messages: [
                {
                  from: "15551234567",
                  id: "wamid.img456",
                  timestamp: "1708300000",
                  type: "image",
                  image: { id: "img_id_123", mime_type: "image/jpeg" },
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

function computeSignature(payload: string, secret: string): string {
  const { createHmac } = require("node:crypto") as typeof import("node:crypto");
  return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

describe("WhatsApp webhook routes", () => {
  let mockAdapter: MockAdapter;

  beforeEach(() => {
    mockAdapter = createMockAdapter();
  });

  async function createApp(appSecret?: string) {
    const { createWhatsAppWebhookRouter } = await import(
      "../../../../src/platforms/whatsapp/webhook.js"
    );

    const app = express();
    app.use(express.json({ verify: (req, _res, buf) => {
      (req as unknown as Record<string, unknown>)["rawBody"] = buf.toString();
    }}));
    const router = createWhatsAppWebhookRouter(mockAdapter, VERIFY_TOKEN, appSecret);
    app.use(router);

    return app;
  }

  async function request(app: ReturnType<typeof express>, method: "get" | "post", path: string, options?: {
    query?: Record<string, string>;
    body?: unknown;
    headers?: Record<string, string>;
  }) {
    const server = app.listen(0);
    const address = server.address();
    const port = typeof address === "object" && address ? address.port : 0;
    const baseUrl = `http://127.0.0.1:${port}`;

    try {
      const url = new URL(path, baseUrl);
      if (options?.query) {
        for (const [k, v] of Object.entries(options.query)) {
          url.searchParams.set(k, v);
        }
      }

      const fetchOptions: RequestInit = { method: method.toUpperCase() };
      if (options?.body) {
        fetchOptions.body = JSON.stringify(options.body);
        fetchOptions.headers = {
          "Content-Type": "application/json",
          ...options?.headers,
        };
      } else if (options?.headers) {
        fetchOptions.headers = options.headers;
      }

      const res = await fetch(url.toString(), fetchOptions);
      const text = await res.text();
      return { status: res.status, text, headers: res.headers };
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()));
    }
  }

  it("GET /webhook/whatsapp should return challenge on valid verify_token", async () => {
    const app = await createApp();

    const { status, text } = await request(app, "get", "/webhook/whatsapp", {
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": VERIFY_TOKEN,
        "hub.challenge": "challenge_abc123",
      },
    });

    expect(status).toBe(200);
    expect(text).toBe("challenge_abc123");
  });

  it("GET /webhook/whatsapp should return 403 on invalid verify_token", async () => {
    const app = await createApp();

    const { status } = await request(app, "get", "/webhook/whatsapp", {
      query: {
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong-token",
        "hub.challenge": "challenge_abc123",
      },
    });

    expect(status).toBe(403);
  });

  it("POST /webhook/whatsapp should return 200 immediately", async () => {
    const app = await createApp();
    const payload = makeTextMessagePayload();

    const { status } = await request(app, "post", "/webhook/whatsapp", {
      body: payload,
    });

    expect(status).toBe(200);
  });

  it("POST /webhook/whatsapp should reject invalid signature when appSecret is set", async () => {
    const app = await createApp(APP_SECRET);
    const payload = makeTextMessagePayload();
    const payloadStr = JSON.stringify(payload);

    const { status } = await request(app, "post", "/webhook/whatsapp", {
      body: payload,
      headers: {
        "x-hub-signature-256": "sha256=invalid_signature_here",
      },
    });

    expect(status).toBe(403);
    expect(mockAdapter.handleMessage).not.toHaveBeenCalled();
  });

  it("POST /webhook/whatsapp should parse and route text messages to adapter", async () => {
    const app = await createApp();
    const payload = makeTextMessagePayload("PM Modi Rs 5000?");

    const { status } = await request(app, "post", "/webhook/whatsapp", {
      body: payload,
    });

    expect(status).toBe(200);

    // Wait briefly for async processing
    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockAdapter.handleMessage).toHaveBeenCalledOnce();
    const msg = (mockAdapter.handleMessage as ReturnType<typeof vi.fn>).mock.calls[0]![0] as PlatformMessage;
    expect(msg.platform).toBe("whatsapp");
    expect(msg.text).toBe("PM Modi Rs 5000?");
    expect(msg.chatId).toBe("15551234567");
  });

  it("POST /webhook/whatsapp should ignore non-text message types", async () => {
    const app = await createApp();
    const payload = makeImageMessagePayload();

    const { status } = await request(app, "post", "/webhook/whatsapp", {
      body: payload,
    });

    expect(status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockAdapter.handleMessage).not.toHaveBeenCalled();
  });

  it("POST /webhook/whatsapp should accept valid signature when appSecret is set", async () => {
    const app = await createApp(APP_SECRET);
    const payload = makeTextMessagePayload("Testing signature");
    const payloadStr = JSON.stringify(payload);
    const signature = computeSignature(payloadStr, APP_SECRET);

    const { status } = await request(app, "post", "/webhook/whatsapp", {
      body: payload,
      headers: {
        "x-hub-signature-256": signature,
      },
    });

    expect(status).toBe(200);

    await new Promise((resolve) => setTimeout(resolve, 50));

    expect(mockAdapter.handleMessage).toHaveBeenCalledOnce();
  });
});
