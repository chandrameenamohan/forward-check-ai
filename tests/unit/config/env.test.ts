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

  it("should use default values for GITHUB_REPO_OWNER and GITHUB_REPO_NAME", () => {
    const config = loadEnv(validEnv);

    expect(config.GITHUB_REPO_OWNER).toBe("chandrameenamohan");
    expect(config.GITHUB_REPO_NAME).toBe("forward-check-ai");
  });

  it("should accept optional GITHUB_TOKEN", () => {
    const config = loadEnv({ ...validEnv, GITHUB_TOKEN: "ghp_test-token" });

    expect(config.GITHUB_TOKEN).toBe("ghp_test-token");
  });

  it("should allow overriding GITHUB_REPO_OWNER and GITHUB_REPO_NAME", () => {
    const config = loadEnv({
      ...validEnv,
      GITHUB_REPO_OWNER: "custom-owner",
      GITHUB_REPO_NAME: "custom-repo",
    });

    expect(config.GITHUB_REPO_OWNER).toBe("custom-owner");
    expect(config.GITHUB_REPO_NAME).toBe("custom-repo");
  });

  it("should leave GITHUB_TOKEN undefined when not provided", () => {
    const config = loadEnv(validEnv);

    expect(config.GITHUB_TOKEN).toBeUndefined();
  });

  it("should export the envSchema", () => {
    expect(loadEnv).toBeDefined();
    expect(envSchema).toBeDefined();
    expect(envSchema.shape).toBeDefined();
  });
});
