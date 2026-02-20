import { createHash } from "node:crypto";

const DEFAULT_SALT = "forwardcheck-ai-v1";

/**
 * Hash a phone number using SHA-256 with a salt.
 * Returns a 64-character hex string. Never store or log the raw number.
 */
export function hashPhoneNumber(
  phoneNumber: string,
  salt: string = process.env["PHONE_HASH_SALT"] ?? DEFAULT_SALT,
): string {
  return createHash("sha256")
    .update(salt + phoneNumber)
    .digest("hex");
}

/**
 * Normalize a raw phone number by stripping all non-digit characters.
 * WhatsApp Cloud API already provides numbers in E.164-ish format (digits only),
 * but this handles edge cases like "+91-9876-543-210" → "919876543210".
 */
export function normalizePhoneNumber(raw: string): string {
  return raw.replace(/\D/g, "");
}
