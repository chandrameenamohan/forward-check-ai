// The properties of antithesis/scratchbook/property-catalog.md as the harness asserts them, and the report's
// judgement over what the SDK wrote. Pure: no SDK, no I/O (sdk.ts emits, report.ts reads files).
//
// The app image is UNCHANGED (change configuration, never code), so every property is asserted from what the app
// shows outside itself: its SQLite rows, its HTTP answers, and what the scripted model and the stubbed third
// parties were sent. README.md lists, per property, which observation that is.

type Kind = "always" | "sometimes" | "unreachable" | "eventually" | "reachability";
export type Property = { slug: string; kind: Kind; priority: "P0" | "P1" | "P2"; claim: string; guard?: string };

/** The fault windows of dangerous-windows-reached: one `reachable` each. */
export const WINDOWS = {
  R1: "the model was cut while an investigation was running",
  R2: "the app was killed while an investigation was running",
  R3: "search was cut while an investigator was searching",
  R4: "the Graph API was cut while an answer was due",
  R5: "the same message was delivered twice while its first delivery was running",
  R6: "one investigator failed while another reported",
} as const;
export type Window = keyof typeof WINDOWS;

// `guard` is the catalog's vacuity guard, word for word (tests/unit/antithesis/catalog.test.ts holds the two together).
export const PROPERTIES: readonly Property[] = [
  { slug: "accepted-claim-reaches-terminal-status", kind: "eventually", priority: "P0", claim: "every claim the app accepted ends completed, completed_non_factual or failed", guard: "an accepted claim was still running when a fault struck" },
  { slug: "verdict-never-inverts-the-judge", kind: "always", priority: "P0", claim: "the stored verdict is never the opposite pole of the one the Judge submitted", guard: "the confidence gate changed the category the Judge submitted" },
  { slug: "completed-investigation-is-whole", kind: "always", priority: "P0", claim: "a completed investigation has a valid verdict, a completion time and a verdict page that shows it", guard: "an investigation that was running when a fault struck went on to complete" },
  { slug: "one-investigation-per-delivered-message", kind: "always", priority: "P0", claim: "a WhatsApp message id makes one investigation however often it is delivered", guard: "the same signed webhook was delivered a second time" },
  { slug: "no-investigation-from-unsigned-webhook", kind: "unreachable", priority: "P0", claim: "a webhook without a valid signature made an investigation or a reply", guard: "an unsigned and a wrongly signed webhook were refused with 403" },
  { slug: "finished-verdict-survives-restart", kind: "always", priority: "P0", claim: "a verdict completed before the app died is unchanged and served after it restarts", guard: "the app was killed after a verdict had completed" },
  { slug: "signed-webhook-always-accepted", kind: "always", priority: "P1", claim: "a correctly signed webhook is accepted whatever the spelling of its JSON", guard: "a signed webhook whose bytes are not what JSON.stringify would write was delivered" },
  { slug: "server-answers-through-dependency-faults", kind: "always", priority: "P1", claim: "/health answers 200 within 2 s whenever the app's container is running", guard: "the probe ran while a dependency was cut" },
  { slug: "failed-investigation-tells-the-user", kind: "always", priority: "P1", claim: "an investigation that failed has pipeline:error on its stream", guard: "an investigation ended failed" },
  { slug: "search-outage-still-verdict", kind: "always", priority: "P1", claim: "an investigation whose searches found nothing still completes", guard: "an investigator's searches all came back empty" },
  { slug: "partial-investigator-failure-still-verdict", kind: "always", priority: "P1", claim: "the reports of the investigators that finished are kept when another fails, and none at all fails the investigation", guard: "one investigator failed while another reported" },
  { slug: "whatsapp-user-always-answered", kind: "eventually", priority: "P1", claim: "every signed text message gets a final answer: a verdict, a redirect or an apology", guard: "the Graph API was cut while an answer was due" },
  { slug: "stream-ends-like-the-database", kind: "always", priority: "P1", claim: "an investigation's stream starts with pipeline:start and carries the one terminal event that matches its row", guard: "a client joined a stream after its investigation had started and was sent the history" },
  { slug: "rate-limit-holds", kind: "always", priority: "P1", claim: "no address has more than 10 chat claims accepted in any 60 s", guard: "a chat claim was refused with 429" },
  { slug: "user-markup-never-executes", kind: "always", priority: "P1", claim: "a user's markup is escaped on every page that shows their message", guard: "a message carrying a script tag was shown on a page" },
  { slug: "no-loopback-fetch-from-user-url", kind: "unreachable", priority: "P1", claim: "the content of a loopback address a user's URL pointed at reached the model", guard: "a user's URL to an outside article was fetched and its content reached the model" },
  { slug: "dangerous-windows-reached", kind: "reachability", priority: "P1", claim: "the run entered every fault window R1..R6" },
  { slug: "repeated-claim-reuses-verdict", kind: "sometimes", priority: "P2", claim: "a claim asked again after its verdict was answered with no further model call" },
];

const known = new Map(PROPERTIES.map((property) => [property.slug, property]));
export const propertyOf = (slug: string): Property => {
  const found = known.get(slug);
  if (!found) throw new Error(`no such property in the catalog: ${slug}`);
  return found;
};

