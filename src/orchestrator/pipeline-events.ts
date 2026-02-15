import type { ClassifierResult } from "../schemas/classifier-result.js";
import type { AgentReport } from "../schemas/agent-report.js";
import type { ChallengeReport } from "../schemas/challenge-report.js";
import type { FinalVerdict } from "../schemas/final-verdict.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

// ── Pipeline Event Types ────────────────────────────────────

interface BaseEvent {
  investigationId: string;
  timestamp: number;
}

interface PipelineStartEvent extends BaseEvent {
  kind: "pipeline:start";
  message: string;
  sourceUrl?: string;
}

interface UrlFetchStartEvent extends BaseEvent {
  kind: "url-fetch:start";
  url: string;
}

interface UrlFetchCompleteEvent extends BaseEvent {
  kind: "url-fetch:complete";
  url: string;
  title: string;
  wordCount: number;
}

interface ClassifierStartEvent extends BaseEvent {
  kind: "classifier:start";
}

interface ClassifierCompleteEvent extends BaseEvent {
  kind: "classifier:complete";
  result: ClassifierResult;
  costUsd: number;
}

interface StrategistStartEvent extends BaseEvent {
  kind: "strategist:start";
  claim: string;
}

interface StrategistCompleteEvent extends BaseEvent {
  kind: "strategist:complete";
  costUsd: number;
  thinkingExcerpt?: string;
}

interface InvestigatorsStartEvent extends BaseEvent {
  kind: "investigators:start";
  roles: string[];
}

interface InvestigatorSearchingEvent extends BaseEvent {
  kind: "investigator:searching";
  role: string;
  query: string;
}

interface InvestigatorCompleteEvent extends BaseEvent {
  kind: "investigator:complete";
  role: string;
  report: AgentReport;
  costUsd: number;
}

interface DisagreementDetectedEvent extends BaseEvent {
  kind: "disagreement:detected";
  spread: number;
  confidenceScores: number[];
}

interface DaStartEvent extends BaseEvent {
  kind: "da:start";
  effortLevel: string;
}

interface DaCompleteEvent extends BaseEvent {
  kind: "da:complete";
  report: ChallengeReport;
  costUsd: number;
  thinkingExcerpt?: string;
}

interface JudgeStartEvent extends BaseEvent {
  kind: "judge:start";
}

interface JudgeCompleteEvent extends BaseEvent {
  kind: "judge:complete";
  verdict: FinalVerdict;
  costUsd: number;
  thinkingExcerpt?: string;
}

interface PipelineCompleteEvent extends BaseEvent {
  kind: "pipeline:complete";
  verdict: FinalVerdict;
  totalCostUsd: number;
  durationMs: number;
}

interface PipelineErrorEvent extends BaseEvent {
  kind: "pipeline:error";
  error: string;
  stage: string;
}

export type PipelineEvent =
  | PipelineStartEvent
  | UrlFetchStartEvent
  | UrlFetchCompleteEvent
  | ClassifierStartEvent
  | ClassifierCompleteEvent
  | StrategistStartEvent
  | StrategistCompleteEvent
  | InvestigatorsStartEvent
  | InvestigatorSearchingEvent
  | InvestigatorCompleteEvent
  | DisagreementDetectedEvent
  | DaStartEvent
  | DaCompleteEvent
  | JudgeStartEvent
  | JudgeCompleteEvent
  | PipelineCompleteEvent
  | PipelineErrorEvent;

export type PipelineEventKind = PipelineEvent["kind"];

// ── Subscriber type ─────────────────────────────────────────

type EventCallback = (event: PipelineEvent) => void;

interface Subscriber {
  investigationId: string;
  callback: EventCallback;
}

// ── History entry with timestamp for TTL ────────────────────

interface HistoryEntry {
  events: PipelineEvent[];
  createdAt: number;
}

// ── Configuration ───────────────────────────────────────────

export interface PipelineEventBusOptions {
  /** How long to keep event history per investigation, in ms. Default: 30 min */
  historyTtlMs?: number;
  /** How often to run cleanup, in ms. Default: 60s */
  cleanupIntervalMs?: number;
}

const DEFAULT_HISTORY_TTL_MS = 30 * 60 * 1000; // 30 minutes
const DEFAULT_CLEANUP_INTERVAL_MS = 60 * 1000; // 60 seconds

// ── PipelineEventBus ────────────────────────────────────────

export class PipelineEventBus {
  private subscribers: Subscriber[] = [];
  private history: Map<string, HistoryEntry> = new Map();
  private historyTtlMs: number;
  private cleanupTimer: ReturnType<typeof setInterval>;

  constructor(options?: PipelineEventBusOptions) {
    this.historyTtlMs = options?.historyTtlMs ?? DEFAULT_HISTORY_TTL_MS;
    const cleanupInterval =
      options?.cleanupIntervalMs ?? DEFAULT_CLEANUP_INTERVAL_MS;

    this.cleanupTimer = setInterval(() => {
      this.cleanupExpired();
    }, cleanupInterval);

    // Allow Node process to exit even if timer is active
    if (typeof this.cleanupTimer === "object" && "unref" in this.cleanupTimer) {
      this.cleanupTimer.unref();
    }
  }

  /**
   * Emit a pipeline event. Stores in history and notifies matching subscribers.
   */
  emit(event: PipelineEvent): void {
    // Store in history
    const entry = this.history.get(event.investigationId);
    if (entry) {
      entry.events.push(event);
    } else {
      this.history.set(event.investigationId, {
        events: [event],
        createdAt: Date.now(),
      });
    }

    // Notify matching subscribers
    for (const sub of this.subscribers) {
      if (sub.investigationId === event.investigationId) {
        try {
          sub.callback(event);
        } catch (err) {
          logger.error(
            { investigationId: event.investigationId, error: err },
            "Subscriber callback threw an error",
          );
        }
      }
    }
  }

  /**
   * Subscribe to events for a specific investigation.
   * Returns an unsubscribe function.
   */
  subscribe(investigationId: string, callback: EventCallback): () => void {
    const subscriber: Subscriber = { investigationId, callback };
    this.subscribers.push(subscriber);

    return () => {
      const index = this.subscribers.indexOf(subscriber);
      if (index !== -1) {
        this.subscribers.splice(index, 1);
      }
    };
  }

  /**
   * Get all past events for an investigation (for catch-up on late-joining clients).
   */
  getHistory(investigationId: string): PipelineEvent[] {
    const entry = this.history.get(investigationId);
    if (!entry) return [];

    // Check if expired
    if (Date.now() - entry.createdAt > this.historyTtlMs) {
      this.history.delete(investigationId);
      return [];
    }

    return [...entry.events];
  }

  /**
   * Stop the cleanup timer. Call this when shutting down.
   */
  destroy(): void {
    clearInterval(this.cleanupTimer);
  }

  /**
   * Remove expired investigation histories.
   */
  private cleanupExpired(): void {
    const now = Date.now();
    let cleaned = 0;

    for (const [id, entry] of this.history) {
      if (now - entry.createdAt > this.historyTtlMs) {
        this.history.delete(id);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      logger.debug({ cleaned }, "Cleaned up expired pipeline event histories");
    }
  }
}
