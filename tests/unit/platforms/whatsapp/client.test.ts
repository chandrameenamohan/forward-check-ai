import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

const PHONE_NUMBER_ID = "123456789";
const ACCESS_TOKEN = "EAABwzLixnjYBO...fake-token";
const RECIPIENT = "15551234567";

describe("WhatsAppCloudClient", () => {
  let fetchSpy: ReturnType<typeof vi.fn>;
  let originalFetch: typeof globalThis.fetch;

  beforeEach(() => {
    originalFetch = globalThis.fetch;
    fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  function mockFetchSuccess(messageId = "wamid.abc123") {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: "whatsapp",
        contacts: [{ input: RECIPIENT, wa_id: RECIPIENT }],
        messages: [{ id: messageId }],
      }),
    } as Response);
  }

  function mockFetchError(status = 400) {
    fetchSpy.mockResolvedValue({
      ok: false,
      status,
      json: async () => ({
        error: {
          message: "Invalid parameter",
          type: "OAuthException",
          code: 100,
        },
      }),
    } as Response);
  }

  it("sendTextMessage should POST to correct Cloud API URL", async () => {
    mockFetchSuccess();

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(PHONE_NUMBER_ID, ACCESS_TOKEN);

    const result = await client.sendTextMessage(RECIPIENT, "Hello from test");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    );
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      messaging_product: "whatsapp",
      to: RECIPIENT,
      type: "text",
      text: { body: "Hello from test" },
    });

    expect(result.success).toBe(true);
    expect(result.messageId).toBe("wamid.abc123");
  });

  it("sendTextMessage should include Bearer token in Authorization header", async () => {
    mockFetchSuccess();

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(PHONE_NUMBER_ID, ACCESS_TOKEN);

    await client.sendTextMessage(RECIPIENT, "test");

    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe(`Bearer ${ACCESS_TOKEN}`);
    expect(headers["Content-Type"]).toBe("application/json");
  });

  it("sendInteractiveMessage should send button payload", async () => {
    mockFetchSuccess();

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(PHONE_NUMBER_ID, ACCESS_TOKEN);

    const buttons = [
      { id: "btn_yes", title: "Yes" },
      { id: "btn_no", title: "No" },
    ];

    const result = await client.sendInteractiveMessage(
      RECIPIENT,
      "Do you agree?",
      buttons,
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

    expect(body["messaging_product"]).toBe("whatsapp");
    expect(body["to"]).toBe(RECIPIENT);
    expect(body["type"]).toBe("interactive");

    const interactive = body["interactive"] as Record<string, unknown>;
    expect(interactive["type"]).toBe("button");

    const bodyObj = interactive["body"] as Record<string, string>;
    expect(bodyObj["text"]).toBe("Do you agree?");

    const action = interactive["action"] as Record<string, unknown>;
    const actionButtons = action["buttons"] as Array<Record<string, unknown>>;
    expect(actionButtons).toHaveLength(2);
    expect(actionButtons[0]).toEqual({
      type: "reply",
      reply: { id: "btn_yes", title: "Yes" },
    });
    expect(actionButtons[1]).toEqual({
      type: "reply",
      reply: { id: "btn_no", title: "No" },
    });

    expect(result.success).toBe(true);
  });

  it("sendCtaUrlMessage should send CTA URL payload", async () => {
    mockFetchSuccess();

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(PHONE_NUMBER_ID, ACCESS_TOKEN);

    const result = await client.sendCtaUrlMessage(
      RECIPIENT,
      "View your analysis report",
      "View Full Analysis",
      "https://example.com/v/abc123",
    );

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as Record<string, unknown>;

    expect(body["messaging_product"]).toBe("whatsapp");
    expect(body["to"]).toBe(RECIPIENT);
    expect(body["type"]).toBe("interactive");

    const interactive = body["interactive"] as Record<string, unknown>;
    expect(interactive["type"]).toBe("cta_url");

    const bodyObj = interactive["body"] as Record<string, string>;
    expect(bodyObj["text"]).toBe("View your analysis report");

    const action = interactive["action"] as Record<string, unknown>;
    expect(action["name"]).toBe("cta_url");

    const parameters = action["parameters"] as Record<string, string>;
    expect(parameters["display_text"]).toBe("View Full Analysis");
    expect(parameters["url"]).toBe("https://example.com/v/abc123");

    expect(result.success).toBe(true);
  });

  it("markAsRead should POST read status", async () => {
    fetchSpy.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ success: true }),
    } as Response);

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(PHONE_NUMBER_ID, ACCESS_TOKEN);

    const result = await client.markAsRead("wamid.incoming123");

    expect(fetchSpy).toHaveBeenCalledOnce();
    const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://graph.facebook.com/v21.0/${PHONE_NUMBER_ID}/messages`,
    );
    expect(options.method).toBe("POST");

    const body = JSON.parse(options.body as string) as Record<string, unknown>;
    expect(body).toEqual({
      messaging_product: "whatsapp",
      status: "read",
      message_id: "wamid.incoming123",
    });

    expect(result.success).toBe(true);
  });

  it("should handle API errors gracefully without throwing", async () => {
    mockFetchError(400);

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(PHONE_NUMBER_ID, ACCESS_TOKEN);

    // All methods should return { success: false } instead of throwing
    const textResult = await client.sendTextMessage(RECIPIENT, "test");
    expect(textResult.success).toBe(false);
    expect(textResult.messageId).toBe("");

    mockFetchError(401);
    const interactiveResult = await client.sendInteractiveMessage(
      RECIPIENT,
      "test",
      [{ id: "btn", title: "Click" }],
    );
    expect(interactiveResult.success).toBe(false);

    mockFetchError(500);
    const ctaResult = await client.sendCtaUrlMessage(
      RECIPIENT,
      "body",
      "btn",
      "https://example.com",
    );
    expect(ctaResult.success).toBe(false);

    const readResult = await client.markAsRead("wamid.test");
    expect(readResult.success).toBe(false);
  });

  it("should handle network errors gracefully without throwing", async () => {
    fetchSpy.mockRejectedValue(new Error("Network error"));

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(PHONE_NUMBER_ID, ACCESS_TOKEN);

    const result = await client.sendTextMessage(RECIPIENT, "test");
    expect(result.success).toBe(false);
    expect(result.messageId).toBe("");
  });

  it("should use custom API version when provided", async () => {
    mockFetchSuccess();

    const { WhatsAppCloudClient } = await import(
      "../../../../src/platforms/whatsapp/client.js"
    );
    const client = new WhatsAppCloudClient(
      PHONE_NUMBER_ID,
      ACCESS_TOKEN,
      "v22.0",
    );

    await client.sendTextMessage(RECIPIENT, "test");

    const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    );
  });
});
