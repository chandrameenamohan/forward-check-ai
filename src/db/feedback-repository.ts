import type Database from "better-sqlite3";
import { nanoid } from "nanoid";

/** Row shape as stored in SQLite. */
interface FeedbackRow {
  id: string;
  type: string;
  title: string;
  description: string;
  source_channel: string;
  user_agent: string | null;
  telegram_username: string | null;
  telegram_user_id: string | null;
  github_issue_url: string | null;
  github_issue_number: number | null;
  ip_address: string | null;
  created_at: string;
}

/** Parsed feedback record. */
export interface Feedback {
  id: string;
  type: string;
  title: string;
  description: string;
  source_channel: string;
  user_agent: string | null;
  telegram_username: string | null;
  telegram_user_id: string | null;
  github_issue_url: string | null;
  github_issue_number: number | null;
  ip_address: string | null;
  created_at: string;
}

export interface CreateFeedbackParams {
  type: string;
  title: string;
  description: string;
  sourceChannel: string;
  userAgent?: string;
  telegramUsername?: string;
  telegramUserId?: string;
  ipAddress?: string;
}

function toFeedback(row: FeedbackRow): Feedback {
  return {
    id: row.id,
    type: row.type,
    title: row.title,
    description: row.description,
    source_channel: row.source_channel,
    user_agent: row.user_agent,
    telegram_username: row.telegram_username,
    telegram_user_id: row.telegram_user_id,
    github_issue_url: row.github_issue_url,
    github_issue_number: row.github_issue_number,
    ip_address: row.ip_address,
    created_at: row.created_at,
  };
}

export class FeedbackRepository {
  private db: Database.Database;

  constructor(db: Database.Database) {
    this.db = db;
  }

  create(params: CreateFeedbackParams): string {
    const id = nanoid();
    this.db
      .prepare(
        `INSERT INTO feedback (id, type, title, description, source_channel, user_agent, telegram_username, telegram_user_id, ip_address)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        params.type,
        params.title,
        params.description,
        params.sourceChannel,
        params.userAgent ?? null,
        params.telegramUsername ?? null,
        params.telegramUserId ?? null,
        params.ipAddress ?? null,
      );
    return id;
  }

  updateGitHubIssue(id: string, issueUrl: string, issueNumber: number): void {
    this.db
      .prepare(
        "UPDATE feedback SET github_issue_url = ?, github_issue_number = ? WHERE id = ?",
      )
      .run(issueUrl, issueNumber, id);
  }

  getById(id: string): Feedback | null {
    const row = this.db
      .prepare("SELECT * FROM feedback WHERE id = ?")
      .get(id) as FeedbackRow | undefined;
    if (!row) return null;
    return toFeedback(row);
  }

  getRecent(limit: number): Feedback[] {
    const rows = this.db
      .prepare("SELECT * FROM feedback ORDER BY rowid DESC LIMIT ?")
      .all(limit) as FeedbackRow[];
    return rows.map(toFeedback);
  }
}
