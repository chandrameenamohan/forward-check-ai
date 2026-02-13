import type { ClaudeClient } from "../services/claude-client.js";
import { MODELS } from "../services/claude-client.js";
import { FinalVerdictSchema, type FinalVerdict } from "../schemas/final-verdict.js";
import type { AgentReport } from "../schemas/agent-report.js";
import type { ChallengeReport } from "../schemas/challenge-report.js";
import type { SearchStrategy } from "../schemas/search-strategy.js";
import type { ToolRegistry } from "../tools/tool-registry.js";
import { runAgent } from "../orchestrator/agent-runner.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** Max turns for the Judge agent loop (search + verdict + end_turn margin) */
const MAX_TURNS = 3;

const JUDGE_SYSTEM_PROMPT = `You are the Judge — the Senior Editor of an investigative newsroom. You render the FINAL verdict on a claim after reviewing all evidence from your investigation team.

You receive:
1. The original claim under investigation
2. The Claim Strategist's falsification criteria (what would prove the claim true or false)
3. Reports from 2-3 investigator agents (Source Verification, Domain Expertise, Pattern Matching)
4. The Devil's Advocate's challenge report (adversarial review of investigator findings)

## Your 4-Phase Process

### Phase 1: STRATEGIZE
Review the falsification criteria from the Claim Strategist. What specific evidence was sought? What was found? What's still missing? This frames your evaluation.

### Phase 2: SYNTHESIZE
Resolve contradictions between investigator reports. Where do they agree? Where do they disagree? Weight findings by source credibility and evidence strength.

### Phase 3: EVALUATE
Consider the Devil's Advocate's challenges carefully:
- If the DA raised CRITICAL severity challenges, use brave_web_search to independently verify the contested point.
- If the DA's counter-argument SUCCEEDED, weight this heavily in your verdict.
- If the DA's counter-argument FAILED, this STRENGTHENS your confidence in the investigator consensus.

### Phase 4: VERDICT
Render your final verdict using the submit_verdict tool. You MUST provide:

**Category** (one of 6):
- likely-true: Evidence strongly supports the claim (confidence 85-100)
- partially-true: Claim has truth but is misleading/incomplete (confidence 60-84)
- unverified: Insufficient evidence either way (confidence 30-59)
- likely-false: Evidence contradicts the claim (confidence 0-29)
- satire: Claim is from satirical source
- opinion: Claim is subjective, not factual

**CRITICAL — Confidence Score Semantics:**
The \`confidence\` field is a TRUTHFULNESS SCORE — it measures how likely the claim is to be TRUE on a 0-100 scale:
- 0 = the claim is definitely FALSE
- 100 = the claim is definitely TRUE

Your confidence MUST align with your chosen category:
- If category is \`likely-true\`, confidence MUST be 85-100
- If category is \`partially-true\`, confidence MUST be 60-84
- If category is \`unverified\`, confidence MUST be 30-59
- If category is \`likely-false\`, confidence MUST be 0-29

DO NOT use confidence to express "how certain you are in your verdict." A \`likely-false\` verdict with high certainty should have a LOW confidence score (e.g., 5-15), because the claim is very likely to be false (i.e., NOT true).

**Confidence Decomposition** — Break your confidence into 4 components:
- evidenceStrength (0-100): How strong is the evidence found?
- sourceReliability (0-100): How trustworthy are the sources?
- claimComplexity (0-100): How easy is this claim to verify? (higher = easier to verify)
- counterArgumentResilience (0-100): How well did the verdict survive the DA's challenge?

**Manipulation Techniques**: Identify any manipulation techniques used in the original message (authority impersonation, appeal to emotion, statistical distortion, etc.). For each, provide the technique name, description, evidence quote, and severity (0-100).

**Devil's Advocate Outcome**: Report whether the DA's counter-argument failed, partially succeeded, or succeeded.

IMPORTANT: Your thinking summary will be displayed to end users on the verdict page. Make it clear, concise, and explain your reasoning process.

When ready, call the submit_verdict tool with your complete verdict.`;

