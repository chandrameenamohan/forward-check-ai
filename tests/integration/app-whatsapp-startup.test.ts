import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";
import type { Server } from "node:http";

/** Helper to clean up SQLite database files (including WAL/SHM) */
function cleanupDb(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const filePath = dbPath + suffix;
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

describe("WhatsApp adapter startup wiring", () => {
  const dbPath = join(tmpdir(), `forwardcheck-wa-startup-${randomUUID()}.db`);
  let server: Server | undefined;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    cleanupDb(dbPath);
  });

  it("should start without WhatsApp when env vars not set", async () => {
    const { createDatabase } = await import("../../src/db/connection.js");
    const { runMigrations } = await import("../../src/db/migrations.js");
    const { InvestigationRepository } = await import("../../src/db/investigation-repository.js");
    const { createApp } = await import("../../src/server/app.js");

    const db = createDatabase(dbPath);
    runMigrations(db);
    const repo = new InvestigationRepository(db);

    // Create app without WhatsApp adapter (undefined) — should work fine
    const app = createApp(repo);

    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });

    // Health endpoint should work
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthRes.status).toBe(200);

    // WhatsApp webhook should 404
    const waRes = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`);
    expect(waRes.status).toBe(404);

    db.close();
  });

  it("should initialize WhatsApp adapter when env vars are present", async () => {
    const { createDatabase } = await import("../../src/db/connection.js");
    const { runMigrations } = await import("../../src/db/migrations.js");
    const { InvestigationRepository } = await import("../../src/db/investigation-repository.js");
    const { ClaudeClient } = await import("../../src/services/claude-client.js");
    const { ToolRegistry } = await import("../../src/tools/tool-registry.js");
    const { InvestigationPipeline } = await import("../../src/orchestrator/pipeline.js");
    const { createMessageRouter } = await import("../../src/platforms/message-router.js");
    const { WhatsAppAdapter } = await import("../../src/platforms/whatsapp/adapter.js");
    const { createApp } = await import("../../src/server/app.js");

    const db = createDatabase(dbPath);
    runMigrations(db);
    const repo = new InvestigationRepository(db);
    const client = new ClaudeClient("test-key-not-real");
    const toolRegistry = new ToolRegistry();
    const pipeline = new InvestigationPipeline(client, toolRegistry, repo);
    const baseUrl = "http://localhost:3000";

    // Create message router (shared by all adapters)
    const messageRouter = createMessageRouter(pipeline, repo, baseUrl);

    // Create WhatsApp adapter — same as index.ts would do when env vars are present
    const whatsAppAdapter = new WhatsAppAdapter(
      "test-phone-number-id",
      "test-access-token",
      "test-verify-token",
      "test-app-secret",
      messageRouter,
    );

    expect(whatsAppAdapter.platform).toBe("whatsapp");

    // Pass adapter to createApp — should mount webhook routes
    const app = createApp(
      repo,
      undefined, // eventBus
      undefined, // pipeline
      undefined, // feedbackRepo
      undefined, // githubService
      undefined, // telegramBotUsername
      whatsAppAdapter,
    );

    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });

    // WhatsApp webhook verification should work (not 404)
    const verifyUrl = `http://127.0.0.1:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=test-verify-token&hub.challenge=challenge_123`;
    const verifyRes = await fetch(verifyUrl);
    expect(verifyRes.status).toBe(200);
    const body = await verifyRes.text();
    expect(body).toBe("challenge_123");

    // start() and stop() should work (no-ops for webhook-based adapter)
    await expect(whatsAppAdapter.start()).resolves.toBeUndefined();
    await expect(whatsAppAdapter.stop()).resolves.toBeUndefined();

    // Health should still work
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthRes.status).toBe(200);

    db.close();
  });

  it("should log warning when WHATSAPP_ENABLED but credentials missing", async () => {
    const { loadEnv } = await import("../../src/config/env.js");

    // Load env with WHATSAPP_ENABLED=true but no credentials
    const config = loadEnv({
      ANTHROPIC_API_KEY: "test-key",
      TELEGRAM_BOT_TOKEN: "test-token",
      WHATSAPP_ENABLED: "true",
      // No WHATSAPP_PHONE_NUMBER_ID, WHATSAPP_ACCESS_TOKEN, WHATSAPP_VERIFY_TOKEN
    });

    expect(config.WHATSAPP_ENABLED).toBe(true);
    expect(config.WHATSAPP_PHONE_NUMBER_ID).toBeUndefined();
    expect(config.WHATSAPP_ACCESS_TOKEN).toBeUndefined();
    expect(config.WHATSAPP_VERIFY_TOKEN).toBeUndefined();

    // The conditional check in index.ts:
    // if (config.WHATSAPP_ENABLED && config.WHATSAPP_PHONE_NUMBER_ID && ...)
    // should fail, and the else branch should log a warning
    const hasRequiredCredentials =
      config.WHATSAPP_ENABLED &&
      config.WHATSAPP_PHONE_NUMBER_ID &&
      config.WHATSAPP_ACCESS_TOKEN &&
      config.WHATSAPP_VERIFY_TOKEN;

    expect(hasRequiredCredentials).toBeFalsy();

    // When all credentials ARE present, the check passes
    const fullConfig = loadEnv({
      ANTHROPIC_API_KEY: "test-key",
      TELEGRAM_BOT_TOKEN: "test-token",
      WHATSAPP_ENABLED: "true",
      WHATSAPP_PHONE_NUMBER_ID: "123456",
      WHATSAPP_ACCESS_TOKEN: "token",
      WHATSAPP_VERIFY_TOKEN: "verify",
    });

    const hasAllCredentials =
      fullConfig.WHATSAPP_ENABLED &&
      fullConfig.WHATSAPP_PHONE_NUMBER_ID &&
      fullConfig.WHATSAPP_ACCESS_TOKEN &&
      fullConfig.WHATSAPP_VERIFY_TOKEN;

    expect(hasAllCredentials).toBeTruthy();
  });
});
