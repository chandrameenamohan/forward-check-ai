import type { ClaudeClient } from "../services/claude-client.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import type { InvestigationRepository } from "../db/investigation-repository.js";
import type { FinalVerdict } from "../schemas/final-verdict.js";
import type { AgentReport } from "../schemas/agent-report.js";
import type { PipelineStage } from "../bot/status-updater.js";
import { ClaimCache } from "../services/claim-cache.js";
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

/** Threshold for detecting investigator disagreement */
const DISAGREEMENT_SPREAD_THRESHOLD = 30;

/** Options for pipeline.investigate() */
export interface InvestigateOptions {
  onStatusUpdate?: (stage: PipelineStage) => void | Promise<void>;
  telegramChatId?: string;
  telegramMessageId?: string;
}

/** Result from a completed investigation */
export interface InvestigateResult {
  verdict: FinalVerdict | null;
  investigationId: string;
  nonFactualResponse?: string;
  totalCostUsd: number;
  durationMs: number;
  cached?: boolean;
}

/**
 * Orchestrates the full fact-checking pipeline from message to verdict.
 */
export class InvestigationPipeline {
  private client: ClaudeClient;
  private toolRegistry: ToolRegistry;
  private repo: InvestigationRepository;
  private cache: ClaimCache;

  constructor(
    client: ClaudeClient,
    toolRegistry: ToolRegistry,
    repo: InvestigationRepository,
    cache?: ClaimCache,
  ) {
    this.client = client;
    this.toolRegistry = toolRegistry;
    this.repo = repo;
    this.cache = cache ?? new ClaimCache();
  }

