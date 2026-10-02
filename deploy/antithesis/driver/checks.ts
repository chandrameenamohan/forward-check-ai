// The judgement. `anytime_` runs beside the faults, `eventually_` after they stop, `finally_` last.
// Every claim is made from outside the app: its rows, its pages and streams, and what the stubs were sent.
import { claim, guard, happened, reached } from "./sdk.js";
import { APP, cues, finalAnswers, flagged, ledger, page, rows, rowsFor, rowsOf, SETTLE_MS, sleep, streamKinds, stubLog, TERMINAL, waitFor, type Entry, type Row } from "./world.js";

const CATEGORIES = new Set(["likely-true", "partially-true", "unverified", "likely-false", "satire", "opinion"]);
type Verdict = { category?: unknown; confidence?: unknown; summary?: unknown };
const parse = <T>(text: string | null): T | null => {
  try {
    return text === null ? null : (JSON.parse(text) as T);
  } catch {
    return null;
  }
};

/** The claims the app took on: a chat claim answered 201, a signed WhatsApp text answered 200. */
const accepted = (entries: Entry[]): Entry[] => entries.filter((entry) => (entry.channel === "chat" && entry.status === 201 && entry.id !== undefined) || (entry.channel === "whatsapp" && entry.status === 200 && entry.signed === true));
const lastRestart = (): number => Math.max(0, ...cues().filter((cue) => cue.fault === "app-killed").map((cue) => cue.closedAt));
const createdAt = (row: Row): number => Date.parse(`${row.created_at.replace(" ", "T")}Z`);

/** anytime_health: /health, every half second, for as long as run.sh lets it run. */
export async function health(): Promise<void> {
  let duringFault = false;
  while (!flagged("stop-anytime")) {
    if (!flagged("app-down")) {
      const started = Date.now();
      const ok = await fetch(`${APP}/health`, { signal: AbortSignal.timeout(2000) }).then((res) => res.ok, () => false);
      // The flag is read again: a probe that began before the app was killed says nothing about a running app.
      if (!flagged("app-down")) claim("server-answers-through-dependency-faults", ok, { tookMs: Date.now() - started });
      if (flagged("fault-open")) duringFault = true;
    }
    await sleep(500);
  }
  guard("server-answers-through-dependency-faults", duringFault);
}

/** eventually_claims_settle: every accepted claim reaches a terminal status. */
export async function claimsSettle(): Promise<void> {
  const mine = accepted(ledger());
  const settled = (entry: Entry, all: Row[]): boolean => {
    const its = rowsFor(entry, all);
    return its.length > 0 && its.every((row) => TERMINAL.has(row.status));
  };
  await waitFor(() => { const all = rows(); return mine.every((entry) => settled(entry, all)); }, SETTLE_MS, 500);
  const all = rows();
  for (const entry of mine) {
    const its = rowsFor(entry, all);
    claim("accepted-claim-reaches-terminal-status", settled(entry, all), { t: entry.t, channel: entry.channel, kind: entry.kind, rows: its.map((row) => `${row.id}:${row.status}`) });
  }
  guard("accepted-claim-reaches-terminal-status", cues().some((cue) => cue.inFlight.length > 0));
}

/** eventually_whatsapp_answered: every signed text message got a final answer. */
export async function whatsappAnswered(): Promise<void> {
  const mine = accepted(ledger()).filter((entry) => entry.channel === "whatsapp" && entry.phone !== undefined);
  await waitFor(() => { const log = stubLog(); return mine.every((entry) => finalAnswers(entry.phone ?? "", log).length > 0); }, SETTLE_MS, 500);
  const log = stubLog();
  for (const entry of mine) {
    claim("whatsapp-user-always-answered", finalAnswers(entry.phone ?? "", log).length > 0, { t: entry.t, kind: entry.kind, phone: entry.phone, rows: rowsOf(entry.t).map((row) => `${row.id}:${row.status}`) });
  }
  guard("whatsapp-user-always-answered", cues().some((cue) => cue.fault === "graph-unavailable" && cue.inFlight.length > 0));
}

