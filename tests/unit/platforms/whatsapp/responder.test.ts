import { describe, it, expect, beforeEach, vi } from "vitest";
import { makeFinalVerdict } from "../../../fixtures/index.js";
import type { WhatsAppCloudClient, WhatsAppSendResult } from "../../../../src/platforms/whatsapp/client.js";

function createMockClient(): WhatsAppCloudClient {
  const successResult: WhatsAppSendResult = { messageId: "wamid.abc123", success: true };
  return {
    sendTextMessage: vi.fn<[string, string], Promise<WhatsAppSendResult>>().mockResolvedValue(successResult),
    sendInteractiveMessage: vi.fn().mockResolvedValue(successResult),
    sendCtaUrlMessage: vi.fn<[string, string, string, string], Promise<WhatsAppSendResult>>().mockResolvedValue(successResult),
    markAsRead: vi.fn().mockResolvedValue(successResult),
  } as unknown as WhatsAppCloudClient;
}

describe("WhatsAppResponder", () => {
  let mockClient: WhatsAppCloudClient;

  beforeEach(() => {
    mockClient = createMockClient();
  });

  it("sendText should call WhatsAppCloudClient.sendTextMessage", async () => {
    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(mockClient);

    await responder.sendText("15551234567", "Hello from test");

    expect(mockClient.sendTextMessage).toHaveBeenCalledOnce();
    expect(mockClient.sendTextMessage).toHaveBeenCalledWith(
      "15551234567",
      "Hello from test",
    );
  });

  it("sendVerdict should format with WhatsApp markdown and send CTA button", async () => {
    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(mockClient);

    const verdict = makeFinalVerdict({
      category: "likely-false",
      confidence: 15,
      summary: "This claim is false.",
    });

    await responder.sendVerdict(
      "15551234567",
      verdict,
      "https://example.com/v/abc123",
    );

    // Should send the formatted verdict text
    expect(mockClient.sendTextMessage).toHaveBeenCalledOnce();
    const textArg = (mockClient.sendTextMessage as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(textArg).toContain("LIKELY FALSE");
    expect(textArg).toContain("*"); // WhatsApp bold syntax
    expect(textArg).not.toMatch(/<\/?[a-z][^>]*>/i); // No HTML

    // Should send CTA URL button for full analysis
    expect(mockClient.sendCtaUrlMessage).toHaveBeenCalledOnce();
    expect(mockClient.sendCtaUrlMessage).toHaveBeenCalledWith(
      "15551234567",
      "View the complete investigation with sources and reasoning",
      "View Full Analysis",
      "https://example.com/v/abc123",
    );
  });

  it("sendStatusUpdate should send new message (not edit)", async () => {
    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(mockClient);

    await responder.sendStatusUpdate("15551234567", "planning");

    // Should send a NEW text message (WhatsApp has no edit API)
    expect(mockClient.sendTextMessage).toHaveBeenCalledOnce();
    const textArg = (mockClient.sendTextMessage as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(textArg).toMatch(/plan/i);
  });

  it("sendStatusUpdate should skip non-key stages to avoid spamming", async () => {
    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(mockClient);

    // These intermediate stages should be skipped
    await responder.sendStatusUpdate("15551234567", "fetching");
    await responder.sendStatusUpdate("15551234567", "analyzing");
    await responder.sendStatusUpdate("15551234567", "challenging");

    expect(mockClient.sendTextMessage).not.toHaveBeenCalled();
  });

  it("sendStatusUpdate should send for key stages: planning, searching, judging", async () => {
    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(mockClient);

    await responder.sendStatusUpdate("15551234567", "planning");
    await responder.sendStatusUpdate("15551234567", "searching");
    await responder.sendStatusUpdate("15551234567", "judging");

    expect(mockClient.sendTextMessage).toHaveBeenCalledTimes(3);
  });

  it("sendInitial should send investigating message", async () => {
    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(mockClient);

    await responder.sendInitial("15551234567");

    expect(mockClient.sendTextMessage).toHaveBeenCalledOnce();
    const textArg = (mockClient.sendTextMessage as ReturnType<typeof vi.fn>).mock.calls[0]![1] as string;
    expect(textArg.toLowerCase()).toContain("investigat");
    expect(textArg).toContain("2-4 minutes");
  });

  it("sendLink should send CTA URL button message", async () => {
    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(mockClient);

    await responder.sendLink(
      "15551234567",
      "Watch Live Investigation",
      "https://example.com/live/abc",
    );

    expect(mockClient.sendCtaUrlMessage).toHaveBeenCalledOnce();
    expect(mockClient.sendCtaUrlMessage).toHaveBeenCalledWith(
      "15551234567",
      "Watch Live Investigation",
      "Watch Live Investigation",
      "https://example.com/live/abc",
    );
  });

  it("should handle API errors gracefully without throwing", async () => {
    const failClient = createMockClient();
    (failClient.sendTextMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("WhatsApp API error"),
    );
    (failClient.sendCtaUrlMessage as ReturnType<typeof vi.fn>).mockRejectedValue(
      new Error("WhatsApp API error"),
    );

    const { WhatsAppResponder } = await import(
      "../../../../src/platforms/whatsapp/responder.js"
    );
    const responder = new WhatsAppResponder(failClient);

    // None of these should throw
    await expect(responder.sendText("123", "test")).resolves.not.toThrow();
    await expect(responder.sendInitial("123")).resolves.not.toThrow();
    await expect(
      responder.sendStatusUpdate("123", "planning"),
    ).resolves.not.toThrow();
    await expect(
      responder.sendVerdict("123", makeFinalVerdict(), "https://example.com"),
    ).resolves.not.toThrow();
    await expect(
      responder.sendLink("123", "Click here", "https://example.com"),
    ).resolves.not.toThrow();
  });
});