  async investigate(
    message: string,
    options?: InvestigateOptions,
  ): Promise<InvestigateResult> {
    const startTime = Date.now();

    // ── Check cache for repeated claims ──────────────────────
    const cached = this.cache.get(message);
    if (cached) {
      logger.info(
        { investigationId: cached.investigationId },
        "Returning cached result for repeated claim",
      );
      return {
        verdict: cached.result,
        investigationId: cached.investigationId,
        totalCostUsd: 0,
        durationMs: Date.now() - startTime,
        cached: true,
      };
    }

    let totalCostUsd = 0;

    // Create investigation record in DB
    const investigationId = this.repo.create(
      message,
      options?.telegramChatId,
      options?.telegramMessageId,
    );

    // ── Step 1: Classify ────────────────────────────────────
    const { result: classifierResult, costUsd: classifierCost } =
      await runClassifier(message, this.client);
    totalCostUsd += classifierCost;

    this.repo.updateClassifierResult(investigationId, classifierResult);

    // ── Step 2: Short-circuit for non-factual messages ──────
    if (classifierResult.category !== "factual_claim") {
      const nonFactual = handleNonFactual(classifierResult);
      this.repo.updateStatus(investigationId, "completed_non_factual");

      return {
        verdict: null,
        investigationId,
        nonFactualResponse: nonFactual.text,
        totalCostUsd,
        durationMs: Date.now() - startTime,
      };
    }

    this.repo.updateStatus(investigationId, "investigating");

    // ── Step 3: Run Claim Strategist ────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "planning");

    const { strategy: searchStrategy, costUsd: strategistCost } =
      await runStrategist(
        classifierResult.extractedClaim,
        classifierResult,
        this.client,
      );
    totalCostUsd += strategistCost;

    this.repo.updateSearchStrategy(investigationId, searchStrategy);

    // ── Step 4: Run Investigators in parallel ───────────────
    await this.emitStatus(options?.onStatusUpdate, "searching");

    const investigatorResults = await Promise.allSettled([
      runSourceVerification(
        classifierResult.extractedClaim,
        searchStrategy,
        this.client,
        this.toolRegistry,
      ),
      runDomainExpertise(
        classifierResult.extractedClaim,
        classifierResult.domain,
        searchStrategy,
        this.client,
        this.toolRegistry,
      ),
      runPatternMatching(
        classifierResult.extractedClaim,
        searchStrategy,
        this.client,
        this.toolRegistry,
      ),
    ]);

    // Collect successful reports — map indices to roles for error identification
    const investigatorRoles = ["source_verification", "domain_expertise", "pattern_matching"] as const;
    const agentReports: AgentReport[] = [];
    for (let i = 0; i < investigatorResults.length; i++) {
      const result = investigatorResults[i]!;
      const role = investigatorRoles[i]!;
      if (result.status === "fulfilled") {
        agentReports.push(result.value.report);
        totalCostUsd += result.value.costUsd;
      } else {
        logger.error(
          { error: result.reason, agent: role },
          `Investigator ${role} failed, continuing with remaining reports`,
        );
      }
    }

    logger.info(
      { successfulAgents: agentReports.map((r) => r.agentRole) },
      "Investigators completed",
    );

    if (agentReports.length === 0) {
      throw new Error("All investigators failed — cannot proceed with pipeline");
    }

    this.repo.updateAgentReports(investigationId, agentReports);

    // ── Step 5: Detect disagreement ─────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "analyzing");

    const confidenceScores = agentReports.map((r) => r.confidenceScore);
    const spread = Math.max(...confidenceScores) - Math.min(...confidenceScores);
    const deepReasoningActivated = spread > DISAGREEMENT_SPREAD_THRESHOLD;

    if (deepReasoningActivated) {
      logger.info(
        { spread, confidenceScores },
        "Investigator disagreement detected — escalating DA effort to max",
      );
    }

    // ── Step 6: Run Devil's Advocate ────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "challenging");

    const falsificationCriteria = [
      ...searchStrategy.falsificationCriteria.whatWouldProveTrue,
      ...searchStrategy.falsificationCriteria.whatWouldProveFalse,
    ];
    const daEffort = deepReasoningActivated ? "max" as const : "high" as const;

    const { report: challengeReport, costUsd: daCost } =
      await runDevilsAdvocate(
        classifierResult.extractedClaim,
        agentReports,
        falsificationCriteria,
        this.client,
        daEffort,
      );
    totalCostUsd += daCost;

    this.repo.updateChallengeReport(investigationId, challengeReport);

    // ── Step 7: Run Judge ───────────────────────────────────
    await this.emitStatus(options?.onStatusUpdate, "judging");

    const { verdict: rawVerdict, costUsd: judgeCost } = await runJudge(
      classifierResult.extractedClaim,
      agentReports,
      challengeReport,
      searchStrategy,
      this.client,
      this.toolRegistry,
    );
    totalCostUsd += judgeCost;

    // ── Step 8: Apply confidence gates + set deep reasoning flag
    const verdictWithFlag: FinalVerdict = {
      ...rawVerdict,
      deepReasoningActivated,
    };

    if (detectConfidenceMismatch(verdictWithFlag)) {
      logger.warn(
        {
          category: verdictWithFlag.category,
          confidence: verdictWithFlag.confidence,
        },
        "Judge confidence/category mismatch detected — gate will override",
      );
    }

    const finalVerdict = enforceConfidenceGates(verdictWithFlag);

    // ── Step 9: Save to DB ──────────────────────────────────
    const durationMs = Date.now() - startTime;
    this.repo.updateFinalVerdict(
      investigationId,
      finalVerdict,
      durationMs,
      totalCostUsd,
    );

    logger.info(
      {
        investigationId,
        category: finalVerdict.category,
        confidence: finalVerdict.confidence,
        deepReasoningActivated,
        totalCostUsd: totalCostUsd.toFixed(4),
        durationMs,
        agentCount: agentReports.length,
      },
      "Pipeline completed",
    );

    // ── Cache the result for repeated claims ─────────────────
    this.cache.set(message, finalVerdict, investigationId);

    return {
      verdict: finalVerdict,
      investigationId,
      totalCostUsd,
      durationMs,
    };
  }

  /**
   * Safely emit a status update, catching errors so they don't crash the pipeline.
   */
  private async emitStatus(
    callback: InvestigateOptions["onStatusUpdate"],
    stage: PipelineStage,
  ): Promise<void> {
    if (!callback) return;
    try {
      await callback(stage);
    } catch (err) {
      logger.warn(
        { stage, error: err },
        "Status update callback failed, continuing pipeline",
      );
    }
  }
}
