// One process per command: `main.ts <command>`. The test template's files (test/v1/forwardcheck/) each exec this
// with their own name; run.sh also starts the scenes (scenes.ts), which only a local run has. Exit 0 = the command
// RAN (a property that failed is in the SDK's output, and in the report); exit 1 = it could not do its work.
import * as checks from "./checks.js";
import * as scenes from "./scenes.js";
import * as workload from "./workload.js";

const COMMANDS: Record<string, () => Promise<void> | void> = {
  first_setup: workload.setup,
  parallel_driver_claims: workload.claims,
  parallel_driver_judge_disagrees: workload.judgeDisagrees,
  parallel_driver_partial_failure: workload.partialFailure,
  parallel_driver_duplicate_delivery: workload.duplicateDelivery,
  parallel_driver_webhook_signatures: workload.webhookSignatures,
  parallel_driver_repeated_claim: workload.repeatedClaim,
  parallel_driver_late_joiner: workload.lateJoiner,
  parallel_driver_markup: workload.markup,
  parallel_driver_urls: workload.urls,
  parallel_driver_rate_limit: workload.rateLimit,
  anytime_health: checks.health,
  eventually_claims_settle: checks.claimsSettle,
  eventually_whatsapp_answered: checks.whatsappAnswered,
  finally_verdicts: checks.verdicts,
  finally_webhooks: checks.webhooks,
  finally_restart: checks.restart,
  finally_streams: checks.streams,
  finally_pages: checks.pages,
  finally_rate_limit: checks.rateLimit,
  finally_cache: checks.cache,
  finally_windows: checks.windows,
  "scene:model-unavailable": scenes.modelUnavailable,
  "scene:model-slow": scenes.modelSlow,
  "scene:model-frozen": scenes.modelFrozen,
  "scene:search-unavailable": scenes.searchUnavailable,
  "scene:graph-unavailable": scenes.graphUnavailable,
  "scene:app-kill-open": scenes.appKillOpen,
  "scene:app-kill-close": scenes.appKillClose,
};

const name = process.argv[2] ?? "";
const command = COMMANDS[name];
if (!command) {
  process.stderr.write(`usage: main.ts <command>\n${Object.keys(COMMANDS).join("\n")}\n`);
  process.exit(2);
}
let code = 0;
try {
  await command();
} catch (err) {
  code = 1;
  process.stdout.write(`[${name}] COULD NOT RUN: ${err instanceof Error ? err.message : String(err)}\n`);
}
process.exit(code); // an open stream must not keep a finished command alive