// What the SDK is told. The slug leads, so a line of SDK output can be traced to the catalog without a table.
export const claimMessage = (slug: string): string => `${slug}: ${propertyOf(slug).claim}`;
export const guardMessage = (slug: string): string => `${slug} [guard]: ${propertyOf(slug).guard ?? ""}`;
export const windowMessage = (window: Window): string => `dangerous-windows-reached [${window}]: ${WINDOWS[window]}`;

/** One `antithesis_assert` line of SDK local output, as far as the report reads it. */
export type AssertRecord = { message: string; hit: boolean; condition: boolean; details?: unknown };

/** The SDK's local output is one JSON object per line; anything else in the file (a lifecycle event) is skipped. */
export function parseSdkOutput(text: string): AssertRecord[] {
  const records: AssertRecord[] = [];
  for (const line of text.split("\n")) {
    if (line.trim() === "") continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(line);
    } catch {
      continue; // a process killed mid-write leaves half a line: the lines before it still count
    }
    const assert = typeof parsed === "object" && parsed !== null && "antithesis_assert" in parsed ? parsed.antithesis_assert : undefined;
    if (typeof assert !== "object" || assert === null) continue;
    const { message, hit, condition, details } = assert as Record<string, unknown>;
    if (typeof message === "string" && typeof hit === "boolean" && typeof condition === "boolean") records.push({ message, hit, condition, details });
  }
  return records;
}

type Verdict = "PASS" | "FAIL" | "NOT RUN";
export type Row = { slug: string; kind: Kind; priority: string; verdict: Verdict; passes: number; fails: number; guard: "hit" | "MISSED" | "-"; note: string };

/**
 * PASS/FAIL per property, by the SDK's own rules: an `always` (and an `eventually`, which is an always asserted
 * after the faults stop) fails on one false and is NOT RUN when it was never evaluated (never a PASS); an
 * `unreachable` fails on one hit; a `sometimes` and each reachability window need one true. A guard is hit by one true.
 */
export function judge(records: readonly AssertRecord[]): Row[] {
  const count = (message: string): { passes: number; fails: number } => {
    const mine = records.filter((record) => record.hit && record.message === message);
    return { passes: mine.filter((record) => record.condition).length, fails: mine.filter((record) => !record.condition).length };
  };
  return PROPERTIES.map((property): Row => {
    const { slug, kind, priority } = property;
    const guard = property.guard === undefined ? "-" : count(guardMessage(slug)).passes > 0 ? "hit" : "MISSED";
    const row = (verdict: Verdict, passes: number, fails: number, note = ""): Row => ({ slug, kind, priority, verdict, passes, fails, guard, note });
    if (kind === "reachability") {
      const missed = (Object.keys(WINDOWS) as Window[]).filter((window) => count(windowMessage(window)).passes === 0);
      return row(missed.length === 0 ? "PASS" : "FAIL", Object.keys(WINDOWS).length - missed.length, missed.length, missed.length === 0 ? "" : `not reached: ${missed.join(" ")}`);
    }
    const { passes, fails } = count(claimMessage(slug));
    // An unreachable is emitted only when it happens, so its hits are all failures, whatever `condition` says.
    if (kind === "unreachable") return row(passes + fails > 0 ? "FAIL" : "PASS", 0, passes + fails);
    if (kind === "sometimes") return row(passes > 0 ? "PASS" : "FAIL", passes, fails, passes > 0 ? "" : "never true");
    return row(fails > 0 ? "FAIL" : passes > 0 ? "PASS" : "NOT RUN", passes, fails);
  });
}

export function table(rows: readonly Row[]): string {
  const lines = [`${"property".padEnd(44)}${"type".padEnd(14)}${"pri".padEnd(5)}${"result".padEnd(9)}${"pass".padEnd(6)}${"fail".padEnd(6)}guard`];
  for (const row of rows) lines.push(`${row.slug.padEnd(44)}${row.kind.padEnd(14)}${row.priority.padEnd(5)}${row.verdict.padEnd(9)}${String(row.passes).padEnd(6)}${String(row.fails).padEnd(6)}${row.guard}${row.note === "" ? "" : `  (${row.note})`}`);
  const guarded = rows.filter((row) => row.guard !== "-");
  lines.push(`${String(rows.filter((row) => row.verdict === "PASS").length)}/${String(rows.length)} properties PASS, ${String(guarded.filter((row) => row.guard === "hit").length)}/${String(guarded.length)} vacuity guards hit`);
  return lines.join("\n");
}

/** The two named checks: baseline-all-pass and vacuity-guards-hit. Empty = the check holds. */
export const notPassing = (rows: readonly Row[]): string[] => rows.filter((row) => row.verdict !== "PASS").map((row) => `${row.slug}: ${row.verdict}${row.note === "" ? "" : ` (${row.note})`}`);
export const guardsMissed = (rows: readonly Row[]): string[] => rows.filter((row) => row.guard === "MISSED").map((row) => `${row.slug}: its guard never fired`);