/** finally_verdicts: what was stored against what the Judge and the investigators did. */
export async function verdicts(): Promise<void> {
  const all = rows();
  const log = stubLog();
  const tokens = [...new Set(ledger().map((entry) => entry.t))];
  const inFlight = new Set(cues().flatMap((cue) => cue.inFlight));
  let gateChanged = false;
  let completedAcrossFault = false;
  let emptySearches = false;
  let oneFailedOneReported = false;

  for (const t of tokens) {
    const model = log.filter((entry) => entry.svc === "model" && entry.t === t);
    const submits = model.filter((entry) => entry.agent === "investigator" && entry.step === "submit");
    const fails = model.filter((entry) => entry.agent === "investigator" && entry.step === "fail");
    const judged = model.find((entry) => entry.agent === "judge" && entry.step === "submit");

    for (const row of rowsOf(t, all)) {
      if (row.status === "completed") {
        const verdict = parse<Verdict>(row.final_verdict);
        const view = await page(`/v/${row.id}`).catch(() => ({ status: 0, body: "" }));
        const whole = verdict !== null && typeof verdict.category === "string" && CATEGORIES.has(verdict.category) && typeof verdict.confidence === "number" && typeof verdict.summary === "string"
          && row.completed_at !== null && (parse<unknown[]>(row.agent_reports)?.length ?? 0) > 0 && view.status === 200 && view.body.includes("Scripted verdict");
        claim("completed-investigation-is-whole", whole, { id: row.id, t, page: view.status, verdict: row.final_verdict?.slice(0, 120) ?? null });
        if (inFlight.has(row.id)) completedAcrossFault = true;

        if (judged !== undefined && verdict !== null) {
          const poles = new Set([judged.category, verdict.category]);
          claim("verdict-never-inverts-the-judge", !(poles.has("likely-true") && poles.has("likely-false")), { id: row.id, judgeSubmitted: `${judged.category ?? ""}@${String(judged.confidence)}`, stored: `${String(verdict.category)}@${String(verdict.confidence)}` });
          if (judged.category !== verdict.category) gateChanged = true;
        }
      }
      if (!TERMINAL.has(row.status)) continue;

      // An investigator whose every search came back empty: the investigation must still complete.
      if (submits.some((entry) => (entry.searches ?? 0) > 0 && entry.searchesWithResults === 0)) {
        emptySearches = true;
        // Only a run the model itself was not cut from says anything about search: the Judge must have been reached.
        if (judged !== undefined) claim("search-outage-still-verdict", row.status === "completed", { id: row.id, t, status: row.status });
      }

      // The script says which investigators fail (`x`). Judged only when every other one got to report.
      const script = /inv=([0-9x-]+)/.exec(row.original_message)?.[1]?.split("-") ?? [];
      const scriptedFails = script.filter((score) => score === "x").length;
      if (scriptedFails > 0 && fails.length === scriptedFails && submits.length === script.length - scriptedFails) {
        const kept = parse<unknown[]>(row.agent_reports)?.length ?? 0;
        const held = scriptedFails === script.length ? row.status === "failed" && kept === 0 : kept === submits.length;
        claim("partial-investigator-failure-still-verdict", held, { id: row.id, t, script: script.join("-"), status: row.status, reportsKept: kept });
        if (submits.length > 0) oneFailedOneReported = true;
      }
    }
  }
  guard("verdict-never-inverts-the-judge", gateChanged);
  guard("completed-investigation-is-whole", completedAcrossFault);
  guard("search-outage-still-verdict", emptySearches);
  guard("partial-investigator-failure-still-verdict", oneFailedOneReported);
}

