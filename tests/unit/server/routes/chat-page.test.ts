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

  // ── Task 3.1: SSE client connection and event handling ──

  it("GET /chat should contain EventSource connection code", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("new EventSource(");
    expect(html).toContain("/api/live/");
    expect(html).toContain("/stream");
  });

  it("GET /chat should handle all pipeline event types", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // All 15 event types must have addEventListener registrations
    const eventTypes = [
      "pipeline:start",
      "classifier:start",
      "classifier:complete",
      "strategist:start",
      "strategist:complete",
      "investigators:start",
      "investigator:searching",
      "investigator:complete",
      "disagreement:detected",
      "da:start",
      "da:complete",
      "judge:start",
      "judge:complete",
      "pipeline:complete",
      "pipeline:error",
    ];
    for (const evt of eventTypes) {
      expect(html).toContain(`'${evt}'`);
    }
  });

  it("GET /chat should include elapsed time counter", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-elapsed");
    expect(html).toContain("elapsedTimer");
    expect(html).toContain("elapsedSeconds");
  });

  // ── Task 3.2: Investigation timeline component ──

  it("GET /chat should contain timeline stage elements", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // All 6 agent cards present (Classifier, Strategist, 3 Investigators, DA, Judge)
    expect(html).toContain("fc-card-classifier");
    expect(html).toContain("fc-card-strategist");
    expect(html).toContain("fc-card-inv-source");
    expect(html).toContain("fc-card-inv-domain");
    expect(html).toContain("fc-card-inv-pattern");
    expect(html).toContain("fc-card-da");
    expect(html).toContain("fc-card-judge");
    // Original claim quote card
    expect(html).toContain("fc-chat-claim-text");
    expect(html).toContain("fc-live-message");
  });

  it("GET /chat should contain progress bar segments", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // 6 progress segments
    expect(html).toContain("fc-seg-classify");
    expect(html).toContain("fc-seg-strategize");
    expect(html).toContain("fc-seg-investigate");
    expect(html).toContain("fc-seg-challenge");
    expect(html).toContain("fc-seg-judge");
    expect(html).toContain("fc-seg-verdict");
    // Progress label text
    expect(html).toContain("Classify");
    expect(html).toContain("Strategize");
    expect(html).toContain("Investigate");
    expect(html).toContain("Challenge");
    expect(html).toContain("Verdict");
  });

  it("GET /chat should contain model tier badges", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Model badges for all 3 tiers
    expect(html).toContain("fc-model-badge--haiku");
    expect(html).toContain("fc-model-badge--sonnet");
    expect(html).toContain("fc-model-badge--opus");
    expect(html).toContain("Haiku");
    expect(html).toContain("Sonnet");
    expect(html).toContain("Opus 4.6");
  });

  // ── Task 3.3: Real-time agent cards — show findings as investigators complete ──

  it("GET /chat should contain setCardState helper function", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("function setCardState(");
    expect(html).toContain("fc-agent--idle");
    expect(html).toContain("fc-agent--active");
    expect(html).toContain("fc-agent--complete");
    expect(html).toContain("fc-card-entering");
  });

  it("GET /chat should contain escapeHtml helper function", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("function escapeHtml(");
    expect(html).toContain("createTextNode");
  });

  it("GET /chat should contain status cycling functions", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("function startStatusCycle(");
    expect(html).toContain("function stopStatusCycle(");
    expect(html).toContain("statusCyclers");
  });
});
