import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import type { Server } from "node:http";

describe("Chat page — GET /chat", () => {
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

  it("GET /chat should return 200", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    expect(res.status).toBe(200);
  });

  it("GET /chat should contain ForwardCheck in response body", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("ForwardCheck");
  });

  it("GET /chat should include design token CSS variables", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("--fc-bg");
    expect(html).toContain("--fc-surface");
    expect(html).toContain("--fc-border");
    expect(html).toContain("--fc-text");
  });
});