/** finally_webhooks: duplicates, forgeries, and Meta's spelling. */
export function webhooks(): void {
  const entries = ledger();
  const all = rows();
  const log = stubLog();

  const seconds = entries.filter((entry) => entry.kind === "duplicate-second" && entry.status === 200);
  for (const entry of seconds) {
    const made = all.filter((row) => row.platform_message_id === entry.waId);
    claim("one-investigation-per-delivered-message", made.length === 1, { waId: entry.waId, investigations: made.map((row) => `${row.id}:${row.status}`) });
  }
  guard("one-investigation-per-delivered-message", seconds.length > 0);

  const forged = entries.filter((entry) => entry.kind.startsWith("unsigned-"));
  for (const entry of forged) {
    const made = rowsOf(entry.t, all);
    const replies = log.filter((line) => line.svc === "graph" && line.to === entry.phone);
    if (entry.status !== 403 || made.length > 0 || replies.length > 0) happened("no-investigation-from-unsigned-webhook", { kind: entry.kind, status: entry.status, investigations: made.length, replies: replies.length });
  }
  guard("no-investigation-from-unsigned-webhook", ["unsigned-none", "unsigned-bad"].every((kind) => forged.some((entry) => entry.kind === kind && entry.status === 403)));

  const spelled = entries.filter((entry) => entry.kind === "meta-spelling");
  for (const entry of spelled) claim("signed-webhook-always-accepted", entry.status === 200, { status: entry.status, t: entry.t });
  guard("signed-webhook-always-accepted", spelled.some((entry) => entry.note?.["spelledAsStringify"] === false));
}

/** finally_restart: the verdicts that had completed before the app was killed. */
export async function restart(): Promise<void> {
  const all = rows();
  let snapshots = 0;
  for (const cue of cues().filter((entry) => entry.fault === "app-killed")) {
    for (const [id, verdict] of Object.entries(cue.snapshot ?? {})) {
      snapshots += 1;
      const row = all.find((entry) => entry.id === id);
      const view = await page(`/v/${id}`).catch(() => ({ status: 0, body: "" }));
      claim("finished-verdict-survives-restart", row?.status === "completed" && row.final_verdict === verdict && view.status === 200, { id, status: row?.status ?? "gone", sameVerdict: row?.final_verdict === verdict, page: view.status });
    }
  }
  guard("finished-verdict-survives-restart", snapshots > 0);
}

/** finally_streams: each investigation's stream against its row. Only the app's current life has a history to send. */
export async function streams(): Promise<void> {
  const since = lastRestart();
  const all = rows();
  let failedSeen = false;
  for (const t of new Set(ledger().map((entry) => entry.t))) {
    for (const row of rowsOf(t, all)) {
      if (!TERMINAL.has(row.status) || createdAt(row) < since) continue;
      const events = await streamKinds(row.id, 700);
      const kinds = events.map((event) => event.kind);
      const count = (kind: string): number => kinds.filter((entry) => entry === kind).length;
      const nonFactual = events.some((event) => event.kind === "classifier:complete" && (event.data["result"] as { category?: string } | undefined)?.category !== "factual_claim");
      const ends = row.status === "completed" ? count("pipeline:complete") === 1 && count("pipeline:error") === 0
        : row.status === "failed" ? count("pipeline:error") === 1 && count("pipeline:complete") === 0
        : nonFactual && count("pipeline:complete") === 0 && count("pipeline:error") === 0;
      claim("stream-ends-like-the-database", kinds[0] === "pipeline:start" && ends, { id: row.id, status: row.status, kinds });
      if (row.status === "failed") {
        failedSeen = true;
        claim("failed-investigation-tells-the-user", count("pipeline:error") > 0, { id: row.id, kinds });
      }
    }
  }
  guard("failed-investigation-tells-the-user", failedSeen);
  guard("stream-ends-like-the-database", ledger().some((entry) => entry.kind === "late-joiner-seen" && entry.note?.["joinedAfterStart"] === true && entry.note["first"] === "pipeline:start"));
}

