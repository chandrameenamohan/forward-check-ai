import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Verify that an incoming WhatsApp webhook payload was genuinely sent by Meta.
 *
 * Meta signs every webhook POST with HMAC-SHA256 using the app secret.
 * The signature is sent in the `x-hub-signature-256` header as `sha256=<hex>`.
 *
 * @param payload  - The raw request body string
 * @param signature - The value of the `x-hub-signature-256` header
 * @param appSecret - The Meta app secret
 * @returns `true` if the signature is valid
 */
export function verifyWebhookSignature(
  payload: string,
  signature: string,
  appSecret: string,
): boolean {
  if (!signature) {
    return false;
  }

  // Strip the "sha256=" prefix if present
  const providedHex = signature.startsWith("sha256=")
    ? signature.slice(7)
    : signature;

  const expectedHex = createHmac("sha256", appSecret)
    .update(payload)
    .digest("hex");

  // Use timing-safe comparison to prevent timing attacks
  if (providedHex.length !== expectedHex.length) {
    return false;
  }

  return timingSafeEqual(
    Buffer.from(providedHex, "hex"),
    Buffer.from(expectedHex, "hex"),
  );
}
