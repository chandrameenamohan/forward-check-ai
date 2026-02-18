import { z } from "zod";
import type { EvalClaim } from "../dataset.js";
import type { EvalTrialResult } from "../harness.js";
import type { AgentReport } from "../../src/schemas/agent-report.js";

// ── CoverageGrade schema ────────────────────────────────────────

export const CoverageGradeSchema = z.object({
  mustFindTotal: z.number(),
  mustFindHit: z.number(),
  mustFindMissed: z.array(z.string()),
  totalSourcesFound: z.number(),
  uniqueDomains: z.number(),
  score: z.number().nullable(),
});

export type CoverageGrade = z.infer<typeof CoverageGradeSchema>;

// ── Aggregate result ────────────────────────────────────────────

export interface CoverageAggregateResult {
  avgScore: number;
  avgMustFindHitRate: number;
  avgUniqueDomains: number;
}

// ── Grade a single result for coverage ──────────────────────────

export function gradeCoverage(
  result: EvalTrialResult,
  claim: EvalClaim,
): CoverageGrade {
  const allUrls = collectSourceUrls(result.agentReports);
  const domains = extractUniqueDomains(allUrls);

  // Claims without mustFindSources: return null score
  if (!claim.mustFindSources || claim.mustFindSources.length === 0) {
    return {
      mustFindTotal: 0,
      mustFindHit: 0,
      mustFindMissed: [],
      totalSourcesFound: allUrls.size,
      uniqueDomains: domains.size,
      score: null,
    };
  }

  const mustFindTotal = claim.mustFindSources.length;
  const mustFindMissed: string[] = [];
  let mustFindHit = 0;

  for (const substring of claim.mustFindSources) {
    const lower = substring.toLowerCase();
    const found = [...allUrls].some((url) => url.toLowerCase().includes(lower));
    if (found) {
      mustFindHit++;
    } else {
      mustFindMissed.push(substring);
    }
  }

  // Score = (mustFindHit / mustFindTotal) × 70 + diversity bonus × 30
  const hitRatio = mustFindTotal > 0 ? mustFindHit / mustFindTotal : 0;
  const diversityBonus = Math.min(domains.size / 5, 1);
  const score = Math.round(hitRatio * 70 + diversityBonus * 30);

  return {
    mustFindTotal,
    mustFindHit,
    mustFindMissed,
    totalSourcesFound: allUrls.size,
    uniqueDomains: domains.size,
    score,
  };
}

// ── Collect all source URLs from agent reports ──────────────────

function collectSourceUrls(agentReports: AgentReport[] | undefined): Set<string> {
  const urls = new Set<string>();
  if (!agentReports) return urls;

  for (const report of agentReports) {
    for (const finding of report.findings) {
      for (const source of finding.sources) {
        urls.add(source.url);
      }
    }
  }

  return urls;
}

// ── Extract unique domains from URLs ────────────────────────────

function extractUniqueDomains(urls: Set<string>): Set<string> {
  const domains = new Set<string>();

  for (const url of urls) {
    try {
      const parsed = new URL(url);
      // Remove "www." prefix for deduplication
      const hostname = parsed.hostname.replace(/^www\./, "");
      domains.add(hostname);
    } catch {
      // Skip malformed URLs
    }
  }

  return domains;
}

// ── Aggregate coverage scores ───────────────────────────────────

export function aggregateCoverageScores(
  grades: CoverageGrade[],
): CoverageAggregateResult {
  const scoredGrades = grades.filter((g): g is CoverageGrade & { score: number } => g.score !== null);

  if (scoredGrades.length === 0) {
    return {
      avgScore: 0,
      avgMustFindHitRate: 0,
      avgUniqueDomains: 0,
    };
  }

  const avgScore = scoredGrades.reduce((sum, g) => sum + g.score, 0) / scoredGrades.length;

  const avgMustFindHitRate = scoredGrades.reduce((sum, g) => {
    const rate = g.mustFindTotal > 0 ? (g.mustFindHit / g.mustFindTotal) * 100 : 0;
    return sum + rate;
  }, 0) / scoredGrades.length;

  const avgUniqueDomains = scoredGrades.reduce((sum, g) => sum + g.uniqueDomains, 0) / scoredGrades.length;

  return {
    avgScore,
    avgMustFindHitRate,
    avgUniqueDomains,
  };
}
