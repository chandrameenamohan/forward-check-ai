import { describe, it, expect } from "vitest";
import { loadEnv } from "../../../src/config/env.js";

describe("WhatsApp environment configuration", () => {
  const validEnv = {
    ANTHROPIC_API_KEY: "test-key-123",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
  };

  it("should load env without WhatsApp vars (all optional)", () => {
    const config = loadEnv(validEnv);

    expect(config.ANTHROPIC_API_KEY).toBe("test-key-123");
    expect(config.TELEGRAM_BOT_TOKEN).toBe("test-bot-token");
    expect(config.WHATSAPP_PHONE_NUMBER_ID).toBeUndefined();
    expect(config.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
    expect(config.WHATSAPP_VERIFY_TOKEN).toBeUndefined();
    expect(config.WHATSAPP_APP_SECRET).toBeUndefined();
  });

  it("should load env with WhatsApp vars present", () => {
    const config = loadEnv({
      ...validEnv,
      WHATSAPP_ENABLED: "true",
      WHATSAPP_PHONE_NUMBER_ID: "123456789",
      WHATSAPP_ACCESS_TOKEN: "EAABx...",
      WHATSAPP_VERIFY_TOKEN: "my-verify-token",
      WHATSAPP_APP_SECRET: "abc123secret",
      PHONE_HASH_SALT: "custom-salt",
    });

    expect(config.WHATSAPP_ENABLED).toBe(true);
    expect(config.WHATSAPP_PHONE_NUMBER_ID).toBe("123456789");
    expect(config.WHATSAPP_ACCESS_TOKEN).toBe("EAABx...");
    expect(config.WHATSAPP_VERIFY_TOKEN).toBe("my-verify-token");
    expect(config.WHATSAPP_APP_SECRET).toBe("abc123secret");
    expect(config.PHONE_HASH_SALT).toBe("custom-salt");
  });

  it("should default WHATSAPP_ENABLED to false", () => {
    const config = loadEnv(validEnv);

    expect(config.WHATSAPP_ENABLED).toBe(false);
  });

  it("should default PHONE_HASH_SALT", () => {
    const config = loadEnv(validEnv);

    expect(config.PHONE_HASH_SALT).toBe("forwardcheck-ai-v1");
  });

  it("should transform WHATSAPP_ENABLED string 'true' to boolean true", () => {
    const config = loadEnv({ ...validEnv, WHATSAPP_ENABLED: "true" });

    expect(config.WHATSAPP_ENABLED).toBe(true);
  });

  it("should transform WHATSAPP_ENABLED string 'false' to boolean false", () => {
    const config = loadEnv({ ...validEnv, WHATSAPP_ENABLED: "false" });

    expect(config.WHATSAPP_ENABLED).toBe(false);
  });

  it("should treat any non-'true' WHATSAPP_ENABLED value as false", () => {
    const config = loadEnv({ ...validEnv, WHATSAPP_ENABLED: "yes" });

    expect(config.WHATSAPP_ENABLED).toBe(false);
  });
});
