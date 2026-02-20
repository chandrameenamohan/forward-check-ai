import { describe, it, expect } from "vitest";

describe("WhatsApp platform barrel export", () => {
  it("should export WhatsAppAdapter", async () => {
    const mod = await import("../../../../src/platforms/whatsapp/index.js");
    expect(mod.WhatsAppAdapter).toBeDefined();
    expect(typeof mod.WhatsAppAdapter).toBe("function");
  });

  it("should export WhatsAppResponder", async () => {
    const mod = await import("../../../../src/platforms/whatsapp/index.js");
    expect(mod.WhatsAppResponder).toBeDefined();
    expect(typeof mod.WhatsAppResponder).toBe("function");
  });

  it("should export WhatsAppCloudClient", async () => {
    const mod = await import("../../../../src/platforms/whatsapp/index.js");
    expect(mod.WhatsAppCloudClient).toBeDefined();
    expect(typeof mod.WhatsAppCloudClient).toBe("function");
  });

  it("should export formatWhatsAppVerdict", async () => {
    const mod = await import("../../../../src/platforms/whatsapp/index.js");
    expect(mod.formatWhatsAppVerdict).toBeDefined();
    expect(typeof mod.formatWhatsAppVerdict).toBe("function");
  });

  it("should export createWhatsAppWebhookRouter", async () => {
    const mod = await import("../../../../src/platforms/whatsapp/index.js");
    expect(mod.createWhatsAppWebhookRouter).toBeDefined();
    expect(typeof mod.createWhatsAppWebhookRouter).toBe("function");
  });

  it("should export parseWebhookPayload", async () => {
    const mod = await import("../../../../src/platforms/whatsapp/index.js");
    expect(mod.parseWebhookPayload).toBeDefined();
    expect(typeof mod.parseWebhookPayload).toBe("function");
  });

  it("should export verifyWebhookSignature", async () => {
    const mod = await import("../../../../src/platforms/whatsapp/index.js");
    expect(mod.verifyWebhookSignature).toBeDefined();
    expect(typeof mod.verifyWebhookSignature).toBe("function");
  });
});
