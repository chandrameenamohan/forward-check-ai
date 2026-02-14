import { describe, it, expect, afterEach, beforeEach } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { InvestigationRepository } from "../../../../src/db/investigation-repository.js";
import { PipelineEventBus } from "../../../../src/orchestrator/pipeline-events.js";
import {
  makeFinalVerdict,
  makeChallengeReport,
  makeAgentReport,
  makeClassifierResult,
  makeSearchStrategy,
} from "../../../fixtures/index.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";

describe("Live verdict page routes", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let repo: InvestigationRepository;
  let eventBus: PipelineEventBus;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-live-page-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
    repo = new InvestigationRepository(db);
    eventBus = new PipelineEventBus({
      historyTtlMs: 60_000,
      cleanupIntervalMs: 60_000,
    });
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    eventBus.destroy();
    if (db) {
      db.close();
    }
    try {
      unlinkSync(dbPath);
      unlinkSync(dbPath + "-wal");
      unlinkSync(dbPath + "-shm");
    } catch {
      // ignore missing files
    }
  });

  function startServer(): Promise<number> {
    return new Promise((resolve) => {
      const app = createApp(repo, eventBus);
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });
  }

  function seedCompletedInvestigation(): string {
    const id = repo.create("Test claim for live page");
    repo.updateClassifierResult(id, makeClassifierResult());
    repo.updateSearchStrategy(id, makeSearchStrategy());
    repo.updateAgentReports(id, [makeAgentReport()]);
    repo.updateChallengeReport(id, makeChallengeReport());
    repo.updateFinalVerdict(id, makeFinalVerdict(), 120000, 0.55);
    return id;
  }

  it("GET /live/:id should return 200 for pending investigation", async () => {
    const port = await startServer();
    const id = repo.create("Some pending claim");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toContain("text/html");

    const html = await res.text();
    expect(html).toContain("ForwardCheck");
    expect(html).toContain("Some pending claim");
  });

  it("GET /live/:id should redirect to /v/:id for completed investigation", async () => {
    const port = await startServer();
    const id = seedCompletedInvestigation();

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`, {
      redirect: "manual",
    });

    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(`/v/${id}`);
  });

  it("GET /live/:id should return 404 for non-existent id", async () => {
    const port = await startServer();

    const res = await fetch(`http://127.0.0.1:${port}/live/nonexistent-id`);

    expect(res.status).toBe(404);
  });

  it("GET /live/:id should contain SSE connection script", async () => {
    const port = await startServer();
    const id = repo.create("Claim for SSE test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("EventSource");
    expect(html).toContain("/api/live/");
    expect(html).toContain("/stream");
    // Verify the investigation ID is embedded for the SSE URL
    expect(html).toContain(id);
  });

  it("GET /live/:id should render for investigating status", async () => {
    const port = await startServer();
    const id = repo.create("Claim being investigated");
    repo.updateStatus(id, "investigating");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);

    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain("Claim being investigated");
  });

  it("GET /live/:id should include design system tokens", async () => {
    const port = await startServer();
    const id = repo.create("Design system test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("--fc-bg");
    expect(html).toContain("--fc-surface");
    expect(html).toContain("Satoshi");
  });

  it("GET /live/:id should have responsive viewport meta tag", async () => {
    const port = await startServer();
    const id = repo.create("Responsive test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain('name="viewport"');
    expect(html).toContain("width=device-width");
  });

  // ── Task 2.2: SSE client and event dispatcher ──

  it("GET /live/:id should contain event handler for pipeline:complete", async () => {
    const port = await startServer();
    const id = repo.create("Complete handler test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("pipeline:complete");
    expect(html).toContain("/v/");
  });

  it("GET /live/:id should contain event handlers for all pipeline stages", async () => {
    const port = await startServer();
    const id = repo.create("Event handler test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // All pipeline event types the client should handle
    expect(html).toContain("classifier:start");
    expect(html).toContain("classifier:complete");
    expect(html).toContain("strategist:start");
    expect(html).toContain("strategist:complete");
    expect(html).toContain("investigators:start");
    expect(html).toContain("investigator:complete");
    expect(html).toContain("da:start");
    expect(html).toContain("da:complete");
    expect(html).toContain("judge:start");
    expect(html).toContain("judge:complete");
    expect(html).toContain("pipeline:complete");
    expect(html).toContain("pipeline:error");
  });

  it("GET /live/:id should contain UI update functions for each agent", async () => {
    const port = await startServer();
    const id = repo.create("UI function test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("updateClassifier");
    expect(html).toContain("updateStrategist");
    expect(html).toContain("updateInvestigators");
    expect(html).toContain("updateDA");
    expect(html).toContain("updateJudge");
  });

  it("GET /live/:id should show connecting spinner on initial load", async () => {
    const port = await startServer();
    const id = repo.create("Spinner test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-connecting-spinner");
    expect(html).toContain("Connecting to investigation");
  });

  it("GET /live/:id should close EventSource on pipeline completion", async () => {
    const port = await startServer();
    const id = repo.create("Close test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // EventSource should be closed in both complete and error handlers
    expect(html).toContain("evtSource.close()");
  });

  // ── Task 3.1: Progress header and progress bar ──

  it("GET /live/:id should contain original message card", async () => {
    const port = await startServer();
    const id = repo.create("Claim to display in card");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-live-message");
    expect(html).toContain("Forwarded claim");
    expect(html).toContain("Claim to display in card");
  });

  it("GET /live/:id should contain progress bar with 6 segments", async () => {
    const port = await startServer();
    const id = repo.create("Progress bar test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-progress-bar");
    expect(html).toContain("fc-progress-segment");
    // 6 pipeline stages: classifier, strategist, investigators, DA, judge, verdict
    const segmentCount = (html.match(/fc-progress-segment"/g) || []).length;
    expect(segmentCount).toBe(6);
  });

  it("GET /live/:id should contain elapsed time counter", async () => {
    const port = await startServer();
    const id = repo.create("Timer test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-elapsed");
    expect(html).toContain("elapsedTimer");
  });

  it("GET /live/:id should contain cost tracker", async () => {
    const port = await startServer();
    const id = repo.create("Cost tracker test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-cost-tracker");
    expect(html).toContain("totalCost");
  });

  // ── Task 3.2: Classifier and Strategist agent cards ──

  it("GET /live/:id should contain classifier agent card", async () => {
    const port = await startServer();
    const id = repo.create("Classifier card test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-agent-card--classifier");
    expect(html).toContain("Classifier");
    // Should have brain/scan icon area
    expect(html).toContain("fc-agent-icon");
    // Should have idle state by default
    expect(html).toContain("fc-agent--idle");
  });

  it("GET /live/:id should contain strategist agent card", async () => {
    const port = await startServer();
    const id = repo.create("Strategist card test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-agent-card--strategist");
    expect(html).toContain("Strategist");
    // Should have idle state by default
    expect(html).toContain("fc-agent--idle");
  });

  it("GET /live/:id should contain model tier badges", async () => {
    const port = await startServer();
    const id = repo.create("Model badge test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("Haiku");
    expect(html).toContain("Opus 4.6");
    expect(html).toContain("fc-model-badge");
  });

  it("GET /live/:id should contain classifier status text placeholder", async () => {
    const port = await startServer();
    const id = repo.create("Classifier status text test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // JS function to update classifier card exists
    expect(html).toContain("updateClassifier");
    // Classifier status text container
    expect(html).toContain("fc-agent-status");
    // Classifier result area for category + claim
    expect(html).toContain("fc-agent-result");
  });

  it("GET /live/:id should contain strategist thinking excerpt area", async () => {
    const port = await startServer();
    const id = repo.create("Strategist thinking test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Should have thinking excerpt container
    expect(html).toContain("fc-agent-thinking");
    expect(html).toContain("AI Reasoning");
  });

  it("GET /live/:id should contain connecting line between cards", async () => {
    const port = await startServer();
    const id = repo.create("Connecting line test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-connector-line");
  });

  // ── Task 3.3: Investigator cards — parallel visualization ──

  it("GET /live/:id should contain 3 investigator cards", async () => {
    const port = await startServer();
    const id = repo.create("Investigator cards test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-agent-card--investigator-source");
    expect(html).toContain("fc-agent-card--investigator-domain");
    expect(html).toContain("fc-agent-card--investigator-pattern");
    // All 3 should be in a horizontal row container
    expect(html).toContain("fc-investigator-row");
  });

  it("GET /live/:id should contain investigator role labels", async () => {
    const port = await startServer();
    const id = repo.create("Investigator labels test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("Source Verification");
    expect(html).toContain("Domain Expertise");
    expect(html).toContain("Pattern Matching");
    // All should have Sonnet badges
    expect(html).toContain("fc-model-badge--sonnet");
  });

  it("GET /live/:id should contain investigator Sonnet badges", async () => {
    const port = await startServer();
    const id = repo.create("Investigator badges test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Count Sonnet badge occurrences (at least 3 for investigators)
    const sonnetCount = (html.match(/fc-model-badge--sonnet/g) || []).length;
    expect(sonnetCount).toBeGreaterThanOrEqual(3);
  });

  it("GET /live/:id should contain disagreement detection area", async () => {
    const port = await startServer();
    const id = repo.create("Disagreement test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Disagreement alert container should exist (hidden by default)
    expect(html).toContain("fc-disagreement-alert");
    // JS handler for disagreement
    expect(html).toContain("disagreement");
  });

  it("GET /live/:id should contain investigator confidence score area", async () => {
    const port = await startServer();
    const id = repo.create("Investigator confidence test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Each card should have a confidence score container
    expect(html).toContain("fc-investigator-confidence");
    // Each card should have a search query display area
    expect(html).toContain("fc-investigator-search");
  });

  // ── Task 3.4: Devil's Advocate card with thinking visualization ──

  it("GET /live/:id should contain devils advocate card", async () => {
    const port = await startServer();
    const id = repo.create("DA card test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-agent-card--da");
    expect(html).toContain("Devil&#x27;s Advocate");
    expect(html).toContain("fc-model-badge--opus");
    // Should start in idle state
    expect(html).toContain("fc-agent--idle");
    // Should have the updateDA function
    expect(html).toContain("updateDA");
  });

  it("GET /live/:id should contain deep reasoning indicator placeholder", async () => {
    const port = await startServer();
    const id = repo.create("Deep reasoning test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Deep reasoning badge container should exist (hidden by default)
    expect(html).toContain("fc-da-deep-reasoning");
    expect(html).toContain("Deep Reasoning");
    // DA thinking excerpt area
    expect(html).toContain("fc-da-thinking");
  });

  it("GET /live/:id should contain DA outcome display area", async () => {
    const port = await startServer();
    const id = repo.create("DA outcome test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Outcome badge area for succeeded/failed counter-argument
    expect(html).toContain("fc-da-outcome");
    // DA card should have a connector line before it
    expect(html).toContain("fc-connector-line");
  });

  // ── Task 3.5: Verdict reveal moment ──

  it("GET /live/:id should contain judge agent card", async () => {
    const port = await startServer();
    const id = repo.create("Judge card test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("fc-agent-card--judge");
    expect(html).toContain("Judge");
    expect(html).toContain("fc-model-badge--opus");
    // Should start in idle state
    expect(html).toContain("fc-agent--idle");
  });

  it("GET /live/:id should contain verdict reveal container", async () => {
    const port = await startServer();
    const id = repo.create("Verdict reveal test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Verdict reveal overlay (hidden by default)
    expect(html).toContain("fc-verdict-reveal");
    // Verdict badge area
    expect(html).toContain("fc-verdict-reveal-badge");
    // Confidence ring
    expect(html).toContain("fc-verdict-reveal-ring");
    // Summary text area
    expect(html).toContain("fc-verdict-reveal-summary");
    // Confidence decomposition bars
    expect(html).toContain("fc-verdict-reveal-bars");
    // CTA button to full analysis
    expect(html).toContain("Read the Full Analysis");
  });

  it("GET /live/:id should contain redirect countdown", async () => {
    const port = await startServer();
    const id = repo.create("Redirect countdown test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Countdown text element
    expect(html).toContain("fc-verdict-countdown");
    // Stay on page link
    expect(html).toContain("Stay on this page");
    // Redirect logic in JS
    expect(html).toContain("cancelRedirect");
  });

  it("GET /live/:id should contain verdict reveal animation keyframes", async () => {
    const port = await startServer();
    const id = repo.create("Verdict animation test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    // Verdict reveal animations
    expect(html).toContain("fc-reveal-badge-in");
    expect(html).toContain("fc-reveal-ring-draw");
  });

  it("GET /live/:id should respect prefers-reduced-motion for verdict reveal", async () => {
    const port = await startServer();
    const id = repo.create("Reduced motion verdict test");

    const res = await fetch(`http://127.0.0.1:${port}/live/${id}`);
    const html = await res.text();

    expect(html).toContain("prefers-reduced-motion");
  });
});
