import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { ClaudeClient } from "../../services/claude-client.js";
import { MODELS } from "../../services/claude-client.js";
import type { AgentReport } from "../../schemas/agent-report.js";
import type { SearchStrategy } from "../../schemas/search-strategy.js";
import type { ToolRegistry } from "../../tools/tool-registry.js";
import { runAgent } from "../../orchestrator/agent-runner.js";
import { extractReport } from "./report-extractor.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/** Max turns for the investigator agent loop */
const MAX_TURNS = 6;

/** Result returned by runPatternMatching */
export interface PatternMatchingOutput {
  report: AgentReport;
  costUsd: number;
}

/** Build the system prompt with search strategy guidance injected */
function buildSystemPrompt(
  claim: string,
  guidance: SearchStrategy["investigatorGuidance"]["patternMatching"],
): string {
  return `You are a Pattern Matching Investigator — Reporter 3 in an investigative newsroom. Your job is to search fact-checker databases for existing debunks and identify known misinformation patterns.

## Your Investigation Target
Claim: "${claim}"

## Your Specific Guidance
- **Priority sources to check:** ${guidance.prioritySources.join(", ")}
- **What to look for:** ${guidance.lookFor}
- **Suggested search queries:** ${guidance.targetQueries.join("; ")}

## Your Investigation Process
1. **Search fact-checker databases** — Check Snopes, PolitiFact, AltNews, BoomLive, and other fact-checking organizations for existing debunks of this claim or closely related claims.
2. **Identify misinformation patterns** — Does this match known patterns? Zombie claims (debunked but resurfacing), chain messages (WhatsApp/social media forwards), manipulated media indicators, fabricated authority claims.
3. **Check for viral spread indicators** — Has this claim gone viral? On which platforms? How long has it been circulating?
4. **Compile findings** — Summarize existing debunks and pattern matches with source citations.

## DO
- Use brave_web_search to find existing fact-checks on Snopes, PolitiFact, AltNews, BoomLive, FactCheck.org
- Use google_fact_check_search to find claims reviewed by fact-checking organizations
- Look for variations of the same claim (slightly different wording, different dates)
- Identify the misinformation pattern type (zombie claim, chain message, manipulated media, fabrication)
- Note how widely the claim has spread and on which platforms

## DO NOT
- Make up sources or URLs
- Speculate beyond what the evidence supports
- Duplicate effort with other investigators (source verification or domain expertise)
- Exceed 5 search tool calls total

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
        enum: ["pattern_matching"],
        description: "Your role: pattern_matching",
      },
      summary: {
        type: "string" as const,
        description: "Brief summary of your investigation findings (max 800 chars).",
        maxLength: 800,
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
        description: "Overall assessment of the claim based on pattern matching analysis.",
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
 * Run the Pattern Matching investigator agent using Sonnet 4.5.
 * 6 turns max, tools: brave_web_search + google_fact_check_search + submit_report.
 * Searches fact-checker databases for existing debunks and identifies misinformation patterns.
 * Returns AgentReport with agentRole: "pattern_matching".
 */
export async function runPatternMatching(
  claim: string,
  searchStrategy: SearchStrategy,
  client: ClaudeClient,
  toolRegistry: ToolRegistry,
): Promise<PatternMatchingOutput> {
  const guidance = searchStrategy.investigatorGuidance.patternMatching;
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
        content: `Investigate the following claim for pattern matching against known misinformation:\n\n"${claim}"\n\nUse brave_web_search and google_fact_check_search to find existing fact-checks and identify misinformation patterns. When done, call submit_report with your findings.`,
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

  // Extract and validate report (with retry and JSON fallback)
  // Pass result._messages so retry has full conversation context (search results, analysis)
  const report = await extractReport({
    toolCalls: result.toolCalls,
    text: result.text,
    agentRole: "pattern_matching",
    client,
    model: MODELS.SONNET,
    systemPrompt,
    messages: result._messages,
    tools: allTools,
  });
  const validation = { data: report };

  logger.info(
    {
      confidenceScore: validation.data.confidenceScore,
      findingsCount: validation.data.findings.length,
      toolCallsCount: result.toolCalls.length,
      costUsd: result.totalCostUsd.toFixed(6),
    },
    "Pattern matching investigator completed",
  );

  return {
    report: validation.data,
    costUsd: result.totalCostUsd,
  };
}
