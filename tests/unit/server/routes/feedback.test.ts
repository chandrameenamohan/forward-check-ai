import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { createApp } from "../../../../src/server/app.js";
import { createDatabase } from "../../../../src/db/connection.js";
import { runMigrations } from "../../../../src/db/migrations.js";
import { FeedbackRepository } from "../../../../src/db/feedback-repository.js";
import type { GitHubIssueService, CreateIssueResult } from "../../../../src/services/github-issues.js";
import type { Server } from "node:http";
import type Database from "better-sqlite3";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { unlinkSync } from "node:fs";

function createMockGitHubService(
  result?: CreateIssueResult,
): GitHubIssueService {
  return {
    createIssue: vi.fn().mockResolvedValue(
      result ?? {
        success: true,
        issueUrl: "https://github.com/test/repo/issues/42",
        issueNumber: 42,
      },
    ),
  } as unknown as GitHubIssueService;
}

describe("Feedback routes", () => {
  let server: Server | undefined;
  let db: Database.Database;
  let feedbackRepo: FeedbackRepository;
  let dbPath: string;

  beforeEach(() => {
    dbPath = join(tmpdir(), `test-feedback-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
    feedbackRepo = new FeedbackRepository(db);
  });

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
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

  function startServer(githubService?: GitHubIssueService): Promise<number> {
    return new Promise((resolve) => {
      const app = createApp(undefined, undefined, undefined, feedbackRepo, githubService);
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });
  }

  it("POST /api/feedback should create feedback and return 201", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bug",
        title: "Something is broken badly",
        description: "When I try to use the bot it crashes every time I send a message",
      }),
    });
    const body = (await res.json()) as { id: string; status: string };

    expect(res.status).toBe(201);
    expect(body.id).toBeDefined();
    expect(typeof body.id).toBe("string");
    expect(body.status).toBe("created");

    // Verify feedback was saved to DB
    const feedback = feedbackRepo.getById(body.id);
    expect(feedback).not.toBeNull();
    expect(feedback!.type).toBe("bug");
    expect(feedback!.title).toBe("Something is broken badly");
    expect(feedback!.source_channel).toBe("web");
  });

  it("POST /api/feedback should validate required fields", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("POST /api/feedback should reject title shorter than 5 chars", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bug",
        title: "Hi",
        description: "This is a valid description for testing",
      }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("POST /api/feedback should reject description shorter than 10 chars", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "feedback",
        title: "Valid title here",
        description: "Short",
      }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("POST /api/feedback should reject invalid type", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "complaint",
        title: "Valid title here",
        description: "This is a valid description for testing",
      }),
    });
    const body = (await res.json()) as { error: string };

    expect(res.status).toBe(400);
    expect(body.error).toBeDefined();
  });

  it("POST /api/feedback should return 201 even when GitHub service is unavailable", async () => {
    const failingGithub = createMockGitHubService({
      success: false,
      error: "GitHub API error: 500 Internal Server Error",
    });
    const port = await startServer(failingGithub);
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "bug",
        title: "Something is broken badly",
        description: "When I try to use the bot it crashes every time I send a message",
      }),
    });
    const body = (await res.json()) as { id: string; status: string; githubIssueUrl?: string };

    expect(res.status).toBe(201);
    expect(body.id).toBeDefined();
    expect(body.status).toBe("created");
    expect(body.githubIssueUrl).toBeUndefined();
  });

  it("POST /api/feedback should include githubIssueUrl when GitHub succeeds", async () => {
    const successGithub = createMockGitHubService();
    const port = await startServer(successGithub);
    const res = await fetch(`http://127.0.0.1:${port}/api/feedback`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        type: "feature",
        title: "Please add dark mode",
        description: "It would be great to have a dark mode option for the web interface",
      }),
    });
    const body = (await res.json()) as { id: string; status: string; githubIssueUrl?: string };

    expect(res.status).toBe(201);
    expect(body.githubIssueUrl).toBe("https://github.com/test/repo/issues/42");

    // Verify GitHub issue fields were updated in DB
    const feedback = feedbackRepo.getById(body.id);
    expect(feedback).not.toBeNull();
    expect(feedback!.github_issue_url).toBe("https://github.com/test/repo/issues/42");
    expect(feedback!.github_issue_number).toBe(42);
  });

  it("GET /feedback should return 200", async () => {
    const port = await startServer();
    const res = await fetch(`http://127.0.0.1:${port}/feedback`);

    expect(res.status).toBe(200);
    const text = await res.text();
    expect(text).toContain("html");
  });
});
