import { describe, it, expect } from "vitest";

describe("hashPhoneNumber", () => {
  it("should produce consistent hash for same phone number", async () => {
    const { hashPhoneNumber } = await import(
      "../../../../src/platforms/whatsapp/phone-hash.js"
    );

    const hash1 = hashPhoneNumber("919876543210", "test-salt");
    const hash2 = hashPhoneNumber("919876543210", "test-salt");

    expect(hash1).toBe(hash2);
    // SHA-256 hex is always 64 characters
    expect(hash1).toHaveLength(64);
  });

  it("should produce different hashes for different phone numbers", async () => {
    const { hashPhoneNumber } = await import(
      "../../../../src/platforms/whatsapp/phone-hash.js"
    );

    const hash1 = hashPhoneNumber("919876543210", "test-salt");
    const hash2 = hashPhoneNumber("919876543211", "test-salt");

    expect(hash1).not.toBe(hash2);
  });

  it("should use salt in hash computation", async () => {
    const { hashPhoneNumber } = await import(
      "../../../../src/platforms/whatsapp/phone-hash.js"
    );

    const hash = hashPhoneNumber("919876543210", "my-salt");

    // Hash should be a valid hex string
    expect(hash).toMatch(/^[0-9a-f]{64}$/);
    // Hash should differ from unsalted (different salt)
    const hashDefault = hashPhoneNumber("919876543210", "other-salt");
    expect(hash).not.toBe(hashDefault);
  });

  it("different salts should produce different hashes", async () => {
    const { hashPhoneNumber } = await import(
      "../../../../src/platforms/whatsapp/phone-hash.js"
    );

    const hash1 = hashPhoneNumber("919876543210", "salt-one");
    const hash2 = hashPhoneNumber("919876543210", "salt-two");

    expect(hash1).not.toBe(hash2);
  });
});

describe("normalizePhoneNumber", () => {
  it("should normalize phone numbers by stripping non-digits", async () => {
    const { normalizePhoneNumber } = await import(
      "../../../../src/platforms/whatsapp/phone-hash.js"
    );

    expect(normalizePhoneNumber("+91-9876-543-210")).toBe("919876543210");
    expect(normalizePhoneNumber("(+1) 555-123-4567")).toBe("15551234567");
    expect(normalizePhoneNumber("  91 9876 543210  ")).toBe("919876543210");
  });
});