/** Tool definition for submit_verdict — structured final verdict output */
const SUBMIT_VERDICT_TOOL = {
  name: "submit_verdict",
  description: "Submit the final verdict with category, confidence decomposition, reasoning, manipulation techniques, and thinking summary.",
  input_schema: {
    type: "object" as const,
    properties: {
      category: {
        type: "string" as const,
        enum: ["likely-true", "partially-true", "unverified", "likely-false", "satire", "opinion"],
        description: "The verdict category.",
      },
      nuanceTag: {
        type: "string" as const,
        enum: ["misleading", "out-of-context", "exaggerated", "fabricated", "recirculated", "scam"],
        description: "Optional nuance tag for additional context.",
      },
      confidence: {
        type: "number" as const,
        minimum: 0,
        maximum: 100,
        description: "Truthfulness score: 0 = definitely false, 100 = definitely true. Must align with category ranges: likely-true 85-100, partially-true 60-84, unverified 30-59, likely-false 0-29.",
      },
      confidenceDecomposition: {
        type: "object" as const,
        properties: {
          evidenceStrength: {
            type: "number" as const,
            minimum: 0,
            maximum: 100,
            description: "How strong is the evidence found? (0-100)",
          },
          sourceReliability: {
            type: "number" as const,
            minimum: 0,
            maximum: 100,
            description: "How trustworthy are the sources? (0-100)",
          },
          claimComplexity: {
            type: "number" as const,
            minimum: 0,
            maximum: 100,
            description: "How easy is the claim to verify? Higher = easier. (0-100)",
          },
          counterArgumentResilience: {
            type: "number" as const,
            minimum: 0,
            maximum: 100,
            description: "How well did the verdict survive the DA challenge? (0-100)",
          },
        },
        required: ["evidenceStrength", "sourceReliability", "claimComplexity", "counterArgumentResilience"],
        description: "4-component confidence breakdown.",
      },
      summary: {
        type: "string" as const,
        description: "Brief summary of the verdict (max 500 chars).",
        maxLength: 500,
      },
      reasoning: {
        type: "string" as const,
        description: "Detailed reasoning explaining the verdict.",
      },
      manipulationTechniques: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            technique: { type: "string" as const, description: "Name of the manipulation technique." },
            description: { type: "string" as const, description: "How this technique is used." },
            evidenceQuote: { type: "string" as const, description: "Quote from the original claim showing this technique." },
            severity: { type: "number" as const, minimum: 0, maximum: 100, description: "Severity of manipulation (0-100)." },
          },
          required: ["technique", "description", "evidenceQuote", "severity"],
        },
        description: "Manipulation techniques identified in the claim.",
      },
      keyFindings: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Key findings from the investigation.",
      },
      sources: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            url: { type: "string" as const },
            title: { type: "string" as const },
            relevance: { type: "string" as const },
          },
          required: ["url", "title", "relevance"],
        },
        description: "Sources cited in the verdict.",
      },
      whatWouldChangeMyMind: {
        type: "string" as const,
        description: "What evidence would change this verdict?",
      },
      falsificationCriteria: {
        type: "object" as const,
        properties: {
          whatWouldProveTrue: {
            type: "array" as const,
            items: { type: "string" as const },
          },
          whatWouldProveFalse: {
            type: "array" as const,
            items: { type: "string" as const },
          },
        },
        description: "Optional falsification criteria surfaced from the Strategist.",
      },
      devilsAdvocateOutcome: {
        type: "string" as const,
        enum: ["counter_argument_failed", "counter_argument_partially_succeeded", "counter_argument_succeeded"],
        description: "The outcome of the Devil's Advocate challenge.",
      },
      deepReasoningActivated: {
        type: "boolean" as const,
        description: "Whether deep reasoning mode was activated for this investigation.",
      },
      thinkingSummary: {
        type: "string" as const,
        description: "Summary of your thinking process. This will be displayed to end users on the verdict page. Make it clear and concise.",
      },
    },
    required: [
      "category",
      "confidence",
      "confidenceDecomposition",
      "summary",
      "reasoning",
      "manipulationTechniques",
      "keyFindings",
      "sources",
      "whatWouldChangeMyMind",
      "devilsAdvocateOutcome",
      "thinkingSummary",
    ],
  },
};

/** Result returned by runJudge */
export interface JudgeOutput {
  verdict: FinalVerdict;
  costUsd: number;
}

/**
 * Format investigator reports into a readable text block for the Judge prompt.
 */
function formatAgentReports(reports: AgentReport[]): string {
  return reports
    .map((report, index) => {
      const findingsSummary = report.findings
        .map(
          (f) =>
            `  - ${f.claim}: ${f.assessment} (confidence: ${f.confidence}%)`,
        )
        .join("\n");

      const manipulation = report.manipulationIndicators?.length
        ? `\nManipulation indicators: ${report.manipulationIndicators.join(", ")}`
        : "";

      return `### Investigator ${index + 1}: ${report.agentRole}
Summary: ${report.summary}
Overall assessment: ${report.overallAssessment}
Confidence: ${report.confidenceScore}%
Findings:
${findingsSummary}${manipulation}`;
    })
    .join("\n\n");
}

/**
 * Format the challenge report into a readable text block.
 */
