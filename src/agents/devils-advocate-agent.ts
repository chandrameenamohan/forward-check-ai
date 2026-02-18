import type { ClaudeClient } from "../services/claude-client.js";
import { MODELS } from "../services/claude-client.js";
import { ChallengeReportSchema, type ChallengeReport } from "../schemas/challenge-report.js";
import type { AgentReport } from "../schemas/agent-report.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** Effort levels for adaptive thinking */
export type EffortLevel = "low" | "medium" | "high" | "max";

const DA_SYSTEM_PROMPT = `You are the Devil's Advocate — a red team adversarial reviewer in an investigative newsroom. Your job is to CHALLENGE the investigator consensus by constructing the STRONGEST possible counter-argument.

You receive:
1. The original claim under investigation
2. Reports from 2-3 investigator agents (Source Verification, Domain Expertise, Pattern Matching)
3. Falsification criteria defined before the investigation began

Your task:
1. **Read all investigator reports carefully.** Identify areas of agreement and disagreement.
2. **Construct the strongest possible counter-argument** to the investigator consensus. Play devil's advocate — argue FOR the claim if investigators say it's false, or AGAINST if they say it's true.
3. **Challenge specific findings.** For each weak point you find, specify which agent made the claim, what the weakness is, how severe it is, and what evidence supports your challenge.
4. **Be honest about the outcome.** After constructing your best counter-argument, you MUST explicitly state whether it SUCCEEDED or FAILED:
   - **SUCCEEDED** = You found genuine weaknesses that materially undermine the investigator consensus
   - **FAILED** = Despite your best efforts, the investigator consensus holds up
5. **Suggest a confidence adjustment** (-30 to +30) based on the strength of your challenges.

**Special case — Exaggeration claims:**
When investigators assess findings as "contradicted" but use language like "misleading," "exaggerated," or "misrepresents," your job extends beyond attacking the consensus. You must also evaluate whether investigators adequately weighed the kernel of truth:
- If the underlying research, event, or data is more rigorous or substantial than investigators acknowledged, flag this as a "partial truth underweighted" concern.
- If the claim is built on real peer-reviewed research (e.g., a real clinical trial, a real WHO report) but overstates the findings, set counterArgumentSucceeded to **true** and recommend "partially-true" rather than "likely-false" in your summary.
- Your challenge in this case is not that the claim is literally true, but that calling it "likely-false" misrepresents the strength of the underlying evidence.

IMPORTANT: Your value comes from intellectual honesty. A counter-argument that FAILS is just as valuable as one that succeeds — it strengthens confidence in the verdict. Do NOT manufacture weak challenges just to have something to report.

When ready, call the submit_challenge tool with your complete challenge report.`;

/** Tool definition for submit_challenge */
const SUBMIT_CHALLENGE_TOOL = {
  name: "submit_challenge",
  description: "Submit the completed challenge report with adversarial analysis of investigator findings.",
  input_schema: {
    type: "object" as const,
    properties: {
      challenges: {
        type: "array" as const,
        items: {
          type: "object" as const,
          properties: {
            targetAgent: {
              type: "string" as const,
              description: "Which investigator agent is being challenged.",
            },
            claim: {
              type: "string" as const,
              description: "The specific claim or finding being challenged.",
            },
            challenge: {
              type: "string" as const,
              description: "The counter-argument or challenge to this finding.",
            },
            severity: {
              type: "string" as const,
              enum: ["critical", "moderate", "minor"],
              description: "How severely this challenge undermines the finding.",
            },
            evidence: {
              type: "string" as const,
              description: "Evidence or reasoning supporting this challenge.",
            },
          },
          required: ["targetAgent", "claim", "challenge", "severity", "evidence"],
        },
        description: "Individual challenges to investigator findings.",
      },
      overallAssessment: {
        type: "string" as const,
        description: "Overall assessment of the investigator consensus after adversarial review.",
      },
      suggestedConfidenceAdjustment: {
        type: "number" as const,
        minimum: -30,
        maximum: 30,
        description: "Suggested confidence adjustment based on challenge strength (-30 to +30).",
      },
      counterArgumentSucceeded: {
        type: "boolean" as const,
        description: "Whether the counter-argument materially undermines the consensus (true) or fails (false).",
      },
      counterArgumentSummary: {
        type: "string" as const,
        description: "Brief summary of the counter-argument and its outcome.",
      },
      thinkingExcerpt: {
        type: "string" as const,
        description: "A brief excerpt from your thinking process (max 500 chars). Displayed on the verdict page.",
        maxLength: 500,
      },
    },
    required: [
      "challenges",
      "overallAssessment",
      "suggestedConfidenceAdjustment",
      "counterArgumentSucceeded",
      "counterArgumentSummary",
      "thinkingExcerpt",
    ],
  },
};

