import { describe, it, expect } from "vitest";
import { createHmac } from "node:crypto";

const APP_SECRET = "test-app-secret-abc123";

/** Helper to compute a valid HMAC-SHA256 signature for a payload. */
function computeSignature(payload: string, secret: string): string {
  return "sha256=" + createHmac("sha256", secret).update(payload).digest("hex");
}

describe("verifyWebhookSignature", () => {
  it("should verify a valid signature", async () => {
    const { verifyWebhookSignature } = await import(
      "../../../../src/platforms/whatsapp/webhook-signature.js"
    );

    const payload = JSON.stringify({ entry: [{ id: "123" }] });
    const signature = computeSignature(payload, APP_SECRET);

    expect(verifyWebhookSignature(payload, signature, APP_SECRET)).toBe(true);
  });

  it("should reject an invalid signature", async () => {
    const { verifyWebhookSignature } = await import(
      "../../../../src/platforms/whatsapp/webhook-signature.js"
    );

    const payload = JSON.stringify({ entry: [{ id: "123" }] });
    const tamperedPayload = JSON.stringify({ entry: [{ id: "456" }] });
    const signature = computeSignature(tamperedPayload, APP_SECRET);

    expect(verifyWebhookSignature(payload, signature, APP_SECRET)).toBe(false);
  });

  it("should handle missing sha256= prefix gracefully", async () => {
    const { verifyWebhookSignature } = await import(
      "../../../../src/platforms/whatsapp/webhook-signature.js"
    );

    const payload = JSON.stringify({ entry: [{ id: "123" }] });
    // Compute valid HMAC but without the "sha256=" prefix
    const rawHmac = createHmac("sha256", APP_SECRET)
      .update(payload)
      .digest("hex");

    // Should still verify correctly when prefix is missing
    expect(verifyWebhookSignature(payload, rawHmac, APP_SECRET)).toBe(true);
  });

  it("should reject empty signature", async () => {
    const { verifyWebhookSignature } = await import(
      "../../../../src/platforms/whatsapp/webhook-signature.js"
    );

    const payload = JSON.stringify({ entry: [{ id: "123" }] });

    expect(verifyWebhookSignature(payload, "", APP_SECRET)).toBe(false);
  });
});
