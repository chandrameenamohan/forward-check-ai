import type { ClaudeClient } from "../services/claude-client.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { InvestigationRepository } from "../db/investigation-repository.js";
import type { FinalVerdict } from "../schemas/final-verdict.js";
import type { ClassifierResult } from "../schemas/classifier-result.js";
import type { SearchStrategy } from "../schemas/search-strategy.js";
import type { AgentReport } from "../schemas/agent-report.js";
import type { ChallengeReport } from "../schemas/challenge-report.js";
import type { PipelineStage } from "../bot/status-updater.js";
import type { PipelineEventBus } from "./pipeline-events.js";
import { ClaimCache } from "../services/claim-cache.js";
import { detectUrl, enrichMessageWithUrl } from "../services/url-extractor.js";
import { runClassifier } from "../agents/classifier-agent.js";
import { handleNonFactual } from "../agents/non-factual-handler.js";
import { runStrategist } from "../agents/strategist-agent.js";
import { runSourceVerification } from "../agents/investigators/source-verification-agent.js";
import { runDomainExpertise } from "../agents/investigators/domain-expertise-agent.js";
import { runPatternMatching } from "../agents/investigators/pattern-matching-agent.js";
import { runDevilsAdvocate } from "../agents/devils-advocate-agent.js";
import { runJudge } from "../agents/judge-agent.js";
import { enforceConfidenceGates, detectConfidenceMismatch } from "../formatter/confidence-gates.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

const DISAGREEMENT_SPREAD_THRESHOLD = 30;

export interface InvestigateOptions {
  onStatusUpdate?: (stage: PipelineStage) => void | Promise<void>;
  onInvestigationCreated?: (investigationId: string) => void | Promise<void>;
  telegramChatId?: string;
  telegramMessageId?: string;
  /** If provided, reuse this investigation ID instead of creating a new DB record. */
  investigationId?: string;
  /** Pre-detected source URL (skip auto-detection). */
  sourceUrl?: string;
  /** Pre-extracted URL content (used with sourceUrl). */
  extractedUrlContent?: string;
}

export interface InvestigateResult {
  verdict: FinalVerdict | null;
  investigationId: string;
  nonFactualResponse?: string;
  totalCostUsd: number;
  durationMs: number;
  cached?: boolean;
  classifierResult?: ClassifierResult;
  searchStrategy?: SearchStrategy;
  agentReports?: AgentReport[];
  challengeReport?: ChallengeReport;
}

export class InvestigationPipeline {
  private client: ClaudeClient;
  private toolRegistry: ToolRegistry;
  private repo: InvestigationRepository;
  private cache: ClaimCache;
  private eventBus?: PipelineEventBus;

  constructor(
    client: ClaudeClient,
    toolRegistry: ToolRegistry,
    repo: InvestigationRepository,
    cache?: ClaimCache,
    eventBus?: PipelineEventBus,
  ) {
    this.client = client;
    this.toolRegistry = toolRegistry;
    this.repo = repo;
    this.cache = cache ?? new ClaimCache();
    this.eventBus = eventBus;
  }

  async investigate(
    message: string,
    options?: InvestigateOptions,
  ): Promise<InvestigateResult> {
    const startTime = Date.now();

    const cached = this.cache.get(message);
    if (cached) {
      logger.info({ investigationId: cached.investigationId }, "Returning cached result");
      return {
        verdict: cached.result,
        investigationId: cached.investigationId,
        totalCostUsd: 0,
        durationMs: Date.now() - startTime,
        cached: true,
      };
    }

    const investigationId = options?.investigationId
      ?? this.repo.create(message, options?.telegramChatId, options?.telegramMessageId);

    try {
      await options?.onInvestigationCreated?.(investigationId);
    } catch (err) {
      logger.warn({ err, investigationId }, "onInvestigationCreated callback failed, continuing");
    }

    this.emitEvent({ kind: "pipeline:start", investigationId, message, sourceUrl: options?.sourceUrl, timestamp: Date.now() });

    try {
      return await this.runPipeline(message, investigationId, startTime, options);
    } catch (err) {
      this.emitEvent({
        kind: "pipeline:error",
        investigationId,
        error: err instanceof Error ? err.message : String(err),
        stage: this.inferFailedStage(err),
        timestamp: Date.now(),
      });
      throw err;
    }
  }

