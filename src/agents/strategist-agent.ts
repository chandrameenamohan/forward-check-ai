import type { ClaudeClient } from "../services/claude-client.js";
import { MODELS } from "../services/claude-client.js";
import { SearchStrategySchema, type SearchStrategy } from "../schemas/search-strategy.js";
import type { ClassifierResult } from "../schemas/classifier-result.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

const STRATEGIST_SYSTEM_PROMPT = `You are a Claim Strategist — an assignment editor at an investigative newsroom. Your job is to PLAN an investigation before any searching begins.

You will receive a factual claim and its classification. Using your extended thinking, develop a comprehensive investigation strategy.

Your strategy must include:

1. **Claim Characteristics** — Classify the claim type and identify any suspected misinformation patterns.

2. **Investigator Guidance** — Generate targeted search queries and evidence targets for 3 investigator roles:
   - **Source Verification**: Find the claim's origin, check source credibility, find debunks
   - **Domain Expertise**: Check factual accuracy against authoritative sources in the claim's domain
   - **Pattern Matching**: Search fact-checker databases (Snopes, PolitiFact, AltNews, BoomLive), identify misinformation patterns

   For each role, provide:
   - 2-5 targeted search queries
   - Priority sources to check
   - What specifically to look for

3. **Falsification Criteria** — Define what specific evidence would:
   - PROVE this claim TRUE (1-3 criteria)
   - PROVE this claim FALSE (1-3 criteria)

When ready, call the submit_strategy tool with your complete investigation plan.`;

/** Result returned by runStrategist */
export interface StrategistOutput {
  strategy: SearchStrategy;
  costUsd: number;
}

/** Tool definition for submit_strategy */
const SUBMIT_STRATEGY_TOOL = {
  name: "submit_strategy",
  description: "Submit the completed investigation strategy with search queries, evidence targets, and falsification criteria for the investigators.",
  input_schema: {
    type: "object" as const,
    properties: {
      claimCharacteristics: {
        type: "object" as const,
        properties: {
          type: {
            type: "string" as const,
            enum: ["factual_statistic", "authority_claim", "event_claim", "scientific_claim", "policy_claim", "viral_forward"],
            description: "The type of claim being investigated.",
          },
          suspectedPattern: {
            type: "string" as const,
            enum: ["zombie_claim", "statistical_distortion", "authority_impersonation", "out_of_context", "fabrication", "exaggeration", "unknown"],
            description: "Suspected misinformation pattern, if any.",
          },
          verifiabilityAssessment: {
            type: "string" as const,
            description: "Brief assessment of how verifiable this claim is (max 200 chars).",
            maxLength: 200,
          },
        },
        required: ["type", "verifiabilityAssessment"],
      },
      investigatorGuidance: {
        type: "object" as const,
        properties: {
          sourceVerification: {
            type: "object" as const,
            properties: {
              targetQueries: {
                type: "array" as const,
                items: { type: "string" as const },
                minItems: 2,
                maxItems: 5,
                description: "Targeted search queries for source verification.",
              },
              prioritySources: {
                type: "array" as const,
                items: { type: "string" as const },
                description: "Priority sources to check.",
              },
              lookFor: {
                type: "string" as const,
                description: "What specifically to look for.",
              },
            },
            required: ["targetQueries", "prioritySources", "lookFor"],
          },
          domainExpertise: {
            type: "object" as const,
            properties: {
              targetQueries: {
                type: "array" as const,
                items: { type: "string" as const },
                minItems: 2,
                maxItems: 5,
              },
              prioritySources: {
                type: "array" as const,
                items: { type: "string" as const },
              },
              lookFor: { type: "string" as const },
            },
            required: ["targetQueries", "prioritySources", "lookFor"],
          },
          patternMatching: {
            type: "object" as const,
            properties: {
              targetQueries: {
                type: "array" as const,
                items: { type: "string" as const },
                minItems: 2,
                maxItems: 5,
              },
              prioritySources: {
                type: "array" as const,
                items: { type: "string" as const },
              },
              lookFor: { type: "string" as const },
            },
            required: ["targetQueries", "prioritySources", "lookFor"],
          },
        },
        required: ["sourceVerification", "domainExpertise", "patternMatching"],
      },
      falsificationCriteria: {
        type: "object" as const,
        properties: {
          whatWouldProveTrue: {
            type: "array" as const,
            items: { type: "string" as const },
            minItems: 1,
            maxItems: 3,
            description: "Specific evidence that would prove the claim TRUE.",
          },
          whatWouldProveFalse: {
            type: "array" as const,
            items: { type: "string" as const },
            minItems: 1,
            maxItems: 3,
            description: "Specific evidence that would prove the claim FALSE.",
          },
        },
        required: ["whatWouldProveTrue", "whatWouldProveFalse"],
      },
      thinkingExcerpt: {
        type: "string" as const,
        description: "A brief excerpt from your thinking process (max 500 chars). This will be displayed on the verdict page.",
        maxLength: 500,
      },
    },
    required: ["claimCharacteristics", "investigatorGuidance", "falsificationCriteria", "thinkingExcerpt"],
  },
};

