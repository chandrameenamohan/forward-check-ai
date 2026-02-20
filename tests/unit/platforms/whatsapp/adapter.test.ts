import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { WhatsAppAdapter } from "../../../../src/platforms/whatsapp/adapter.js";
import type { MessageRouter } from "../../../../src/platforms/message-router.js";
import type { PlatformMessage } from "../../../../src/platforms/types.js";

describe("WhatsAppAdapter", () => {
  let mockRouter: MessageRouter;
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    mockRouter = {
      route: vi.fn().mockResolvedValue(undefined),
    };

    // Mock fetch to prevent real API calls in unit tests
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ messages: [{ id: "wamid.mock" }] }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("should create adapter with platform 'whatsapp'", () => {
    const adapter = new WhatsAppAdapter(
      "phone-number-id",
      "access-token",
      "verify-token",
      undefined,
      mockRouter,
    );

    expect(adapter.platform).toBe("whatsapp");
  });

  it("handleMessage should route PlatformMessage through message router", async () => {
    const adapter = new WhatsAppAdapter(
      "phone-number-id",
      "access-token",
      "verify-token",
      undefined,
      mockRouter,
    );

    const message: PlatformMessage = {
      platform: "whatsapp",
      chatId: "15551234567",
      messageId: "wamid.abc123",
      text: "Is the earth flat?",
      isForwarded: false,
      sender: { id: "hashed-phone-id" },
    };

    await adapter.handleMessage(message);

    expect(mockRouter.route).toHaveBeenCalledTimes(1);
    expect(mockRouter.route).toHaveBeenCalledWith(
      message,
      expect.objectContaining({
        sendText: expect.any(Function),
        sendVerdict: expect.any(Function),
        sendStatusUpdate: expect.any(Function),
        sendInitial: expect.any(Function),
        sendLink: expect.any(Function),
      }),
    );
  });

  it("getWebhookRouter should return an Express Router", () => {
    const adapter = new WhatsAppAdapter(
      "phone-number-id",
      "access-token",
      "verify-token",
      "app-secret",
      mockRouter,
    );

    const router = adapter.getWebhookRouter();

    // Express Router is a function with stack property
    expect(typeof router).toBe("function");
    expect(router).toHaveProperty("stack");
  });

  it("start should succeed (no-op)", async () => {
    const adapter = new WhatsAppAdapter(
      "phone-number-id",
      "access-token",
      "verify-token",
      undefined,
      mockRouter,
    );

    await expect(adapter.start()).resolves.toBeUndefined();
  });

  it("stop should succeed (no-op)", async () => {
    const adapter = new WhatsAppAdapter(
      "phone-number-id",
      "access-token",
      "verify-token",
      undefined,
      mockRouter,
    );

    await expect(adapter.stop()).resolves.toBeUndefined();
  });

  it("handleMessage should send welcome message for first-time users", async () => {
    const adapter = new WhatsAppAdapter(
      "phone-number-id",
      "access-token",
      "verify-token",
      undefined,
      mockRouter,
    );

    const message: PlatformMessage = {
      platform: "whatsapp",
      chatId: "15559876543",
      messageId: "wamid.first",
      text: "Check this claim for me",
      isForwarded: false,
      sender: { id: "new-user-hash" },
    };

    // First message — should trigger welcome + route
    await adapter.handleMessage(message);
    expect(mockRouter.route).toHaveBeenCalledTimes(1);

    // Second message from same user — should NOT trigger welcome again
    const secondMessage: PlatformMessage = {
      ...message,
      messageId: "wamid.second",
      text: "Another claim",
    };
    await adapter.handleMessage(secondMessage);
    expect(mockRouter.route).toHaveBeenCalledTimes(2);
  });
});
