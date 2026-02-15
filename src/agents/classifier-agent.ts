import type { ClaudeClient } from "../services/claude-client.js";
import { MODELS } from "../services/claude-client.js";
import { ClassifierResultSchema, type ClassifierResult } from "../schemas/classifier-result.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

const CLASSIFIER_SYSTEM_PROMPT = `You are a message classifier for a fact-checking bot. Your job is to analyze incoming messages and classify them into one of 5 categories.

You MUST respond with ONLY a valid JSON object (no markdown, no explanation, no code fences). The JSON must match this exact schema:

{
  "category": one of "factual_claim" | "opinion" | "scam" | "greeting" | "other",
  "extractedClaim": string — the core factual claim extracted from the message (empty string if not a factual claim),
  "isCompound": boolean — true if the message contains multiple separate factual claims joined together,
  "domain": one of "public_health" | "geopolitics" | "economics" | "science" | "technology" | "general",
  "language": string — ISO 639-1 language code of the message (e.g. "en", "hi", "ta"),
  "urgency": one of "low" | "medium" | "high",
  "reasoning": string — brief explanation of why you chose this classification
}

Classification guidelines:
- "factual_claim": A specific, verifiable statement of fact (e.g. "PM Modi announced Rs 5000 transfer", "WHO declared green tea cures cancer")
- "opinion": A subjective statement or personal view (e.g. "I think Modi is the best PM", "Democracy is failing")
- "scam": A message that appears to be a scam, phishing, or fraud attempt (e.g. "Click here to claim your prize", "Forward to 10 people to get free data")
- "greeting": A simple greeting or conversational message (e.g. "Hello", "Hi, how are you?", "What can you do?")
- "other": Anything that doesn't fit the above categories

Urgency levels:
- "high": Claims about health, safety, ongoing events, government policy
- "medium": General factual claims about public figures, science, economics
- "low": Greetings, opinions, or low-stakes claims

Domain detection:
- "public_health": Medical claims, disease, treatment, WHO/health org claims
- "geopolitics": Government policy, elections, international relations, political figures
- "economics": Financial schemes, economic indicators, market claims
- "science": Scientific discoveries, climate, space, physics
- "technology": Tech products, AI, cybersecurity
- "general": Anything not fitting the above domains

For compound claims (isCompound: true), extract the primary/most significant claim as extractedClaim.

URL-enriched messages:
- If the message contains article content extracted from a URL (indicated by "[Article from ...]" header), classify based on the ARTICLE'S factual claims, not the URL itself. Extract the primary factual claim from the article content.
- Articles from news sources are typically "factual_claim" unless the article is clearly an opinion piece or satire.`;

/** Result returned by runClassifier */
export interface ClassifierOutput {
  result: ClassifierResult;
  costUsd: number;
}

/**
 * Run the Classifier agent using Haiku.
 * 1 turn, no tools, no thinking.
 * Parses response as JSON, validates with Zod.
 * Retries once on parse failure.
 */
export async function runClassifier(
  message: string,
  client: ClaudeClient,
): Promise<ClassifierOutput> {
  const maxRetries = 1;
  let totalCost = 0;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const { response, costUsd } = await client.createMessage({
      model: MODELS.HAIKU,
      system: CLASSIFIER_SYSTEM_PROMPT,
      max_tokens: 1024,
      messages: [
        {
          role: "user",
          content: `Classify the following message:\n\n${message}`,
        },
      ],
    });

    totalCost += costUsd;

    // Extract text from response
    const textBlock = response.content.find((block) => block.type === "text");
    if (!textBlock || textBlock.type !== "text") {
      lastError = new Error("No text content in classifier response");
      logger.warn(
        { attempt },
        "Classifier returned no text content, retrying",
      );
      continue;
    }

    // Parse JSON from response text
    let parsed: unknown;
    try {
      // Strip markdown code fences if present
      let rawText = textBlock.text.trim();
      if (rawText.startsWith("```")) {
        rawText = rawText.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      parsed = JSON.parse(rawText);
    } catch {
      lastError = new Error(
        `Failed to parse classifier JSON response: ${textBlock.text.substring(0, 200)}`,
      );
      logger.warn(
        { attempt, text: textBlock.text.substring(0, 200) },
        "Classifier returned invalid JSON, retrying",
      );
      continue;
    }

    // Validate with Zod schema
    const validation = ClassifierResultSchema.safeParse(parsed);
    if (!validation.success) {
      lastError = new Error(
        `Classifier output failed schema validation: ${validation.error.message}`,
      );
      logger.warn(
        { attempt, errors: validation.error.issues },
        "Classifier output failed Zod validation, retrying",
      );
      continue;
    }

    logger.info(
      {
        category: validation.data.category,
        domain: validation.data.domain,
        isCompound: validation.data.isCompound,
        costUsd: totalCost.toFixed(6),
      },
      "Classifier completed",
    );

    return {
      result: validation.data,
      costUsd: totalCost,
    };
  }

  // All retries exhausted
  throw lastError ?? new Error("Classifier failed after retries");
}