/**
 * Run the Claim Strategist agent using Opus 4.6.
 * 1 turn, adaptive thinking (effort: "medium"), uses submit_strategy tool.
 * Validates output with Zod schema.
 */
export async function runStrategist(
  claim: string,
  classifierResult: ClassifierResult,
  client: ClaudeClient,
): Promise<StrategistOutput> {
  const { response, costUsd } = await client.createMessage({
    model: MODELS.OPUS,
    system: STRATEGIST_SYSTEM_PROMPT,
    max_tokens: 16000,
    messages: [
      {
        role: "user",
        content: `Investigate this claim:\n\n"${claim}"\n\nClassification:\n- Category: ${classifierResult.category}\n- Domain: ${classifierResult.domain}\n- Compound: ${classifierResult.isCompound}\n- Language: ${classifierResult.language}\n- Urgency: ${classifierResult.urgency}\n- Reasoning: ${classifierResult.reasoning}`,
      },
    ],
    tools: [SUBMIT_STRATEGY_TOOL],
    thinking: { type: "adaptive" },
    output_config: { effort: "medium" },
  });

  // Extract thinking excerpt from thinking blocks
  let thinkingExcerpt = "";
  for (const block of response.content) {
    if (block.type === "thinking") {
      thinkingExcerpt = block.thinking.substring(0, 500);
      break;
    }
  }

  // Find the submit_strategy tool use block
  const toolUseBlock = response.content.find(
    (block) => block.type === "tool_use" && block.name === "submit_strategy",
  );

  if (!toolUseBlock || toolUseBlock.type !== "tool_use") {
    throw new Error("Strategist did not call submit_strategy tool");
  }

  // Inject thinking excerpt from actual thinking block (overrides what the model may have put)
  const strategyInput = toolUseBlock.input as Record<string, unknown>;
  if (thinkingExcerpt) {
    strategyInput["thinkingExcerpt"] = thinkingExcerpt;
  }

  // Sometimes the model returns nested objects as JSON strings within tool_use input.
  // Parse them back to objects before Zod validation.
  for (const key of Object.keys(strategyInput)) {
    const val = strategyInput[key];
    if (typeof val === "string" && val.startsWith("{")) {
      try {
        strategyInput[key] = JSON.parse(val) as unknown;
      } catch {
        // Not valid JSON — leave as-is for Zod to catch
      }
    }
  }

  // Validate with Zod schema
  const validation = SearchStrategySchema.safeParse(strategyInput);
  if (!validation.success) {
    logger.error(
      { errors: validation.error.issues, input: strategyInput },
      "Strategist output failed Zod validation",
    );
    throw new Error(
      `Strategist output failed schema validation: ${validation.error.message}`,
    );
  }

  logger.info(
    {
      claimType: validation.data.claimCharacteristics.type,
      suspectedPattern: validation.data.claimCharacteristics.suspectedPattern,
      costUsd: costUsd.toFixed(6),
    },
    "Strategist completed",
  );

  return {
    strategy: validation.data,
    costUsd,
  };
}