function formatChallengeReport(report: ChallengeReport): string {
  const challenges = report.challenges
    .map(
      (c, i) =>
        `  ${i + 1}. [${c.severity.toUpperCase()}] Target: ${c.targetAgent}\n     Claim: ${c.claim}\n     Challenge: ${c.challenge}\n     Evidence: ${c.evidence}`,
    )
    .join("\n");

  return `Counter-argument ${report.counterArgumentSucceeded ? "SUCCEEDED" : "FAILED"}
Overall assessment: ${report.overallAssessment}
Suggested confidence adjustment: ${report.suggestedConfidenceAdjustment}
Summary: ${report.counterArgumentSummary}

Challenges:
${challenges}`;
}

/**
 * Run the Judge agent using Opus 4.6.
 * 3 turns max, tools: brave_web_search + submit_verdict,
 * adaptive thinking (effort: "max").
 * 4-phase system prompt: Strategize → Synthesize → Evaluate → Verdict.
 * Validates output with Zod schema.
 */
export async function runJudge(
  claim: string,
  agentReports: AgentReport[],
  challengeReport: ChallengeReport,
  searchStrategy: SearchStrategy,
  client: ClaudeClient,
  toolRegistry: ToolRegistry,
): Promise<JudgeOutput> {
  const reportsText = formatAgentReports(agentReports);
  const challengeText = formatChallengeReport(challengeReport);

  const falsificationText = [
    "What would prove TRUE:",
    ...searchStrategy.falsificationCriteria.whatWouldProveTrue.map((c, i) => `  ${i + 1}. ${c}`),
    "What would prove FALSE:",
    ...searchStrategy.falsificationCriteria.whatWouldProveFalse.map((c, i) => `  ${i + 1}. ${c}`),
  ].join("\n");

  // Get brave_web_search tool from registry and combine with submit_verdict
  const searchTools = toolRegistry.getToolDefinitions();
  const allTools = [...searchTools, SUBMIT_VERDICT_TOOL];

  const result = await runAgent({
    client,
    model: MODELS.OPUS,
    systemPrompt: JUDGE_SYSTEM_PROMPT,
    messages: [
      {
        role: "user",
        content: `## Claim Under Investigation

"${claim}"

## Falsification Criteria (from Claim Strategist)

${falsificationText}

## Investigator Reports

${reportsText}

## Devil's Advocate Challenge Report

${challengeText}

---

Follow the 4-phase process (Strategize → Synthesize → Evaluate → Verdict). If the DA raised critical concerns, use brave_web_search to independently verify. Then call submit_verdict with your complete verdict.`,
      },
    ],
    maxTurns: MAX_TURNS,
    tools: allTools,
    thinkingConfig: { type: "adaptive" },
    outputConfig: { effort: "max" },
    onToolCall: async (name, input) => {
      if (name === "submit_verdict") {
        return "Verdict submitted successfully.";
      }
      return toolRegistry.execute(name, input);
    },
    timeoutMs: 180_000,
  });

  // Extract thinking summary from thinking blocks
  let thinkingSummary = "";
  if (result.thinkingBlocks.length > 0) {
    // Use the first thinking block, truncated to a reasonable length
    thinkingSummary = result.thinkingBlocks[0]!.substring(0, 500);
  }

  // Find the submit_verdict tool call
  const submitCall = result.toolCalls.find((tc) => tc.name === "submit_verdict");

  if (!submitCall) {
    throw new Error("Judge did not call submit_verdict tool");
  }

  // Inject thinking summary from actual thinking blocks
  const verdictInput = submitCall.input as Record<string, unknown>;
  if (thinkingSummary) {
    verdictInput["thinkingSummary"] = thinkingSummary;
  }

  // Truncate summary if it exceeds 500 chars to prevent Zod rejection
  if (typeof verdictInput["summary"] === "string" && verdictInput["summary"].length > 500) {
    verdictInput["summary"] = verdictInput["summary"].substring(0, 497) + "...";
  }

  // Validate with Zod schema
  const validation = FinalVerdictSchema.safeParse(verdictInput);
  if (!validation.success) {
    logger.error(
      { errors: validation.error.issues, input: verdictInput },
      "Judge output failed Zod validation",
    );
    throw new Error(
      `Judge output failed schema validation: ${validation.error.message}`,
    );
  }

  logger.info(
    {
      category: validation.data.category,
      confidence: validation.data.confidence,
      nuanceTag: validation.data.nuanceTag,
      devilsAdvocateOutcome: validation.data.devilsAdvocateOutcome,
      manipulationTechniquesCount: validation.data.manipulationTechniques.length,
      keyFindingsCount: validation.data.keyFindings.length,
      sourcesCount: validation.data.sources.length,
      costUsd: result.totalCostUsd.toFixed(6),
    },
    "Judge completed",
  );

  return {
    verdict: validation.data,
    costUsd: result.totalCostUsd,
  };
}
