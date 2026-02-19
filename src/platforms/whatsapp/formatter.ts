import type { FinalVerdict } from "../../schemas/final-verdict.js";

type VerdictCategory = FinalVerdict["category"];

interface CategoryDisplay {
  emoji: string;
  label: string;
}

const CATEGORY_DISPLAY: Record<VerdictCategory, CategoryDisplay> = {
  "likely-true": { emoji: "🟢", label: "LIKELY TRUE" },
  "partially-true": { emoji: "🟡", label: "PARTIALLY TRUE" },
  "unverified": { emoji: "⚪", label: "UNVERIFIED" },
  "likely-false": { emoji: "🔴", label: "LIKELY FALSE" },
  "satire": { emoji: "🎭", label: "SATIRE" },
  "opinion": { emoji: "💭", label: "OPINION" },
};

const DA_OUTCOME_DISPLAY: Record<FinalVerdict["devilsAdvocateOutcome"], string> = {
  counter_argument_failed: "Challenge failed — verdict held firm",
  counter_argument_partially_succeeded: "Partially succeeded — see full analysis",
  counter_argument_succeeded: "Challenge succeeded — verdict adjusted",
};

const SEPARATOR = "━━━━━━━━━━━━━━━━━━━━━";
const MAX_KEY_FINDINGS = 3;
const MAX_TECHNIQUES = 2;
const MAX_LENGTH = 4000;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Build a 10-char Unicode bar: ▓▓▓▓░░░░░░ */
function buildBar(value: number): string {
  const filled = Math.round(Math.min(100, Math.max(0, value)) / 10);
  return "▓".repeat(filled) + "░".repeat(10 - filled);
}

function padLabel(label: string, width: number): string {
  return label + " ".repeat(Math.max(0, width - label.length));
}

function padValue(value: number): string {
  return String(value).padStart(3, " ");
}

/**
 * Format a FinalVerdict into WhatsApp-compatible markdown text.
 *
 * Uses WhatsApp markdown syntax: *bold*, _italic_
 * No HTML tags allowed.
 * Max ~4000 chars (WhatsApp limit is 4096).
 */
export function formatWhatsAppVerdict(verdict: FinalVerdict): string {
  const display = CATEGORY_DISPLAY[verdict.category];
  const parts: string[] = [];

  // ── Header: emoji + category + confidence + nuance tag ──
  let header = `${display.emoji} *${display.label}* — ${verdict.confidence}% confidence`;
  if (verdict.nuanceTag) {
    header += ` — _${capitalize(verdict.nuanceTag)}_`;
  }
  parts.push(header);

  // ── Deep reasoning indicator (conditional) ──
  if (verdict.deepReasoningActivated) {
    parts.push("\n🧠 *Deep Reasoning* activated");
  }

  // ── Summary ──
  parts.push("");
  parts.push(verdict.summary);

  // ── Confidence Decomposition ──
  const d = verdict.confidenceDecomposition;
  parts.push("");
  parts.push(SEPARATOR);
  parts.push("");
  parts.push("📊 *Confidence Breakdown*");
  parts.push(
    `${padLabel("Evidence", 12)} ${buildBar(d.evidenceStrength)} ${padValue(d.evidenceStrength)}`,
  );
  parts.push(
    `${padLabel("Sources", 12)} ${buildBar(d.sourceReliability)} ${padValue(d.sourceReliability)}`,
  );
  parts.push(
    `${padLabel("Complexity", 12)} ${buildBar(d.claimComplexity)} ${padValue(d.claimComplexity)}`,
  );
  parts.push(
    `${padLabel("Resilience", 12)} ${buildBar(d.counterArgumentResilience)} ${padValue(d.counterArgumentResilience)}`,
  );

  // ── Key Findings ──
  if (verdict.keyFindings.length > 0) {
    parts.push("");
    parts.push(SEPARATOR);
    parts.push("");
    parts.push("📋 *Key Findings*");
    const findings = verdict.keyFindings.slice(0, MAX_KEY_FINDINGS);
    for (const finding of findings) {
      parts.push(`• ${finding}`);
    }
  }

  // ── Manipulation Techniques (top 2 by severity) ──
  const topTechniques = verdict.manipulationTechniques
    .slice()
    .sort((a, b) => b.severity - a.severity)
    .slice(0, MAX_TECHNIQUES);

  if (topTechniques.length > 0) {
    parts.push("");
    parts.push(SEPARATOR);
    parts.push("");
    parts.push("⚠️ *Manipulation Detected*");
    for (const tech of topTechniques) {
      parts.push(`• *${tech.technique}* — ${tech.severity}/100`);
      if (tech.evidenceQuote) {
        parts.push(`  > "${tech.evidenceQuote}"`);
      }
    }
  }

  // ── Footer: Devil's Advocate + Source Count ──
  parts.push("");
  const daText = DA_OUTCOME_DISPLAY[verdict.devilsAdvocateOutcome];
  parts.push(`⚔️ Devil's Advocate: *${daText}*`);

  if (verdict.sources.length > 0) {
    parts.push(
      `📚 Based on ${verdict.sources.length} source${verdict.sources.length === 1 ? "" : "s"}`,
    );
  }

  const result = parts.join("\n");

  // Truncate to stay within WhatsApp's 4096 char limit (leave buffer)
  if (result.length > MAX_LENGTH) {
    return result.slice(0, MAX_LENGTH - 3) + "...";
  }

  return result;
}
