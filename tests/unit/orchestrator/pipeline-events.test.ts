import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  PipelineEventBus,
  type PipelineEvent,
} from "../../../src/orchestrator/pipeline-events.js";

describe("PipelineEventBus", () => {
  let bus: PipelineEventBus;

  beforeEach(() => {
    bus = new PipelineEventBus();
  });

  afterEach(() => {
    bus.destroy();
  });

  it("should emit and receive typed pipeline events", () => {
    const received: PipelineEvent[] = [];
    const investigationId = "inv-001";

    bus.subscribe(investigationId, (event) => {
      received.push(event);
    });

    const event: PipelineEvent = {
      kind: "pipeline:start",
      investigationId,
      message: "PM Modi Rs 5000 transfer",
      timestamp: Date.now(),
    };

    bus.emit(event);

    expect(received).toHaveLength(1);
    expect(received[0]).toEqual(event);
  });

  it("should filter events by investigationId in subscribe", () => {
    const received: PipelineEvent[] = [];

    bus.subscribe("inv-001", (event) => {
      received.push(event);
    });

    // Emit for inv-001
    bus.emit({
      kind: "classifier:start",
      investigationId: "inv-001",
      timestamp: Date.now(),
    });

    // Emit for inv-002 — should NOT be received
    bus.emit({
      kind: "classifier:start",
      investigationId: "inv-002",
      timestamp: Date.now(),
    });

    expect(received).toHaveLength(1);
    expect(received[0]!.investigationId).toBe("inv-001");
  });

  it("should store event history for catch-up", () => {
    const investigationId = "inv-003";

    // Emit events before any subscriber exists
    bus.emit({
      kind: "pipeline:start",
      investigationId,
      message: "test claim",
      timestamp: Date.now(),
    });
    bus.emit({
      kind: "classifier:start",
      investigationId,
      timestamp: Date.now(),
    });
    bus.emit({
      kind: "classifier:complete",
      investigationId,
      result: {
        category: "factual_claim",
        extractedClaim: "test",
        isCompound: false,
        domain: "general",
        language: "en",
        urgency: "low",
        reasoning: "test",
      },
      costUsd: 0.01,
      timestamp: Date.now(),
    });

    // Get history after events were emitted
    const history = bus.getHistory(investigationId);
    expect(history).toHaveLength(3);
    expect(history[0]!.kind).toBe("pipeline:start");
    expect(history[1]!.kind).toBe("classifier:start");
    expect(history[2]!.kind).toBe("classifier:complete");
  });

  it("should auto-cleanup expired event history", () => {
    vi.useFakeTimers();

    const investigationId = "inv-004";
    const shortTtlBus = new PipelineEventBus({ historyTtlMs: 1000, cleanupIntervalMs: 500 });

    shortTtlBus.emit({
      kind: "pipeline:start",
      investigationId,
      message: "test",
      timestamp: Date.now(),
    });

    expect(shortTtlBus.getHistory(investigationId)).toHaveLength(1);

    // Advance time past TTL
    vi.advanceTimersByTime(1500);

    // History should be cleaned up
    expect(shortTtlBus.getHistory(investigationId)).toHaveLength(0);

    shortTtlBus.destroy();
    vi.useRealTimers();
  });

  it("should handle multiple subscribers for same investigation", () => {
    const received1: PipelineEvent[] = [];
    const received2: PipelineEvent[] = [];
    const investigationId = "inv-005";

    bus.subscribe(investigationId, (event) => {
      received1.push(event);
    });
    bus.subscribe(investigationId, (event) => {
      received2.push(event);
    });

    bus.emit({
      kind: "classifier:start",
      investigationId,
      timestamp: Date.now(),
    });

    expect(received1).toHaveLength(1);
    expect(received2).toHaveLength(1);
  });

  it("should return unsubscribe function from subscribe", () => {
    const received: PipelineEvent[] = [];
    const investigationId = "inv-006";

    const unsubscribe = bus.subscribe(investigationId, (event) => {
      received.push(event);
    });

    bus.emit({
      kind: "classifier:start",
      investigationId,
      timestamp: Date.now(),
    });
    expect(received).toHaveLength(1);

    unsubscribe();

    bus.emit({
      kind: "classifier:complete",
      investigationId,
      result: {
        category: "factual_claim",
        extractedClaim: "test",
        isCompound: false,
        domain: "general",
        language: "en",
        urgency: "low",
        reasoning: "test",
      },
      costUsd: 0.01,
      timestamp: Date.now(),
    });
    expect(received).toHaveLength(1); // no new events after unsubscribe
  });

  it("should not store history for different investigations together", () => {
    bus.emit({
      kind: "pipeline:start",
      investigationId: "inv-a",
      message: "claim a",
      timestamp: Date.now(),
    });
    bus.emit({
      kind: "pipeline:start",
      investigationId: "inv-b",
      message: "claim b",
      timestamp: Date.now(),
    });

    expect(bus.getHistory("inv-a")).toHaveLength(1);
    expect(bus.getHistory("inv-b")).toHaveLength(1);
    expect(bus.getHistory("inv-c")).toHaveLength(0);
  });

  it("should emit all event kinds without error", () => {
    const investigationId = "inv-typed";
    const now = Date.now();

    const events: PipelineEvent[] = [
      { kind: "pipeline:start", investigationId, message: "test", timestamp: now },
      { kind: "classifier:start", investigationId, timestamp: now },
      {
        kind: "classifier:complete",
        investigationId,
        result: {
          category: "factual_claim",
          extractedClaim: "test",
          isCompound: false,
          domain: "general",
          language: "en",
          urgency: "low",
          reasoning: "test",
        },
        costUsd: 0.01,
        timestamp: now,
      },
      { kind: "strategist:start", investigationId, claim: "test claim", timestamp: now },
      {
        kind: "strategist:complete",
        investigationId,
        costUsd: 0.05,
        thinkingExcerpt: "thinking...",
        timestamp: now,
      },
      {
        kind: "investigators:start",
        investigationId,
        roles: ["source_verification", "domain_expertise", "pattern_matching"],
        timestamp: now,
      },
      {
        kind: "investigator:searching",
        investigationId,
        role: "source_verification",
        query: "Modi Rs 5000",
        timestamp: now,
      },
      {
        kind: "investigator:complete",
        investigationId,
        role: "source_verification",
        report: {
          agentRole: "source_verification",
          summary: "test",
          findings: [],
          overallAssessment: "test",
          confidenceScore: 75,
        },
        costUsd: 0.03,
        timestamp: now,
      },
      {
        kind: "disagreement:detected",
        investigationId,
        spread: 45,
        confidenceScores: [30, 75],
        timestamp: now,
      },
      { kind: "da:start", investigationId, effortLevel: "max", timestamp: now },
      {
        kind: "da:complete",
        investigationId,
        report: {
          challenges: [],
          overallAssessment: "test",
          suggestedConfidenceAdjustment: 0,
          counterArgumentSucceeded: false,
          counterArgumentSummary: "test",
          thinkingExcerpt: "thinking...",
        },
        costUsd: 0.1,
        thinkingExcerpt: "deep thought",
        timestamp: now,
      },
      { kind: "judge:start", investigationId, timestamp: now },
      {
        kind: "judge:complete",
        investigationId,
        verdict: {
          category: "likely-true",
          confidence: 85,
          summary: "test",
          manipulationTechniques: [],
          sources: [],
          confidenceDecomposition: {
            evidenceStrength: 80,
            sourceReliability: 90,
            claimComplexity: 50,
            counterArgumentResilience: 85,
          },
          falsificationCriteria: { whatWouldProveTrue: [], whatWouldProveFalse: [] },
          devilsAdvocateOutcome: "Counter-argument failed",
          thinkingSummary: "test",
        },
        costUsd: 0.15,
        thinkingExcerpt: "judge thinking",
        timestamp: now,
      },
      {
        kind: "pipeline:complete",
        investigationId,
        verdict: {
          category: "likely-true",
          confidence: 85,
          summary: "test",
          manipulationTechniques: [],
          sources: [],
          confidenceDecomposition: {
            evidenceStrength: 80,
            sourceReliability: 90,
            claimComplexity: 50,
            counterArgumentResilience: 85,
          },
          falsificationCriteria: { whatWouldProveTrue: [], whatWouldProveFalse: [] },
          devilsAdvocateOutcome: "Counter-argument failed",
          thinkingSummary: "test",
        },
        totalCostUsd: 0.35,
        durationMs: 5000,
        timestamp: now,
      },
      {
        kind: "pipeline:error",
        investigationId,
        error: "Agent failed",
        stage: "classifier",
        timestamp: now,
      },
    ];

    const received: PipelineEvent[] = [];
    bus.subscribe(investigationId, (event) => received.push(event));

    for (const event of events) {
      bus.emit(event);
    }

    expect(received).toHaveLength(events.length);
    const history = bus.getHistory(investigationId);
    expect(history).toHaveLength(events.length);
  });
});
