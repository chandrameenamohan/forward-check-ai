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

  it("GET /chat should include fc-chat-wrapper class", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-chat-wrapper");
  });

  it("GET /chat should include glass-morphism backdrop-filter styles", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("backdrop-filter");
    expect(html).toContain("blur(");
  });

  it("GET /chat should contain textarea with placeholder text", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("<textarea");
    expect(html).toContain("Paste a message that seems off");
  });

  it("GET /chat should contain Investigate This submit button", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("Investigate This");
    expect(html).toContain('type="submit"');
  });

  it("GET /chat should contain character counter element", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-chat-counter");
    expect(html).toContain("5,000");
  });

  // ── Task 2.2: Form submission handler ──

  it("GET /chat should include _chat-script.ejs JavaScript", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Script should contain the submission handler function
    expect(html).toContain("handleSubmit");
    expect(html).toContain("fc-chat-error");
  });

  it("GET /chat should contain fetch call to /api/chat/message", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("/api/chat/message");
    expect(html).toContain("fetch(");
  });

  it("GET /chat should contain error display elements", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-chat-error");
  });
});
