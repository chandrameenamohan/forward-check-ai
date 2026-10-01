// The only file that talks to the Antithesis SDK. In local-output mode (ANTITHESIS_SDK_LOCAL_OUTPUT, one file per
// process: run.sh sets it per command) every call below becomes a JSON line that report.ts judges; inside
// Antithesis the same calls reach the platform, with nothing here changed.
// The SDK writes the FIRST pass and the FIRST fail of each message per process, so a count in the report is a
// count of processes that saw it, not of calls. The first failure's details are also printed, as a FAIL line.
import { always, reachable, setupComplete, sometimes, unreachable } from "antithesis-sdk";
import { claimMessage, guardMessage, propertyOf, windowMessage, type Window } from "./properties.js";

type Details = Parameters<typeof always>[2];
const json = (details: Record<string, unknown>): Details => JSON.parse(JSON.stringify(details)) as Details;
const say = (line: string): void => { process.stdout.write(`${line}\n`); };

/** An `always` / `eventually` property's claim, evaluated once: true = it held here. A `sometimes` property too. */
export function claim(slug: string, held: boolean, details: Record<string, unknown> = {}): void {
  const { kind } = propertyOf(slug);
  if (kind === "unreachable" || kind === "reachability") throw new Error(`${slug} is ${kind}: use happened() or reached()`);
  if (kind === "sometimes") sometimes(held, claimMessage(slug), json(details));
  else always(held, claimMessage(slug), json(details));
  if (!held && kind !== "sometimes") say(`FAIL ${claimMessage(slug)} ${JSON.stringify(details)}`);
}

/** An `unreachable` property's claim HAPPENED: the failure itself. Never called when all is well. */
export function happened(slug: string, details: Record<string, unknown>): void {
  if (propertyOf(slug).kind !== "unreachable") throw new Error(`${slug} is not an unreachable property`);
  unreachable(claimMessage(slug), json(details));
  say(`FAIL ${claimMessage(slug)} ${JSON.stringify(details)}`);
}

/** A property's vacuity guard: true = its path really ran in what this process looked at. */
export function guard(slug: string, hit: boolean, details: Record<string, unknown> = {}): void {
  sometimes(hit, guardMessage(slug), json(details));
}

/** A fault window of dangerous-windows-reached: called only when the run entered it. */
export function reached(window: Window, details: Record<string, unknown> = {}): void {
  reachable(windowMessage(window), json(details));
}

/** `first_` is done: the system and the workload's world exist. Inside Antithesis, faults start from here. */
export function ready(details: Record<string, unknown>): void {
  setupComplete(json(details));
}
