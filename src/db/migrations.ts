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

  // Migration: add platform-agnostic columns for multi-platform support
  try {
    db.exec(`ALTER TABLE investigations ADD COLUMN source_platform TEXT DEFAULT 'telegram'`);
  } catch {
    /* column already exists */
  }

  try {
    db.exec(`ALTER TABLE investigations ADD COLUMN platform_chat_id TEXT`);
  } catch {
    /* column already exists */
  }

  try {
    db.exec(`ALTER TABLE investigations ADD COLUMN platform_message_id TEXT`);
  } catch {
    /* column already exists */
  }

  // Backfill: copy telegram-specific columns into platform-agnostic columns
  db.exec(`
    UPDATE investigations
    SET platform_chat_id = telegram_chat_id,
        platform_message_id = telegram_message_id
    WHERE platform_chat_id IS NULL
      AND telegram_chat_id IS NOT NULL
  `);

  db.exec(`
    CREATE TABLE IF NOT EXISTS feedback (
      id TEXT PRIMARY KEY,
      type TEXT NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      source_channel TEXT NOT NULL,
      user_agent TEXT,
      telegram_username TEXT,
      telegram_user_id TEXT,
      github_issue_url TEXT,
      github_issue_number INTEGER,
      ip_address TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `);

  // Migration: add platform_user_id_hash column to feedback table
  try {
    db.exec(`ALTER TABLE feedback ADD COLUMN platform_user_id_hash TEXT`);
  } catch {
    /* column already exists */
  }
}
