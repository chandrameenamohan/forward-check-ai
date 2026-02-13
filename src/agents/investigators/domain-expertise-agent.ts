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

/** Result returned by runDomainExpertise */
export interface DomainExpertiseOutput {
  report: AgentReport;
  costUsd: number;
}

/** Domain type matching the ClassifierResult domain enum */
type Domain = "public_health" | "geopolitics" | "economics" | "science" | "technology" | "general";

/** Domain-specific framing for system prompts */
const DOMAIN_FRAMING: Record<Domain, string> = {
  public_health: `You are a Public Health & Medical Domain Expert. Your expertise covers:
- Medical research methodology and clinical trials
- WHO, CDC, and public health authority communications
- Epidemiology and disease prevention
- Pharmaceutical claims and drug efficacy
- Health misinformation patterns (miracle cures, anti-vax, conspiracy theories)

Evaluate claims against peer-reviewed medical literature and official health authority positions.`,
  geopolitics: `You are a Geopolitics & International Relations Domain Expert. Your expertise covers:
- International diplomacy and treaties
- Government policy announcements and official statements
- Political party platforms and election claims
- Sanctions, trade agreements, and international law
- Propaganda techniques and state-sponsored misinformation

Evaluate claims against official government records, diplomatic cables, and credible news sources.`,
  economics: `You are an Economics & Finance Domain Expert. Your expertise covers:
- Government economic policy and budget announcements
- Market data, GDP statistics, and employment figures
- Central bank communications and monetary policy
- Corporate earnings and financial reporting
- Economic misinformation (fake schemes, fraudulent investment claims)

Evaluate claims against official economic data, central bank reports, and financial regulatory filings.`,
  science: `You are a Science & Technology Research Domain Expert. Your expertise covers:
- Peer-reviewed scientific publications
- Climate science and environmental data
- Physics, chemistry, and biology research
- Space exploration and astronomy claims
- Scientific misinformation and pseudoscience patterns

Evaluate claims against published research, scientific consensus, and authoritative academic sources.`,
  technology: `You are a Technology & Digital Systems Domain Expert. Your expertise covers:
- Software, hardware, and AI capabilities
- Cybersecurity threats and data breaches
- Tech company announcements and product launches
- Digital privacy and surveillance claims
- Tech misinformation (fake features, exaggerated capabilities)

Evaluate claims against official product documentation, company announcements, and technical specifications.`,
  general: `You are a General Knowledge Domain Expert. Your expertise covers a broad range of topics. Apply critical thinking and evidence-based analysis to evaluate the claim's factual accuracy.

Evaluate claims against authoritative sources, official records, and credible reporting.`,
};

/** Build the system prompt with domain-specific framing and search strategy guidance */
function buildSystemPrompt(
  claim: string,
  domain: Domain,
  guidance: SearchStrategy["investigatorGuidance"]["domainExpertise"],
): string {
  return `${DOMAIN_FRAMING[domain]}

You are Reporter 2 (Domain Expert) in an investigative newsroom. Your job is to check factual accuracy against authoritative domain-specific sources.

## Your Investigation Target
Claim: "${claim}"
Domain: ${domain}

## Your Specific Guidance
- **Priority sources to check:** ${guidance.prioritySources.join(", ")}
- **What to look for:** ${guidance.lookFor}
- **Suggested search queries:** ${guidance.targetQueries.join("; ")}

## Your Investigation Process
1. **Search for authoritative domain sources** — Find official data, peer-reviewed studies, or expert analysis relevant to the claim.
2. **Evaluate factual accuracy** — Does the evidence support or contradict the claim?
3. **Assess context and nuance** — Is the claim misleading even if partially true? Is it taken out of context?
4. **Compile findings** — Summarize what you found with source citations.

## DO
- Use brave_web_search to find authoritative domain-specific sources
- Focus on official data, peer-reviewed research, and expert analysis
- Check multiple sources to corroborate findings
- Note any manipulation indicators (cherry-picked data, out-of-context quotes, etc.)
- Assess each source's credibility (high, medium, low, unknown)

## DO NOT
- Make up sources or URLs
- Speculate beyond what the evidence supports
- Duplicate effort with other investigators (source verification or pattern matching)
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
        enum: ["domain_expertise"],
        description: "Your role: domain_expertise",
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
        description: "Overall assessment of the claim based on domain expertise analysis.",
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
 * Run the Domain Expertise investigator agent using Sonnet 4.5.
 * 6 turns max, tools: brave_web_search + submit_report.
 * System prompt dynamically templated based on domain.
 * Returns AgentReport with agentRole: "domain_expertise".
 */
export async function runDomainExpertise(
  claim: string,
  domain: string,
  searchStrategy: SearchStrategy,
  client: ClaudeClient,
  toolRegistry: ToolRegistry,
): Promise<DomainExpertiseOutput> {
  const validDomain = domain as Domain;
  const guidance = searchStrategy.investigatorGuidance.domainExpertise;
  const systemPrompt = buildSystemPrompt(claim, validDomain, guidance);

  // Only use brave_web_search (not google_fact_check_search) + submit_report
  const braveToolDef = toolRegistry.getToolDefinitions().find((t) => t.name === "brave_web_search");
  const tools: Tool[] = braveToolDef ? [braveToolDef, SUBMIT_REPORT_TOOL] : [SUBMIT_REPORT_TOOL];

  const result = await runAgent({
    client,
    model: MODELS.SONNET,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: `Investigate the following claim from a ${validDomain} domain expertise perspective:\n\n"${claim}"\n\nUse brave_web_search to find authoritative sources and domain-specific evidence. When done, call submit_report with your findings.`,
      },
    ],
    maxTurns: MAX_TURNS,
    tools,
    onToolCall: async (name, input) => {
      if (name === "submit_report") {
        return "Report submitted successfully.";
      }
      return toolRegistry.execute(name, input);
    },
  });

  // Extract and validate report (with retry and JSON fallback)
  const report = await extractReport({
    toolCalls: result.toolCalls,
    text: result.text,
    agentRole: "domain_expertise",
    client,
    model: MODELS.SONNET,
    systemPrompt,
    messages: [
      {
        role: "user",
        content: `Investigate the following claim from a ${validDomain} domain expertise perspective:\n\n"${claim}"\n\nUse brave_web_search to find authoritative sources and domain-specific evidence. When done, call submit_report with your findings.`,
      },
    ],
    tools,
  });
  const validation = { data: report };

  logger.info(
    {
      domain: validDomain,
      confidenceScore: validation.data.confidenceScore,
      findingsCount: validation.data.findings.length,
      toolCallsCount: result.toolCalls.length,
      costUsd: result.totalCostUsd.toFixed(6),
    },
    "Domain expertise investigator completed",
  );

  return {
    report: validation.data,
    costUsd: result.totalCostUsd,
  };
}
