import type Database from "better-sqlite3";

/**
 * Run all database migrations. Idempotent — safe to call multiple times.
 */
export function runMigrations(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS investigations (
      id TEXT PRIMARY KEY,
      original_message TEXT NOT NULL,
      extracted_claim TEXT,
      status TEXT NOT NULL DEFAULT 'pending',
      classifier_result JSON,
      search_strategy JSON,
      agent_reports JSON,
      challenge_report JSON,
      final_verdict JSON,
      telegram_chat_id TEXT,
      telegram_message_id TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      total_cost_usd REAL DEFAULT 0,
      pipeline_duration_ms INTEGER
    )
  `);

  // Migration: add source_url column for URL-based investigations
  try {
    db.exec(`ALTER TABLE investigations ADD COLUMN source_url TEXT`);
  } catch {
    /* column already exists */
  }
}
