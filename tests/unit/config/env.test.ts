import { describe, it, expect } from "vitest";
import { loadEnv, envSchema } from "../../../src/config/env.js";

describe("Environment configuration", () => {
  const validEnv = {
    ANTHROPIC_API_KEY: "test-key-123",
    TELEGRAM_BOT_TOKEN: "test-bot-token",
  };

  it("should load valid env vars without error", () => {
    const config = loadEnv(validEnv);

    expect(config.ANTHROPIC_API_KEY).toBe("test-key-123");
    expect(config.TELEGRAM_BOT_TOKEN).toBe("test-bot-token");
  });

  it("should throw on missing ANTHROPIC_API_KEY", () => {
    const env = { TELEGRAM_BOT_TOKEN: "test-bot-token" };

    expect(() => loadEnv(env)).toThrow();
  });

  it("should throw on missing TELEGRAM_BOT_TOKEN", () => {
    const env = { ANTHROPIC_API_KEY: "test-key-123" };

    expect(() => loadEnv(env)).toThrow();
  });

  it("should throw on empty ANTHROPIC_API_KEY", () => {
    const env = { ANTHROPIC_API_KEY: "", TELEGRAM_BOT_TOKEN: "test-bot-token" };

    expect(() => loadEnv(env)).toThrow();
  });

  it("should use default values for optional vars", () => {
    const config = loadEnv(validEnv);

    expect(config.PORT).toBe(3000);
    expect(config.NODE_ENV).toBe("development");
    expect(config.LOG_LEVEL).toBe("info");
    expect(config.DATABASE_PATH).toBe("./data/forwardcheck.db");
  });

  it("should accept optional BRAVE_SEARCH_API_KEY", () => {
    const config = loadEnv({ ...validEnv, BRAVE_SEARCH_API_KEY: "brave-key" });

    expect(config.BRAVE_SEARCH_API_KEY).toBe("brave-key");
  });

  it("should accept optional GOOGLE_FACTCHECK_API_KEY", () => {
    const config = loadEnv({
      ...validEnv,
      GOOGLE_FACTCHECK_API_KEY: "google-key",
    });

    expect(config.GOOGLE_FACTCHECK_API_KEY).toBe("google-key");
  });

  it("should parse PORT as a number", () => {
    const config = loadEnv({ ...validEnv, PORT: "8080" });

    expect(config.PORT).toBe(8080);
  });

  it("should override NODE_ENV when set", () => {
    const config = loadEnv({ ...validEnv, NODE_ENV: "production" });

    expect(config.NODE_ENV).toBe("production");
  });

  it("should export the envSchema", () => {
    expect(loadEnv).toBeDefined();
    expect(envSchema).toBeDefined();
    expect(envSchema.shape).toBeDefined();
  });
});
