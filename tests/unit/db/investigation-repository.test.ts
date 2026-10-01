import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { existsSync, unlinkSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import type Database from "better-sqlite3";

describe("InvestigationRepository", () => {
  let db: Database.Database;
  let dbPath: string;

  beforeEach(async () => {
    const { createDatabase } = await import("../../../src/db/connection.js");
    const { runMigrations } = await import("../../../src/db/migrations.js");

    const dir = join(tmpdir(), "forwardcheck-test");
    mkdirSync(dir, { recursive: true });
    dbPath = join(dir, `test-${randomUUID()}.db`);
    db = createDatabase(dbPath);
    runMigrations(db);
  });

  afterEach(() => {
    try {
      db.close();
    } catch {
      // Ignore close errors
    }
    try {
      if (existsSync(dbPath)) unlinkSync(dbPath);
      if (existsSync(`${dbPath}-wal`)) unlinkSync(`${dbPath}-wal`);
      if (existsSync(`${dbPath}-shm`)) unlinkSync(`${dbPath}-shm`);
    } catch {
      // Ignore cleanup errors
    }
  });

  it("should create investigation and return nanoid", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message");

    expect(id).toBeTypeOf("string");
    expect(id.length).toBeGreaterThan(0);
    // nanoid default length is 21
    expect(id.length).toBe(21);
  });

  it("should retrieve investigation by id", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message", {
      platform: "telegram",
      platformChatId: "chat-123",
      platformMessageId: "msg-456",
    });
    const investigation = repo.getById(id);

    expect(investigation).not.toBeNull();
    expect(investigation?.id).toBe(id);
    expect(investigation?.original_message).toBe("Test claim message");
    expect(investigation?.status).toBe("pending");
    expect(investigation?.telegram_chat_id).toBe("chat-123");
    expect(investigation?.telegram_message_id).toBe("msg-456");
    expect(investigation?.created_at).toBeTypeOf("string");
    expect(investigation?.total_cost_usd).toBe(0);
  });

  it("should return null for non-existent id", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const investigation = repo.getById("non-existent-id");

    expect(investigation).toBeNull();
  });

  it("should update status", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message");
    repo.updateStatus(id, "investigating");

    const investigation = repo.getById(id);
    expect(investigation?.status).toBe("investigating");
  });

  it("should update final verdict with duration and cost", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message");
    const verdict = {
      category: "likely-false",
      confidence: 25,
      summary: "This claim is false",
    };
    repo.updateFinalVerdict(id, verdict, 5000, 0.12);

    const investigation = repo.getById(id);
    expect(investigation?.final_verdict).toEqual(verdict);
    expect(investigation?.pipeline_duration_ms).toBe(5000);
    expect(investigation?.total_cost_usd).toBe(0.12);
    expect(investigation?.status).toBe("completed");
    expect(investigation?.completed_at).toBeTypeOf("string");
  });

  it("should list recent investigations", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    repo.create("Claim 1");
    repo.create("Claim 2");
    repo.create("Claim 3");

    const recent = repo.getRecent(2);
    expect(recent).toHaveLength(2);
    // Most recent first
    expect(recent[0]?.original_message).toBe("Claim 3");
    expect(recent[1]?.original_message).toBe("Claim 2");
  });

  it("should update classifier result", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message");
    const classifierResult = {
      category: "factual_claim",
      extractedClaim: "Test claim",
    };
    repo.updateClassifierResult(id, classifierResult);

    const investigation = repo.getById(id);
    expect(investigation?.classifier_result).toEqual(classifierResult);
  });

  it("should update search strategy", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message");
    const strategy = { queries: ["query1", "query2"] };
    repo.updateSearchStrategy(id, strategy);

    const investigation = repo.getById(id);
    expect(investigation?.search_strategy).toEqual(strategy);
  });

  it("should update agent reports", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message");
    const reports = [
      { agentRole: "source_verification", summary: "Found sources" },
      { agentRole: "domain_expertise", summary: "Domain analysis" },
    ];
    repo.updateAgentReports(id, reports);

    const investigation = repo.getById(id);
    expect(investigation?.agent_reports).toEqual(reports);
  });

  it("should update challenge report", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Test claim message");
    const challengeReport = {
      counterArgumentSucceeded: false,
      overallAssessment: "No strong counter-argument",
    };
    repo.updateChallengeReport(id, challengeReport);

    const investigation = repo.getById(id);
    expect(investigation?.challenge_report).toEqual(challengeReport);
  });

  it("should store and retrieve source_url", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create(
      "Check this: https://example.com/article",
      { sourceUrl: "https://example.com/article" },
    );
    const investigation = repo.getById(id);

    expect(investigation).not.toBeNull();
    expect(investigation?.source_url).toBe("https://example.com/article");
  });

  it("should default source_url to null", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Plain text claim without URL");
    const investigation = repo.getById(id);

    expect(investigation).not.toBeNull();
    expect(investigation?.source_url).toBeNull();
  });

  it("should update source_url via updateSourceUrl method", async () => {
    const { InvestigationRepository } = await import(
      "../../../src/db/investigation-repository.js"
    );
    const repo = new InvestigationRepository(db);

    const id = repo.create("Some claim");
    // Initially null
    let investigation = repo.getById(id);
    expect(investigation?.source_url).toBeNull();

    // Update source_url
    repo.updateSourceUrl(id, "https://example.com/news/article-123");
    investigation = repo.getById(id);
    expect(investigation?.source_url).toBe(
      "https://example.com/news/article-123",
    );
  });

  it("should mark investigations a dead process left running as failed and say whose they were", async () => {
    const { InvestigationRepository } = await import("../../../src/db/investigation-repository.js");
    const repo = new InvestigationRepository(db);
    const pending = repo.create("never started", { platform: "web" });
    const running = repo.create("was running", { platform: "whatsapp", platformChatId: "15551234567" });
    repo.updateStatus(running, "investigating");
    const done = repo.create("finished");
    repo.updateFinalVerdict(done, { category: "likely-false" }, 10, 0.1);

    const interrupted = repo.failInterrupted();

    expect(interrupted.map((row) => row.id).sort()).toEqual([pending, running].sort());
    expect(interrupted.find((row) => row.id === running)).toMatchObject({ platform: "whatsapp", chatId: "15551234567" });
    expect(repo.getById(pending)?.status).toBe("failed");
    expect(repo.getById(running)?.status).toBe("failed");
    expect(repo.getById(done)?.status).toBe("completed");
  });

  it("should know a platform message that already has an investigation", async () => {
    const { InvestigationRepository } = await import("../../../src/db/investigation-repository.js");
    const repo = new InvestigationRepository(db);
    repo.create("a claim", { platform: "whatsapp", platformChatId: "15551234567", platformMessageId: "wamid.1" });

    expect(repo.hasPlatformMessage("whatsapp", "15551234567", "wamid.1")).toBe(true);
    expect(repo.hasPlatformMessage("whatsapp", "15551234567", "wamid.2")).toBe(false);
    expect(repo.hasPlatformMessage("telegram", "15551234567", "wamid.1")).toBe(false);
  });

  it("should copy a finished investigation's results onto the row of a repeated claim", async () => {
    const { InvestigationRepository } = await import("../../../src/db/investigation-repository.js");
    const repo = new InvestigationRepository(db);
    const first = repo.create("a claim");
    repo.updateAgentReports(first, [{ agentRole: "source_verification" }]);
    repo.updateFinalVerdict(first, { category: "likely-false", confidence: 5 }, 1000, 0.5);
    const second = repo.create("a claim");

    repo.copyResults(first, second);

    const copy = repo.getById(second);
    expect(copy?.status).toBe("completed");
    expect(copy?.final_verdict).toEqual({ category: "likely-false", confidence: 5 });
    expect(copy?.agent_reports).toEqual([{ agentRole: "source_verification" }]);
    expect(copy?.completed_at).not.toBeNull();
    expect(copy?.total_cost_usd).toBe(0);
  });
});