/** Result returned by runDevilsAdvocate */
export interface DevilsAdvocateOutput {
  report: ChallengeReport;
  costUsd: number;
}

/**
 * Format investigator reports into a readable text block for the DA prompt.
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
 * Run the Devil's Advocate agent using Opus 4.6.
 * 1 turn, adaptive thinking (effort: "high" default, "max" when escalated),
 * uses submit_challenge tool for structured output.
 * Validates output with Zod schema.
 */
export async function runDevilsAdvocate(
  claim: string,
  agentReports: AgentReport[],
  falsificationCriteria: string[],
  client: ClaudeClient,
  effortLevel: EffortLevel = "high",
): Promise<DevilsAdvocateOutput> {
  const reportsText = formatAgentReports(agentReports);
  const criteriaText = falsificationCriteria
    .map((c, i) => `${i + 1}. ${c}`)
    .join("\n");

  const { response, costUsd } = await client.createMessage({
    model: MODELS.OPUS,
    system: DA_SYSTEM_PROMPT,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `## Claim Under Investigation

"${claim}"

## Investigator Reports

${reportsText}

## Falsification Criteria (defined before investigation)

${criteriaText}

---

Construct the strongest possible counter-argument to the investigator consensus. Then honestly assess whether your counter-argument SUCCEEDED or FAILED. Call submit_challenge when ready.`,
      },
    ],
    tools: [SUBMIT_CHALLENGE_TOOL],
    thinking: { type: "adaptive" },
    output_config: { effort: effortLevel },
  });

  // Extract thinking excerpt from thinking blocks
  let thinkingExcerpt = "";
  for (const block of response.content) {
    if (block.type === "thinking") {
      thinkingExcerpt = block.thinking.substring(0, 500);
      break;
    }
  }

  // Find the submit_challenge tool use block
  const toolUseBlock = response.content.find(
    (block) => block.type === "tool_use" && block.name === "submit_challenge",
  );

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Devil's Advocate did not call submit_challenge tool");
  }

  // Inject thinking excerpt from actual thinking block
  const challengeInput = toolUseBlock.input as Record<string, unknown>;
  if (thinkingExcerpt) {
    challengeInput["thinkingExcerpt"] = thinkingExcerpt;
  }

  // Validate with Zod schema
  const validation = ChallengeReportSchema.safeParse(challengeInput);
  if (!validation.success) {
    logger.error(
      { errors: validation.error.issues, input: challengeInput },
      "Devil's Advocate output failed Zod validation",
    );
    throw new Error(
      `Devil's Advocate output failed schema validation: ${validation.error.message}`,
    );
  }

  logger.info(
    {
      challengeCount: validation.data.challenges.length,
      counterArgumentSucceeded: validation.data.counterArgumentSucceeded,
      confidenceAdjustment: validation.data.suggestedConfidenceAdjustment,
      effortLevel,
      costUsd: costUsd.toFixed(6),
    },
    "Devil's Advocate completed",
  );

  return {
    report: validation.data,
    costUsd,
  };
}