  private async runPipeline(
    message: string,
    investigationId: string,
    startTime: number,
    options?: InvestigateOptions,
  ): Promise<InvestigateResult> {
    let totalCostUsd = 0;

    // ── URL pre-processing ───────────────────────────────────
    let effectiveMessage = message;
    let sourceUrl = options?.sourceUrl;

    if (!sourceUrl) {
      const detectedUrl = detectUrl(message);
      if (detectedUrl) {
        this.emitEvent({ kind: "url-fetch:start", investigationId, url: detectedUrl, timestamp: Date.now() });
        const urlResult = await enrichMessageWithUrl(message);
        if (urlResult) {
          effectiveMessage = urlResult.enrichedMessage;
          sourceUrl = urlResult.sourceUrl;
          this.emitEvent({
            kind: "url-fetch:complete", investigationId,
            url: urlResult.sourceUrl, title: urlResult.title,
            wordCount: urlResult.wordCount, timestamp: Date.now(),
          });
        }
      }
    } else if (options?.extractedUrlContent) {
      effectiveMessage = options.extractedUrlContent;
    }

    if (sourceUrl) {
      this.repo.updateSourceUrl(investigationId, sourceUrl);
    }

    // ── Classify ─────────────────────────────────────────────
    this.emitEvent({ kind: "classifier:start", investigationId, timestamp: Date.now() });

    const { result: classifierResult, costUsd: classifierCost } =
      await runClassifier(effectiveMessage, this.client);
    totalCostUsd += classifierCost;

    this.emitEvent({
      kind: "classifier:complete", investigationId,
      result: classifierResult, costUsd: classifierCost, timestamp: Date.now(),
    });
    this.repo.updateClassifierResult(investigationId, classifierResult);

    // ── Short-circuit non-factual ────────────────────────────
    if (classifierResult.category !== "factual_claim") {
      const nonFactual = handleNonFactual(classifierResult);
      this.repo.updateStatus(investigationId, "completed_non_factual");
      return {
        verdict: null, investigationId,
        nonFactualResponse: nonFactual.text,
        totalCostUsd, durationMs: Date.now() - startTime,
        classifierResult,
      };
    }

    this.repo.updateStatus(investigationId, "investigating");

    // ── Strategist ───────────────────────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "planning");
    this.emitEvent({
      kind: "strategist:start", investigationId,
      claim: classifierResult.extractedClaim, timestamp: Date.now(),
    });

    const { strategy: searchStrategy, costUsd: strategistCost } =
      await runStrategist(classifierResult.extractedClaim, classifierResult, this.client);
    totalCostUsd += strategistCost;

    this.emitEvent({
      kind: "strategist:complete", investigationId,
      costUsd: strategistCost, thinkingExcerpt: searchStrategy.thinkingExcerpt,
      strategy: searchStrategy, timestamp: Date.now(),
    });
    this.repo.updateSearchStrategy(investigationId, searchStrategy);

    // ── Investigators (parallel) ─────────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "searching");
    const investigatorRoles = ["source_verification", "domain_expertise", "pattern_matching"] as const;
    this.emitEvent({
      kind: "investigators:start", investigationId,
      roles: [...investigatorRoles], timestamp: Date.now(),
    });

    const { agentReports, investigatorCost } = await this.runInvestigators(
      classifierResult.extractedClaim, classifierResult.domain,
      searchStrategy, investigationId, investigatorRoles,
    );
    totalCostUsd += investigatorCost;
    this.repo.updateAgentReports(investigationId, agentReports);

    // ── Disagreement detection ───────────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "analyzing");
    const confidenceScores = agentReports.map((r) => r.confidenceScore);
    const spread = Math.max(...confidenceScores) - Math.min(...confidenceScores);
    const deepReasoningActivated = spread > DISAGREEMENT_SPREAD_THRESHOLD;

    if (deepReasoningActivated) {
      logger.info({ spread, confidenceScores }, "Disagreement detected — escalating DA to max");
      this.emitEvent({
        kind: "disagreement:detected", investigationId,
        spread, confidenceScores, timestamp: Date.now(),
      });
    }

    // ── Devil's Advocate ─────────────────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "challenging");
    const falsificationCriteria = [
      ...searchStrategy.falsificationCriteria.whatWouldProveTrue,
      ...searchStrategy.falsificationCriteria.whatWouldProveFalse,
    ];
    const daEffort = deepReasoningActivated ? "max" as const : "high" as const;
    this.emitEvent({ kind: "da:start", investigationId, effortLevel: daEffort, timestamp: Date.now() });

    const { report: challengeReport, costUsd: daCost } =
      await runDevilsAdvocate(
        classifierResult.extractedClaim, agentReports, falsificationCriteria, this.client, daEffort,
      );
    totalCostUsd += daCost;

    this.emitEvent({
      kind: "da:complete", investigationId,
      report: challengeReport, costUsd: daCost,
      thinkingExcerpt: challengeReport.thinkingExcerpt, timestamp: Date.now(),
    });
    this.repo.updateChallengeReport(investigationId, challengeReport);

    // ── Judge ────────────────────────────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "judging");
    this.emitEvent({ kind: "judge:start", investigationId, timestamp: Date.now() });

    const { verdict: rawVerdict, costUsd: judgeCost } = await runJudge(
      classifierResult.extractedClaim, agentReports, challengeReport,
      searchStrategy, this.client, this.toolRegistry,
    );
    totalCostUsd += judgeCost;

    this.emitEvent({
      kind: "judge:complete", investigationId,
      verdict: rawVerdict, costUsd: judgeCost,
      thinkingExcerpt: rawVerdict.thinkingSummary, timestamp: Date.now(),
    });

    // ── Confidence gates + finalize ──────────────────────────
    const verdictWithFlag: FinalVerdict = { ...rawVerdict, deepReasoningActivated };
    if (detectConfidenceMismatch(verdictWithFlag)) {
      logger.warn(
        { category: verdictWithFlag.category, confidence: verdictWithFlag.confidence },
        "Confidence/category mismatch — gate will override",
      );
    }
    const finalVerdict = enforceConfidenceGates(verdictWithFlag);

    const durationMs = Date.now() - startTime;
    this.repo.updateFinalVerdict(investigationId, finalVerdict, durationMs, totalCostUsd);

    logger.info({
      investigationId, category: finalVerdict.category, confidence: finalVerdict.confidence,
      deepReasoningActivated, totalCostUsd: totalCostUsd.toFixed(4), durationMs,
      agentCount: agentReports.length,
    }, "Pipeline completed");

    this.cache.set(message, finalVerdict, investigationId);

    this.emitEvent({
      kind: "pipeline:complete", investigationId,
      verdict: finalVerdict, totalCostUsd, durationMs, timestamp: Date.now(),
    });

    return {
      verdict: finalVerdict, investigationId, totalCostUsd, durationMs,
      classifierResult, searchStrategy, agentReports, challengeReport,
    };
  }

