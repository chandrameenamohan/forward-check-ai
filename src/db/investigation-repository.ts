import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

/** Row shape as stored in SQLite (JSON columns are strings). */
interface InvestigationRow {
  id: string;
  original_message: string;
  extracted_claim: string | null;
  status: string;
  classifier_result: string | null;
  search_strategy: string | null;
  agent_reports: string | null;
  challenge_report: string | null;
  final_verdict: string | null;
  telegram_chat_id: string | null;
  telegram_message_id: string | null;
  created_at: string;
  completed_at: string | null;
  total_cost_usd: number;
  pipeline_duration_ms: number | null;
  source_url: string | null;
}

/** Parsed investigation with JSON fields deserialized. */
export interface Investigation {
  id: string;
  original_message: string;
  extracted_claim: string | null;
  status: string;
  classifier_result: unknown;
  search_strategy: unknown;
  agent_reports: unknown;
  challenge_report: unknown;
  final_verdict: unknown;
  telegram_chat_id: string | null;
  telegram_message_id: string | null;
  created_at: string;
  completed_at: string | null;
  total_cost_usd: number;
  pipeline_duration_ms: number | null;
  source_url: string | null;
}

function parseJsonColumn(value: string | null): unknown {
  if (value === null) return null;
  try {
    return JSON.parse(value) as unknown;
  } catch {
    return null;
  }
}

function toInvestigation(row: InvestigationRow): Investigation {
  return {
    id: row.id,
    original_message: row.original_message,
    extracted_claim: row.extracted_claim,
    status: row.status,
    classifier_result: parseJsonColumn(row.classifier_result),
    search_strategy: parseJsonColumn(row.search_strategy),
    agent_reports: parseJsonColumn(row.agent_reports),
    challenge_report: parseJsonColumn(row.challenge_report),
    final_verdict: parseJsonColumn(row.final_verdict),
    telegram_chat_id: row.telegram_chat_id,
    telegram_message_id: row.telegram_message_id,
    created_at: row.created_at,
    completed_at: row.completed_at,
    total_cost_usd: row.total_cost_usd,
    pipeline_duration_ms: row.pipeline_duration_ms,
    source_url: row.source_url ?? null,
  };
}

export class InvestigationRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(
    originalMessage: string,
    telegramChatId?: string,
    telegramMessageId?: string,
    sourceUrl?: string,
  ): string {
    const id = nanoid();
    this.db
      .prepare(
        `INSERT INTO investigations (id, original_message, telegram_chat_id, telegram_message_id, source_url)
         VALUES (?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        originalMessage,
        telegramChatId ?? null,
        telegramMessageId ?? null,
        sourceUrl ?? null,
      );
    return id;
  }

  getById(id: string): Investigation | null {
    const row = this.db
      .prepare("SELECT * FROM investigations WHERE id = ?")
      .get(id) as InvestigationRow | undefined;
    if (!row) return null;
    return toInvestigation(row);
  }

  updateSourceUrl(id: string, sourceUrl: string): void {
    this.db
      .prepare("UPDATE investigations SET source_url = ? WHERE id = ?")
      .run(sourceUrl, id);
  }

  updateStatus(id: string, status: string): void {
    this.db
      .prepare("UPDATE investigations SET status = ? WHERE id = ?")
      .run(status, id);
  }

  updateClassifierResult(id: string, result: unknown): void {
    this.db
      .prepare("UPDATE investigations SET classifier_result = ? WHERE id = ?")
      .run(JSON.stringify(result), id);
  }

  updateSearchStrategy(id: string, strategy: unknown): void {
    this.db
      .prepare("UPDATE investigations SET search_strategy = ? WHERE id = ?")
      .run(JSON.stringify(strategy), id);
  }

  updateAgentReports(id: string, reports: unknown): void {
    this.db
      .prepare("UPDATE investigations SET agent_reports = ? WHERE id = ?")
      .run(JSON.stringify(reports), id);
  }

  updateChallengeReport(id: string, report: unknown): void {
    this.db
      .prepare("UPDATE investigations SET challenge_report = ? WHERE id = ?")
      .run(JSON.stringify(report), id);
  }

  updateFinalVerdict(
    id: string,
    verdict: unknown,
    durationMs: number,
    costUsd: number,
  ): void {
    this.db
      .prepare(
        `UPDATE investigations
         SET final_verdict = ?, pipeline_duration_ms = ?, total_cost_usd = ?,
             status = 'completed', completed_at = datetime('now')
         WHERE id = ?`,
      )
      .run(JSON.stringify(verdict), durationMs, costUsd, id);
  }

  getRecent(limit: number): Investigation[] {
    const rows = this.db
      .prepare("SELECT * FROM investigations ORDER BY rowid DESC LIMIT ?")
      .all(limit) as InvestigationRow[];
    return rows.map(toInvestigation);
  }
}