/** finally_pages: a user's markup, and a user's URL. */
export async function pages(): Promise<void> {
  const entries = ledger();
  const log = stubLog();
  let shown = false;
  for (const entry of entries.filter((line) => line.kind === "markup-live-page")) {
    const raw = (body: string): boolean => body.includes(`<script>fcxss_${entry.t}`) || body.includes(`<img src=x onerror=fcxss_${entry.t}`);
    const verdict = await page(`/v/${entry.id ?? ""}`).catch(() => ({ status: 0, body: "" }));
    claim("user-markup-never-executes", entry.note?.["raw"] !== true && !raw(verdict.body), { id: entry.id, livePageRaw: entry.note?.["raw"], verdictPageRaw: raw(verdict.body) });
    if (entry.note?.["shown"] === true || verdict.body.includes(`fcxss_${entry.t}`)) shown = true;
  }
  guard("user-markup-never-executes", shown);

  const article = (t: string): string => log.find((line) => line.svc === "model" && line.agent === "classifier" && line.t === t)?.article ?? "";
  for (const entry of entries.filter((line) => line.kind === "url-loopback")) {
    if (article(entry.t) !== "") happened("no-loopback-fetch-from-user-url", { t: entry.t, articleFrom: article(entry.t) });
  }
  guard("no-loopback-fetch-from-user-url", entries.some((entry) => entry.kind === "url-outside" && article(entry.t) === "news.example"));
}

/** finally_rate_limit: the chat's ten claims a minute, per address. */
export function rateLimit(): void {
  const chats = ledger().filter((entry) => entry.channel === "chat" && (entry.status === 201 || entry.status === 429));
  for (const src of new Set(chats.map((entry) => entry.src))) {
    const taken = chats.filter((entry) => entry.src === src && entry.status === 201).map((entry) => entry.at).sort((a, b) => a - b);
    // The ledger's clock is the driver's, a few milliseconds off the app's: a window one second short allows for it.
    const most = Math.max(0, ...taken.map((at, i) => taken.slice(i).filter((later) => later - at < 59_000).length));
    claim("rate-limit-holds", most <= 10, { src, mostAcceptedInAMinute: most });
  }
  guard("rate-limit-holds", chats.some((entry) => entry.status === 429));
}

/** finally_cache: a claim asked again by someone else. */
export function cache(): void {
  const log = stubLog();
  for (const entry of ledger().filter((line) => line.channel === "whatsapp" && line.kind === "repeat-second")) {
    const before = Number(entry.note?.["modelCallsBefore"] ?? -1);
    const now = log.filter((line) => line.svc === "model" && line.t === entry.t).length;
    claim("repeated-claim-reuses-verdict", before > 0 && now === before && finalAnswers(entry.phone ?? "", log).length > 0, { t: entry.t, modelCallsBefore: before, modelCallsNow: now });
  }
}

/** finally_windows: which fault windows the run really entered. */
export function windows(): void {
  const log = stubLog();
  const entered = (fault: string): boolean => cues().some((cue) => cue.fault === fault && cue.inFlight.length > 0);
  if (entered("model-unavailable")) reached("R1");
  if (entered("app-killed")) reached("R2");
  if (entered("search-unavailable") && log.some((entry) => entry.agent === "investigator" && entry.step === "submit" && (entry.searches ?? 0) > 0 && entry.searchesWithResults === 0)) reached("R3");
  if (entered("graph-unavailable")) reached("R4");
  if (ledger().some((entry) => entry.kind === "duplicate-second" && entry.note?.["firstRunning"] === true)) reached("R5");
  const failed = new Set(log.filter((entry) => entry.agent === "investigator" && entry.step === "fail").map((entry) => entry.t));
  if (log.some((entry) => entry.agent === "investigator" && entry.step === "submit" && failed.has(entry.t))) reached("R6");
}