  private async runInvestigators(
    claim: string,
    domain: string,
    searchStrategy: Awaited<ReturnType<typeof runStrategist>>["strategy"],
    investigationId: string,
    roles: readonly ["source_verification", "domain_expertise", "pattern_matching"],
  ): Promise<{ agentReports: AgentReport[]; investigatorCost: number }> {
    const results = await Promise.allSettled([
      runSourceVerification(claim, searchStrategy, this.client, this.toolRegistry),
      runDomainExpertise(claim, domain, searchStrategy, this.client, this.toolRegistry),
      runPatternMatching(claim, searchStrategy, this.client, this.toolRegistry),
    ]);

    const agentReports: AgentReport[] = [];
    let investigatorCost = 0;

    for (let i = 0; i < results.length; i++) {
      const result = results[i]!;
      const role = roles[i]!;
      if (result.status === "fulfilled") {
        agentReports.push(result.value.report);
        investigatorCost += result.value.costUsd;
        this.emitEvent({
          kind: "investigator:complete", investigationId,
          role, report: result.value.report, costUsd: result.value.costUsd,
          timestamp: Date.now(),
        });
      } else {
        logger.error({ error: result.reason, agent: role }, `Investigator ${role} failed`);
      }
    }

    logger.info({ successfulAgents: agentReports.map((r) => r.agentRole) }, "Investigators completed");

    if (agentReports.length === 0) {
      throw new Error("All investigators failed — cannot proceed with pipeline");
    }

    return { agentReports, investigatorCost };
  }

  private emitEvent(event: Parameters<PipelineEventBus["emit"]>[0]): void {
    if (!this.eventBus) return;
    try {
      this.eventBus.emit(event);
    } catch (err) {
      logger.warn({ kind: event.kind, error: err }, "Event bus emit failed, continuing");
    }
  }

  private async emitStatus(
    callback: InvestigateOptions["onStatusUpdate"],
    stage: PipelineStage,
  ): Promise<void> {
    if (!callback) return;
    try {
      await callback(stage);
    } catch (err) {
      logger.warn({ stage, error: err }, "Status update callback failed, continuing");
    }
  }

  private inferFailedStage(err: unknown): string {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("Classifier") || msg.includes("classifier")) return "classifier";
    if (msg.includes("Strategist") || msg.includes("strategist")) return "strategist";
    if (msg.includes("investigators") || msg.includes("All investigators")) return "investigators";
    if (msg.includes("Devil") || msg.includes("DA") || msg.includes("advocate")) return "da";
    if (msg.includes("Judge") || msg.includes("judge")) return "judge";
    return "unknown";
  }
}
