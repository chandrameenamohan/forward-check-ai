import { readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";
import type { BraveSearchResult } from "../src/tools/brave-search.js";
import type { FactCheckClaim } from "../src/tools/google-factcheck.js";

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * IDs of all factual claims that need canned search results.
 * Groups 1-3 (known false, known true, partially true) + Group 5 (adversarial).
 * Group 4 (non-factual) is excluded — those short-circuit before search.
 */
export const FACTUAL_CLAIM_IDS: readonly string[] = [
  "false-001",
  "false-002",
  "false-003",
  "false-004",
  "true-001",
  "true-002",
  "true-003",
  "partial-001",
  "partial-002",
  "partial-003",
  "adversarial-001",
  "adversarial-002",
];

/** Shape of a captured fixture file */
const CannedFixtureSchema = z.object({
  claimId: z.string(),
  claimText: z.string(),
  capturedAt: z.string(),
  brave: z.array(
    z.object({
      title: z.string(),
      url: z.string(),
      description: z.string(),
      age: z.string().optional().default(""),
    }),
  ),
  factCheck: z.array(
    z.object({
      text: z.string(),
      claimant: z.string(),
      claimReviewMarkup: z.object({
        url: z.string(),
        title: z.string(),
        publisher: z.string(),
        rating: z.string(),
      }),
    }),
  ),
});

export type CannedFixture = z.infer<typeof CannedFixtureSchema>;

export interface CannedResults {
  brave: BraveSearchResult[];
  factCheck: FactCheckClaim[];
}

/** In-memory cache to avoid repeated filesystem reads */
const cache = new Map<string, CannedResults>();

/**
 * Load canned search results for a given eval claim ID.
 *
 * Reads from `eval/fixtures/{claimId}.json` and returns parsed Brave + FactCheck results.
 * Results are cached after first load.
 *
 * @throws Error if fixture file is missing or malformed
 */
export function getCannedResults(claimId: string): CannedResults {
  const cached = cache.get(claimId);
  if (cached) {
    return cached;
  }

  const fixturePath = resolve(__dirname, "fixtures", `${claimId}.json`);
  const raw = readFileSync(fixturePath, "utf-8");
  const parsed: unknown = JSON.parse(raw);
  const fixture = CannedFixtureSchema.parse(parsed);

  const results: CannedResults = {
    brave: fixture.brave.map((b) => ({
      title: b.title,
      url: b.url,
      description: b.description,
      age: b.age ?? "",
    })),
    factCheck: fixture.factCheck,
  };

  cache.set(claimId, results);
  return results;
}

/** Clear the in-memory cache (useful for testing) */
export function clearCannedResultsCache(): void {
  cache.clear();
}
