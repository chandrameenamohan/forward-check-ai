import { describe, it, expect, afterEach } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import type { Server } from "node:http";
import { randomUUID } from "node:crypto";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { unlinkSync } from "node:fs";

describe("Landing page routes", () => {
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

  it("GET / should return 200", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");
  });

  it("GET / should contain ForwardCheck in response body", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("ForwardCheck");
  });

  it("GET / should include design token CSS variables", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("--fc-bg");
    expect(html).toContain("--fc-surface");
    expect(html).toContain("--fc-text");
  });

  it("GET / should include Google Fonts and Bootstrap CDN links", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("bootstrap");
    expect(html).toContain("fonts.googleapis.com");
  });

  it("GET / should contain topbar with brand and GitHub link", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("ForwardCheck");
    expect(html).toContain("GitHub");
  });

  it("GET / should contain main element", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("<main");
  });

  it("GET / should contain hero headline text", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Lies travel fast");
    expect(html).toContain("The truth needs backup");
  });

  it("GET / should contain primary CTA link", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("t.me/forward_check_beta_bot");
    expect(html).toContain("Try it on Telegram");
  });

  it("GET / should contain secondary CTA link to live verdict", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("See a live verdict");
  });

  it("GET / should contain hero subheadline text", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Six AI agents");
    expect(html).toContain("manipulation hiding inside");
  });

  it("GET / should contain investigation demo element", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-demo");
    expect(html).toContain("fc-demo-message");
  });

  it("GET / should contain demo forwarded message text", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("NASA confirms Mars");
  });

  it("GET / should contain demo pipeline status steps", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Classifying");
    expect(html).toContain("Planning investigation");
    expect(html).toContain("Searching");
    expect(html).toContain("Challenging findings");
    expect(html).toContain("Rendering verdict");
  });

  it("GET / should contain demo verdict badge", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("LIKELY FALSE");
    expect(html).toContain("94%");
  });

  it("GET / should contain all 6 agent pipeline steps", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Classifier");
    expect(html).toContain("Strategist");
    expect(html).toContain("Investigators");
    expect(html).toContain("Devil");
    expect(html).toContain("Judge");
  });

  it("GET / should contain pipeline section with model tier badges", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Haiku");
    expect(html).toContain("Opus");
    expect(html).toContain("Sonnet");
  });

  it("GET / should contain pipeline section heading", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-pipeline");
    expect(html).toContain("When You Hit Forward");
  });

  it("GET / should contain feature cards section", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-features");
    expect(html).toContain("Not Just True or False");
  });

  it("GET / should contain all 3 feature cards with titles", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("See the Tricks");
    expect(html).toContain("Watch the Debate");
    expect(html).toContain("Four Scores, Not One");
  });

  it("GET / should contain feature card descriptions", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("emotional framing");
    expect(html).toContain("Devil");
    expect(html).toContain("evidence strength");
  });

  it("GET / should contain verdict preview section", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-verdict-preview");
    expect(html).toContain("Don't Take Our Word For It");
  });

  it("GET / should contain verdict preview with badge and confidence", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("LIKELY FALSE");
    expect(html).toContain("92%");
    expect(html).toContain("fc-verdict-preview-badge");
  });

  it("GET / should contain verdict preview summary text", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("No official government source confirms");
  });

  it("GET / should contain verdict preview CTA link", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Read the full analysis");
    expect(html).toContain("/v/demo");
  });

  it("GET / should contain Opus 4.6 showcase section", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-opus-showcase");
    expect(html).toContain("Three Brains");
  });

  it("GET / should contain 3-tier model strategy visual", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Haiku");
    expect(html).toContain("Sonnet");
    expect(html).toContain("Opus 4.6");
  });

  it("GET / should contain all 4 reasoning modes", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Strategic Planning");
    expect(html).toContain("Adversarial Challenge");
    expect(html).toContain("Tool-Augmented Verification");
    expect(html).toContain("Confidence Decomposition");
  });

  it("GET / should contain tech stack pills", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("TypeScript");
    expect(html).toContain("Grammy");
    expect(html).toContain("Express");
    expect(html).toContain("SQLite");
    expect(html).toContain("Zod");
    expect(html).toContain("Anthropic SDK");
  });

  it("GET / should contain Telegram CTA button", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-final-cta");
    expect(html).toContain("Open in Telegram");
    expect(html).toContain("t.me/forward_check_beta_bot");
  });

  it("GET / should contain final CTA headline", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Know Before You Share");
  });

  it("GET / should contain footer with hackathon attribution", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-footer");
    expect(html).toContain("Cerebral Valley");
    expect(html).toContain("Anthropic");
    expect(html).toContain("Claude Opus 4.6");
  });

  it("GET / should contain GitHub link in footer", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("View on GitHub");
  });

  it("GET / should include IntersectionObserver script", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("IntersectionObserver");
    expect(html).toContain("fc-animate");
  });

  it("GET / should include smooth scroll CSS", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("scroll-behavior: smooth");
  });

  it("GET / should have animatable sections with fc-animate class", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-animate");
    expect(html).toContain("fc-animate--visible");
  });

  it("GET / should have staggered animation delays on feature cards", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("fc-animate-stagger");
  });

  it("GET / should disable scroll animations for prefers-reduced-motion", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("prefers-reduced-motion");
    expect(html).toContain("fc-animate");
  });

  it("GET / should contain og:title meta tag", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain('og:title');
    expect(html).toContain('og:description');
    expect(html).toContain('og:image');
    expect(html).toContain('og:url');
  });

  it("GET / should contain twitter card meta tags", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain('twitter:card');
    expect(html).toContain('twitter:title');
    expect(html).toContain('twitter:description');
  });

  it("GET / should contain meta description", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain('name="description"');
    expect(html).toContain("fact-check");
  });

  it("GET / should contain favicon link", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain('rel="icon"');
    expect(html).toContain('image/svg+xml');
  });

  it("GET / should contain canonical URL", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain('rel="canonical"');
  });

  it("GET / should contain live verdict link when recent investigation exists", async () => {
    const dbPath = join(tmpdir(), `fc-landing-live-${randomUUID()}.db`);
    const db = createDatabase(dbPath);
    runMigrations(db);
    const repo = new InvestigationRepository(db);
    const id = repo.create("Test claim for landing page");

    const app = createApp(repo);
    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });

    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain(`/live/${id}`);

    db.close();
    try { unlinkSync(dbPath); } catch { /* ignore */ }
    try { unlinkSync(`${dbPath}-wal`); } catch { /* ignore */ }
    try { unlinkSync(`${dbPath}-shm`); } catch { /* ignore */ }
  });

  it("GET / should fallback to /v/demo when no recent investigation", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    // Secondary CTA should point to /v/demo as fallback
    expect(html).toContain("/v/demo");
  });

  // ── Task 7.2: Landing page CTA update — add "Check in Browser" button ──

  it("GET / should contain link to /chat", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain('href="/chat"');
  });

  it("GET / should contain Check in Your Browser CTA text", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain("Check in Your Browser");
  });

  // ── Task 7.1: Navigation links to feedback page ──

  it("GET / should contain feedback link in footer", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/`);
    const html = await res.text();

    expect(html).toContain('href="/feedback"');
    expect(html).toContain("Report a Bug");
    expect(html).toContain("fc-footer-link");
  });

});
