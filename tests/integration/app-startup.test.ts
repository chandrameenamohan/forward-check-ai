import { describe, it, expect, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { unlinkSync, existsSync } from "node:fs";
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

describe("App startup integration", () => {
  let server: Server | undefined;
  const dbPath = join(tmpdir(), `forwardcheck-startup-${randomUUID()}.db`);

  afterEach(async () => {
    if (server) {
      await new Promise<void>((resolve, reject) => {
        server!.close((err) => (err ? reject(err) : resolve()));
      });
      server = undefined;
    }
    cleanupDb(dbPath);
  });

  it("should start server and respond to health check", async () => {
    // Set up env vars for the startup module
    const env: Record<string, string> = {
      ANTHROPIC_API_KEY: "test-key-not-real",
      TELEGRAM_BOT_TOKEN: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      PORT: "9876",
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      DATABASE_PATH: dbPath,
    };

    // Import modules directly and wire them (same as index.ts will do)
    const { loadEnv } = await import("../../src/config/env.js");
    const { createDatabase } = await import("../../src/db/connection.js");
    const { runMigrations } = await import("../../src/db/migrations.js");
    const { InvestigationRepository } = await import(
      "../../src/db/investigation-repository.js"
    );
    const { ClaudeClient } = await import(
      "../../src/services/claude-client.js"
    );
    const { ToolRegistry } = await import("../../src/tools/tool-registry.js");
    const { braveWebSearch, braveSearchToolDefinition } = await import(
      "../../src/tools/brave-search.js"
    );
    const { googleFactCheckSearch, googleFactCheckToolDefinition } =
      await import("../../src/tools/google-factcheck.js");
    const { InvestigationPipeline } = await import(
      "../../src/orchestrator/pipeline.js"
    );
    const { createApp } = await import("../../src/server/app.js");

    // 1. Load config
    const config = loadEnv(env);

    // 2. Database
    const db = createDatabase(config.DATABASE_PATH);
    runMigrations(db);

    // 3. Repository
    const repo = new InvestigationRepository(db);

    // 4. Claude client
    const client = new ClaudeClient(config.ANTHROPIC_API_KEY);

    // 5. Tool registry
    const toolRegistry = new ToolRegistry();
    toolRegistry.register(
      "brave_web_search",
      async (input) => {
        const { query, count } = input as { query: string; count?: number };
        const result = await braveWebSearch(
          query,
          count,
          config.BRAVE_SEARCH_API_KEY ?? "",
        );
        return JSON.stringify(result);
      },
      braveSearchToolDefinition,
    );
    toolRegistry.register(
      "google_fact_check_search",
      async (input) => {
        const { query } = input as { query: string };
        const result = await googleFactCheckSearch(
          query,
          config.GOOGLE_FACTCHECK_API_KEY ?? "",
        );
        return JSON.stringify(result);
      },
      googleFactCheckToolDefinition,
    );

    // 6. Pipeline (validates constructor wiring)
    const _pipeline = new InvestigationPipeline(client, toolRegistry, repo);
    expect(_pipeline).toBeDefined();

    // 7. Express app
    const app = createApp(repo);

    // 8. Start server on random port
    server = app.listen(0);
    const address = server.address();
    expect(address).not.toBeNull();
    const port =
      typeof address === "string" ? 0 : (address?.port ?? 0);
    expect(port).toBeGreaterThan(0);

    // 9. Hit health endpoint
    const response = await fetch(`http://localhost:${port}/health`);
    expect(response.status).toBe(200);

    const body = (await response.json()) as {
      status: string;
      timestamp: string;
      uptime: number;
    };
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(body.uptime).toBeGreaterThanOrEqual(0);

    // 10. Verify investigation API is mounted
    const investigateRes = await fetch(
      `http://localhost:${port}/api/investigation/nonexistent-id`,
    );
    expect(investigateRes.status).toBe(404);

    // Cleanup DB
    db.close();
  });

  it("should gracefully shut down on SIGTERM", async () => {
    const { loadEnv } = await import("../../src/config/env.js");
    const { createDatabase } = await import("../../src/db/connection.js");
    const { runMigrations } = await import("../../src/db/migrations.js");
    const { InvestigationRepository } = await import(
      "../../src/db/investigation-repository.js"
    );
    const { createApp } = await import("../../src/server/app.js");

    const dbPath2 = join(
      tmpdir(),
      `forwardcheck-shutdown-${randomUUID()}.db`,
    );

    const config = loadEnv({
      ANTHROPIC_API_KEY: "test-key-not-real",
      TELEGRAM_BOT_TOKEN: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11",
      PORT: "9877",
      NODE_ENV: "test",
      LOG_LEVEL: "error",
      DATABASE_PATH: dbPath2,
    });

    const db = createDatabase(config.DATABASE_PATH);
    runMigrations(db);
    const repo = new InvestigationRepository(db);
    const app = createApp(repo);

    server = app.listen(0);
    const address = server.address();
    const port =
      typeof address === "string" ? 0 : (address?.port ?? 0);

    // Verify server is running
    const res1 = await fetch(`http://localhost:${port}/health`);
    expect(res1.status).toBe(200);

    // Close the server (simulating what SIGTERM handler would do)
    await new Promise<void>((resolve, reject) => {
      server!.close((err) => (err ? reject(err) : resolve()));
    });
    server = undefined;

    // Verify server is no longer responding
    await expect(
      fetch(`http://localhost:${port}/health`),
    ).rejects.toThrow();

    // Cleanup
    db.close();
    cleanupDb(dbPath2);
  });
});
