/**
 * Capture real Brave Search and Google Fact Check API responses for eval claims.
 * Saves raw JSON to eval/fixtures/{claimId}.json for use in mock eval runs.
 *
 * Usage:
 *   npx tsx scripts/capture-eval-fixtures.ts --all
 *   npx tsx scripts/capture-eval-fixtures.ts --claim false-001
 *   npx tsx scripts/capture-eval-fixtures.ts --claim false-001 --claim true-002
 */
import { resolve, dirname } from "node:path";
import { writeFileSync, mkdirSync } from "node:fs";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { createLogger } from "../src/config/logger.js";
import { braveWebSearch } from "../src/tools/brave-search.js";
import { googleFactCheckSearch } from "../src/tools/google-factcheck.js";
import { evalClaims } from "../eval/dataset.js";
import { FACTUAL_CLAIM_IDS } from "../eval/canned-results.js";
import type { CannedFixture } from "../eval/canned-results.js";

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));
const fixturesDir = resolve(__dirname, "..", "eval", "fixtures");
const logger = createLogger({ level: "info", pretty: true });

function parseArgs(args: string[]): { claimIds: string[] } {
  const claimIds: string[] = [];
  let isAll = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--all") {
      isAll = true;
    } else if (arg === "--claim") {
      const nextArg = args[i + 1];
      if (nextArg) {
        claimIds.push(nextArg);
        i++;
      }
    }
  }

  if (isAll) {
    return { claimIds: [...FACTUAL_CLAIM_IDS] };
  }

  if (claimIds.length === 0) {
    process.stderr.write(
      "Usage: npx tsx scripts/capture-eval-fixtures.ts --all | --claim <id> [--claim <id>...]\n",
    );
    process.exit(1);
  }

  return { claimIds };
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main(): Promise<void> {
  const braveApiKey = process.env["BRAVE_SEARCH_API_KEY"];
  const googleApiKey = process.env["GOOGLE_FACTCHECK_API_KEY"];

  if (!braveApiKey) {
    process.stderr.write("ERROR: BRAVE_SEARCH_API_KEY environment variable required\n");
    process.exit(1);
  }

  const { claimIds } = parseArgs(process.argv.slice(2));

  // Validate claim IDs exist in dataset
  const datasetMap = new Map(evalClaims.map((c) => [c.id, c]));
  for (const id of claimIds) {
    if (!datasetMap.has(id)) {
      process.stderr.write(`ERROR: Unknown claim ID "${id}"\n`);
      process.exit(1);
    }
  }

  mkdirSync(fixturesDir, { recursive: true });

  logger.info(
    { count: claimIds.length, ids: claimIds },
    "Starting fixture capture",
  );

  for (let i = 0; i < claimIds.length; i++) {
    const claimId = claimIds[i]!;
    const claim = datasetMap.get(claimId)!;

    logger.info(
      { index: i + 1, total: claimIds.length, claimId },
      `[${String(i + 1)}/${String(claimIds.length)}] Capturing "${claim.claim.slice(0, 50)}..."`,
    );

    // Call Brave Search
    const braveResponse = await braveWebSearch(claim.claim, 5, braveApiKey);

    // Call Google Fact Check (may not have API key — returns empty if missing)
    let factCheckResponse = { claims: [] as CannedFixture["factCheck"] };
    if (googleApiKey) {
      factCheckResponse = await googleFactCheckSearch(claim.claim, googleApiKey);
    } else {
      logger.warn("GOOGLE_FACTCHECK_API_KEY not set — skipping Google Fact Check");
    }

    const fixture: CannedFixture = {
      claimId,
      claimText: claim.claim,
      capturedAt: new Date().toISOString(),
      brave: braveResponse.results,
      factCheck: factCheckResponse.claims,
    };

    const filePath = resolve(fixturesDir, `${claimId}.json`);
    writeFileSync(filePath, JSON.stringify(fixture, null, 2) + "\n", "utf-8");

    logger.info(
      {
        claimId,
        braveCount: braveResponse.results.length,
        factCheckCount: factCheckResponse.claims.length,
      },
      `  → ${String(braveResponse.results.length)} brave, ${String(factCheckResponse.claims.length)} factCheck`,
    );

    // Rate limit: 1-second delay between requests
    if (i < claimIds.length - 1) {
      await sleep(1000);
    }
  }

  logger.info({ count: claimIds.length }, "Fixture capture complete");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
