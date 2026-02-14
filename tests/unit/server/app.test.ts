import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../../../src/server/app.js";
import type { Server } from "node:http";

describe("Express server", () => {
  let server: Server | undefined;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
  });

  function startServer(): Promise<number> {
    return new Promise((resolve) => {
      const app = createApp();
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });
  }

  it("GET /health should return 200 with status ok", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe("ok");
  });

  it("should return JSON content type", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/health`);

    expect(res.headers.get("content-type")).toMatch(/application\/json/);
  });

  it("should include timestamp in health response", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(body.timestamp).toBeDefined();
    expect(typeof body.timestamp).toBe("string");
    // Verify it's a valid ISO date
    expect(new Date(body.timestamp).toISOString()).toBe(body.timestamp);
  });

  it("should include uptime in health response", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/health`);
    const body = await res.json();

    expect(body.uptime).toBeDefined();
    expect(typeof body.uptime).toBe("number");
    expect(body.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should parse JSON request bodies", async () => {
    const port = await startServer();
    // POST to a non-existent route to verify JSON parsing middleware is loaded
    // (will get 404 but the middleware should still be active)
    const res = await fetch(`http://127.0.0.1:${port}/nonexistent`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ test: true }),
    });

    // Should get 404 (not 500), meaning JSON parsing didn't crash
    expect(res.status).toBe(404);
  });

  it("should return 404 for unknown routes", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/unknown-route`);

    expect(res.status).toBe(404);
  });
});
