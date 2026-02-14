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

  // ── Task 4.2: Confidence decomposition bars and verdict summary ──

  it("GET /chat should contain decomposition bar elements", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // 4 decomposition bars
    expect(html).toContain("fc-reveal-bar-evidence");
    expect(html).toContain("fc-reveal-bar-source");
    expect(html).toContain("fc-reveal-bar-complexity");
    expect(html).toContain("fc-reveal-bar-counter");
    // Labels
    expect(html).toContain("Evidence Strength");
    expect(html).toContain("Source Reliability");
    expect(html).toContain("Claim Complexity");
    expect(html).toContain("Counter-Argument");
    // Summary element
    expect(html).toContain("fc-verdict-reveal-summary");
  });

  it("GET /chat should contain manipulation techniques section", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-verdict-techniques");
    expect(html).toContain("manipulationTechniques");
  });

  // ── Task 4.3: Action buttons — View Full Analysis, Check Another Claim, Share ──

  it("GET /chat should contain See the Full Breakdown link", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-chat-action-full");
    expect(html).toContain("See the Full Breakdown");
  });

  it("GET /chat should contain Check Another Claim button", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-chat-action-reset");
    expect(html).toContain("Check Another Claim");
  });

  it("GET /chat should contain Share This Verdict button", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-chat-action-share");
    expect(html).toContain("Share This Verdict");
  });

  // ── Task 4.1: Verdict reveal animation and badge display ──

  it("GET /chat should contain verdict reveal section", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-verdict-reveal");
    expect(html).toContain("fc-verdict-reveal-pause");
    expect(html).toContain("fc-verdict-reveal-badge");
    expect(html).toContain("showVerdictReveal");
  });

  it("GET /chat should contain confidence ring SVG", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-reveal-ring-fill");
    expect(html).toContain("fc-verdict-reveal-confidence");
    expect(html).toContain('viewBox="0 0 140 140"');
    expect(html).toContain("strokeDasharray");
  });

  it("GET /chat should contain verdict badge color classes", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("CATEGORY_COLORS");
    expect(html).toContain("likely-true");
    expect(html).toContain("likely-false");
    expect(html).toContain("partially-true");
    expect(html).toContain("unverified");
    expect(html).toContain("satire");
    expect(html).toContain("opinion");
  });

  // ── Task 5.1: Error states — empty input, timeout, rate limit, network drop ──

  it("GET /chat should contain error display elements", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    expect(html).toContain("fc-chat-error");
    expect(html).toContain('role="alert"');
    expect(html).toContain("fc-chat-input-area--error");
    expect(html).toContain("fc-chat-shake");
  });

  it("GET /chat should contain rate limit error message template", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Rate limit handling with Retry-After header and seconds countdown
    expect(html).toContain("429");
    expect(html).toContain("Retry-After");
    expect(html).toContain("too many claims");
    expect(html).toContain("Take a breath");
  });

  it("GET /chat should contain network error message template", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Network error message and retry capability
    expect(html).toContain("Lost connection");
    expect(html).toContain("try again");
  });

  it("GET /chat should contain pipeline timeout detection", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Timeout detection after 120s of no SSE events
    expect(html).toContain("pipelineTimeout");
    expect(html).toContain("120");
    expect(html).toContain("taking longer than expected");
  });

  it("GET /chat should contain SSE reconnection handling", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // SSE connection drop and reconnection
    expect(html).toContain("Connection dropped");
    expect(html).toContain("Reconnecting");
    expect(html).toContain("evtSource.onerror");
    expect(html).toContain("evtSource.onopen");
  });

  // ── Task 5.2: Non-factual message handling — opinion, scam, greeting ──

  it("GET /chat should contain non-factual response templates", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Non-factual response card element
    expect(html).toContain("fc-chat-nonfactual");
    // Category-specific response messages
    expect(html).toContain("NON_FACTUAL_MESSAGES");
    // Check Another Claim button should be present
    expect(html).toContain("Check Another Claim");
  });

  it("GET /chat should contain opinion category handler", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Opinion category detection and response
    expect(html).toContain("opinion");
    expect(html).toContain("not a fact");
  });

  it("GET /chat should contain greeting category handler", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Greeting category detection and response
    expect(html).toContain("greeting");
    expect(html).toContain("Investigate This");
  });

  // ── Task 5.3: SSE fallback — polling for browsers without EventSource ──

  it("GET /chat should contain EventSource availability check", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Must check if EventSource is available before using it
    expect(html).toContain("typeof EventSource");
    expect(html).toContain("undefined");
  });

  it("GET /chat should contain polling fallback code", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Polling fallback with fetch to investigation status endpoint
    expect(html).toContain("pollInvestigation");
    expect(html).toContain("/api/investigation/");
    // Should show a banner when falling back to polling
    expect(html).toContain("Real-time updates unavailable");
  });

  it("GET /chat should contain polling interval of 3000ms", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Polling interval should be 3 seconds (3000ms)
    expect(html).toContain("3000");
    // Polling timeout should be 3 minutes
    expect(html).toContain("POLL_TIMEOUT");
  });

  // ── Task 6.1: Mobile layout (375px) — sticky input, vertical timeline ──

  it("GET /chat should include mobile responsive styles", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Must have both mobile breakpoints
    expect(html).toContain("max-width: 768px");
    expect(html).toContain("max-width: 375px");
    // iOS safe area inset for bottom input
    expect(html).toContain("safe-area-inset-bottom");
    // Touch-friendly minimum tap target
    expect(html).toContain("min-height: 44px");
  });

  it("GET /chat should include sticky input position for mobile", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/chat`);
    const html = await res.text();
    // Sticky input at bottom on mobile
    expect(html).toContain("position: sticky");
    expect(html).toContain("bottom: 0");
  });
});
