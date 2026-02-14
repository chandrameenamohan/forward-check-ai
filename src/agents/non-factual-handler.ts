import type { ClassifierResult } from "../schemas/classifier-result.js";

export interface NonFactualResponse {
  text: string;
  shouldInvestigate: false;
}

const RESPONSES: Record<string, string> = {
  greeting: [
    "Hi there! I'm ForwardCheck — a fact-checking bot.",
    "Forward me a message or send me a claim, and I'll investigate whether it's true or false using multiple AI agents and web sources.",
    "Just paste or forward the claim you'd like me to check!",
  ].join("\n\n"),

  opinion: [
    "This looks like an opinion or personal view rather than a factual claim.",
    "I'm designed to fact-check verifiable statements — things that can be confirmed or denied with evidence.",
    "If you have a specific factual claim you'd like me to investigate, go ahead and send it!",
  ].join("\n\n"),

  scam: [
    "⚠️ Warning: This message looks suspicious and may be a scam.",
    "Here are some safety tips:\n• Don't click on unknown links\n• Never share personal information or OTPs\n• Don't forward chain messages\n• If it sounds too good to be true, it probably is",
    "Stay safe! If you have a factual claim to check, feel free to send it.",
  ].join("\n\n"),

  other: [
    "I wasn't able to identify a specific factual claim in that message.",
    "To get the best results, try forwarding a message that contains a verifiable claim — something like a news headline, a viral forward, or a statement about events or public figures.",
  ].join("\n\n"),
};

/**
 * Returns a quick response for non-factual message categories.
 * These bypass the full investigation pipeline.
 */
export function handleNonFactual(result: ClassifierResult): NonFactualResponse {
  const text = RESPONSES[result.category] ?? RESPONSES["other"]!;
  return { text, shouldInvestigate: false as const };
}
