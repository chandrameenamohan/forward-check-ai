import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { ClaudeClient } from "../../services/claude-client.js";
import { MODELS } from "../../services/claude-client.js";
import { AgentReportSchema, type AgentReport } from "../../schemas/agent-report.js";
import type { SearchStrategy } from "../../schemas/search-strategy.js";
import type { ToolRegistry } from "../../tools/tool-registry.js";
import { runAgent } from "../../orchestrator/agent-runner.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/** Max turns for the investigator agent loop */
const MAX_TURNS = 4;

/** Result returned by runSourceVerification */
export interface SourceVerificationOutput {
  report: AgentReport;
  costUsd: number;
}

/** Build the system prompt with search strategy guidance injected */
function buildSystemPrompt(
  claim: string,
  guidance: SearchStrategy["investigatorGuidance"]["sourceVerification"],
): string {
  return `You are a Source Verification Investigator — Reporter 1 in an investigative newsroom. Your job is to find the claim's origin, check source credibility, and find any debunks.

## Your Investigation Target
Claim: "${claim}"

## Your Specific Guidance
- **Priority sources to check:** ${guidance.prioritySources.join(", ")}
- **What to look for:** ${guidance.lookFor}
- **Suggested search queries:** ${guidance.targetQueries.join("; ")}

## Your Investigation Process
1. **Search for the claim's origin** — Who first published it? Where did it appear?
2. **Evaluate source credibility** — Is the source authoritative? Is it known for misinformation?
3. **Search for debunks** — Has this claim been fact-checked? What did fact-checkers conclude?
4. **Compile findings** — Summarize what you found with source citations.

## DO
- Use brave_web_search to find claim origins and credibility assessments
- Use google_fact_check_search to find existing fact-checks
- Check multiple sources to corroborate findings
- Note any manipulation indicators (fabricated sources, misleading headlines, etc.)
- Assess each source's credibility (high, medium, low, unknown)

## DO NOT
- Make up sources or URLs
- Speculate beyond what the evidence supports
- Duplicate effort with other investigators (domain expertise or pattern matching)
- Exceed 4 search tool calls total

When you have completed your investigation, call the submit_report tool with your findings.`;
}

/** Tool definition for submit_report — structured output from the investigator */
const SUBMIT_REPORT_TOOL: Tool = {
  name: "submit_report",
  description:
    "Submit your completed investigation report with findings, sources, and confidence assessment.",
  input_schema: {
    type: "object" as const,
    properties: {
      agentRole: {
        type: "string" as const,
        enum: ["source_verification"],
        description: "Your role: source_verification",
      },
      summary: {
        type: "string" as const,
        description: "Brief summary of your investigation findings (max 500 chars).",
        maxLength: 500,
      },
      findings: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            claim: {
              type: "string" as const,
              description: "The specific claim or sub-claim being assessed.",
            },
            assessment: {
              type: "string" as const,
              enum: ["supported", "contradicted", "insufficient_evidence", "mixed"],
            },
            confidence: {
              type: "number" as const,
              minimum: 0,
              maximum: 100,
            },
            sources: {
              type: "array" as const,
              items: {
                type: "object" as const,
                properties: {
                  url: { type: "string" as const },
                  title: { type: "string" as const },
                  credibility: {
                    type: "string" as const,
                    enum: ["high", "medium", "low", "unknown"],
                  },
                  relevantSnippet: { type: "string" as const },
                },
                required: ["url", "title", "credibility", "relevantSnippet"],
              },
            },
            rawSnippets: {
              type: "array" as const,
              items: { type: "string" as const },
              description: "Raw text snippets from search results.",
            },
          },
          required: ["claim", "assessment", "confidence", "sources"],
        },
      },
      manipulationIndicators: {
        type: "array" as const,
        items: { type: "string" as const },
        description: "Any manipulation techniques or red flags identified.",
      },
      overallAssessment: {
        type: "string" as const,
        description: "Overall assessment of the claim based on source verification.",
      },
      confidenceScore: {
        type: "number" as const,
        minimum: 0,
        maximum: 100,
        description: "Overall confidence score (0-100).",
      },
    },
    required: [
      "agentRole",
      "summary",
      "findings",
      "overallAssessment",
      "confidenceScore",
    ],
  },
};

/**
 * Run the Source Verification investigator agent using Sonnet 4.5.
 * 4 turns max, tools: brave_web_search + google_fact_check_search + submit_report.
 * Returns AgentReport with agentRole: "source_verification".
 */
export async function runSourceVerification(
  claim: string,
  searchStrategy: SearchStrategy,
  client: ClaudeClient,
  toolRegistry: ToolRegistry,
): Promise<SourceVerificationOutput> {
  const guidance = searchStrategy.investigatorGuidance.sourceVerification;
  const systemPrompt = buildSystemPrompt(claim, guidance);

  // Combine search tools with submit_report tool
  const searchTools = toolRegistry.getToolDefinitions();
  const allTools = [...searchTools, SUBMIT_REPORT_TOOL];

  const result = await runAgent({
    client,
    model: MODELS.SONNET,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: `Investigate the following claim for source verification:\n\n"${claim}"\n\nUse the search tools to find the claim's origin, evaluate source credibility, and look for existing debunks. When done, call submit_report with your findings.`,
      },
    ],
    maxTurns: MAX_TURNS,
    tools: allTools,
    onToolCall: async (name, input) => {
      if (name === "submit_report") {
        // submit_report is handled after the loop — return acknowledgment
        return "Report submitted successfully.";
      }
      return toolRegistry.execute(name, input);
    },
  });

  // Try to extract report from submit_report tool call
  const submitCall = result.toolCalls.find((tc) => tc.name === "submit_report");

  let reportData: unknown;
  if (submitCall) {
    reportData = submitCall.input;
  } else {
    // Fallback: try to parse the text output as JSON
    logger.warn("Source verification agent did not call submit_report, attempting text parse");
    const text = result.text.trim();
    // Strip markdown code fences if present
    const jsonText = text.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
    reportData = JSON.parse(jsonText);
  }

  // Validate with Zod schema
  const validation = AgentReportSchema.safeParse(reportData);
  if (!validation.success) {
    logger.error(
      { errors: validation.error.issues, input: reportData },
      "Source verification report failed Zod validation",
    );
    throw new Error(
      `Source verification report failed schema validation: ${validation.error.message}`,
    );
  }

  logger.info(
    {
      confidenceScore: validation.data.confidenceScore,
      findingsCount: validation.data.findings.length,
      toolCallsCount: result.toolCalls.length,
      costUsd: result.totalCostUsd.toFixed(6),
    },
    "Source verification investigator completed",
  );

  return {
    report: validation.data,
    costUsd: result.totalCostUsd,
  };
}
