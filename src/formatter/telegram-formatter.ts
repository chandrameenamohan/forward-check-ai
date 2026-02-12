import type { FinalVerdict } from "../schemas/final-verdict.js";

type VerdictCategory = FinalVerdict["category"];

interface CategoryDisplay {
  emoji: string;
  label: string;
}

const CATEGORY_DISPLAY: Record<VerdictCategory, CategoryDisplay> = {
  "likely-true": { emoji: "\u{1F7E2}", label: "LIKELY TRUE" },
  "partially-true": { emoji: "\u{1F7E1}", label: "PARTIALLY TRUE" },
  "unverified": { emoji: "\u26AA", label: "UNVERIFIED" },
  "likely-false": { emoji: "\u{1F534}", label: "LIKELY FALSE" },
  "satire": { emoji: "\u{1F3AD}", label: "SATIRE" },
  "opinion": { emoji: "\u{1F4AD}", label: "OPINION" },
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

export function formatTelegramVerdict(verdict: FinalVerdict): string {
  const display = CATEGORY_DISPLAY[verdict.category];
  const parts: string[] = [];

  // Header: emoji + category + confidence
  let header = `${display.emoji} <b>${display.label}</b> — ${verdict.confidence}% confidence`;
  if (verdict.nuanceTag) {
    header += ` — <i>${capitalize(verdict.nuanceTag)}</i>`;
  }
  parts.push(header);

  // Deep reasoning indicator
  if (verdict.deepReasoningActivated) {
    parts.push(`\u{1F9E0} <b>Deep Reasoning Mode</b> activated`);
  }

  // Summary
  parts.push("");
  parts.push(escapeHtml(verdict.summary));

  // Manipulation techniques (top 2)
  const topTechniques = verdict.manipulationTechniques
    .slice()
    .sort((a, b) => b.severity - a.severity)
    .slice(0, 2);

  if (topTechniques.length > 0) {
    parts.push("");
    parts.push("\u{26A0}\u{FE0F} <b>Manipulation Techniques:</b>");
    for (const tech of topTechniques) {
      parts.push(`\u{2022} <b>${escapeHtml(tech.technique)}</b>`);
    }
  }

  const result = parts.join("\n");

  // Truncate to stay within Telegram's ~4000 char limit
  if (result.length > 3900) {
    return result.slice(0, 3897) + "...";
  }

  return result;
}
