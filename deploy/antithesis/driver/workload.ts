// The workload: what users do. Each export is one `first_` / `parallel_driver_` command, a process of its own that
// knows nothing about faults. What it sent goes in the ledger; the checks (checks.ts) judge it later.
import { ready } from "./sdk.js";
import { APP, chat, directive, record, rows, rowsOf, sleep, stubLog, TERMINAL, token, toxi, waitFor, whatsapp, finalAnswers, newPhone, page, streamKinds } from "./world.js";

const PROXIES = ["model", "news", "brave", "factcheck", "graph"];

/** first_setup: the slice is up, toxiproxy holds every listener, the app answers. */
export async function setup(): Promise<void> {
  const proxies = (await toxi("GET", "/proxies")) as Record<string, { enabled: boolean }>;
  const missing = PROXIES.filter((name) => proxies[name] === undefined);
  if (missing.length > 0) throw new Error(`toxiproxy has no listener for: ${missing.join(", ")}`);
  for (const name of PROXIES) await toxi("POST", `/proxies/${name}`, { enabled: true });
  const up = await waitFor(async () => (await fetch(`${APP}/health`).then((res) => res.ok, () => false)), 60_000, 500);
  if (!up) throw new Error("the app never answered /health");
  ready({ proxies: PROXIES });
}

const terminal = (t: string): boolean => rowsOf(t).some((row) => TERMINAL.has(row.status));

/** Ordinary traffic: one claim per verdict category, a greeting, and one claim through the web chat. */
export async function claims(): Promise<void> {
  const scripts: Record<string, string | number>[] = [{ v: "likely-false", c: 12 }, { v: "likely-true", c: 92 }, { v: "partially-true", c: 70 }, { v: "unverified", c: 45 }, { cat: "greeting" }];
  for (const script of scripts) {
    const t = token();
    await whatsapp(`Is this true? ${directive(t, script)}`, "plain", t);
  }
  const t = token();
  await chat(`The council has voted to ban bicycles ${directive(t)}`, "plain", t);
}

/** The Judge's category and its confidence disagree, the way the real Judge's did (likely-false at 97). */
export async function judgeDisagrees(): Promise<void> {
  for (const script of [{ v: "likely-false", c: 97 }, { v: "likely-true", c: 8 }, { v: "partially-true", c: 45 }]) {
    const t = token();
    await whatsapp(`A forwarded claim ${directive(t, script)}`, "judge-disagrees", t);
  }
}

/** One, two and all three investigators fail. */
export async function partialFailure(): Promise<void> {
  for (const inv of ["88-x-85", "x-x-80", "x-x-x"]) {
    const t = token();
    await whatsapp(`A forwarded claim ${directive(t, { inv })}`, "partial-failure", t);
  }
}

/** Meta delivers a webhook again when the first delivery was slow: the same bytes, the same message id. */
export async function duplicateDelivery(): Promise<void> {
  const t = token();
  const phone = newPhone();
  const waId = `wamid.${token()}`;
  const text = `A forwarded claim ${directive(t, { lat: 500 })}`;
  await whatsapp(text, "duplicate-first", t, { phone, waId });
  await waitFor(() => rowsOf(t).length > 0, 5000);
  const firstRunning = rowsOf(t).some((row) => !TERMINAL.has(row.status));
  await whatsapp(text, "duplicate-second", t, { phone, waId, note: { firstRunning } });
}

/** A webhook with no signature, one signed with the wrong secret, and one signed correctly but spelled Meta's way. */
export async function webhookSignatures(): Promise<void> {
  for (const sign of ["none", "bad"] as const) {
    const t = token();
    await whatsapp(`A forged claim ${directive(t)}`, `unsigned-${sign}`, t, { sign });
  }
  const t = token();
  await whatsapp(`Is the café at 1/2 price? ${directive(t)}`, "meta-spelling", t, { meta: true });
}

/** The same claim asked again after its verdict: through the chat, and through WhatsApp by a second person. */
export async function repeatedClaim(): Promise<void> {
  const t = token();
  const text = `The mayor has resigned today ${directive(t)}`;
  const first = await chat(text, "repeat-first", t);
  await waitFor(() => rows().some((row) => row.id === first.id && TERMINAL.has(row.status)), 30_000);
  await chat(text, "repeat-second", t);

  const w = token();
  const forwarded = `The bridge will close on Monday ${directive(w)}`;
  const one = await whatsapp(forwarded, "repeat-first", w);
  await waitFor(() => finalAnswers(one.phone ?? "").length > 0, 30_000);
  await sleep(300);
  await whatsapp(forwarded, "repeat-second", w, { note: { modelCallsBefore: stubLog().filter((entry) => entry.svc === "model" && entry.t === w).length } });
}

/** A browser that opens the live page after the investigation has started. */
export async function lateJoiner(): Promise<void> {
  const t = token();
  const sent = await chat(`The river has been declared unsafe ${directive(t, { lat: 700 })}`, "late-joiner", t);
  if (sent.id === undefined) throw new Error(`the chat refused the claim: ${String(sent.status)}`);
  const started = await waitFor(() => rows().some((row) => row.id === sent.id && row.status === "investigating"), 15_000);
  const kinds = (await streamKinds(sent.id, 1500)).map((event) => event.kind);
  record({ t, channel: "chat", kind: "late-joiner-seen", status: 0, id: sent.id, note: { joinedAfterStart: started, first: kinds[0] ?? "", kinds } });
}

/** A message that carries markup, looked at on the live page while it runs. (The chat strips tags; WhatsApp does not.) */
export async function markup(): Promise<void> {
  const t = token();
  await whatsapp(`<script>fcxss_${t}()</script><img src=x onerror=fcxss_${t}()> is this true? ${directive(t, { lat: 700 })}`, "markup", t);
  await waitFor(() => rowsOf(t).length > 0, 5000);
  const id = rowsOf(t)[0]?.id;
  if (id === undefined) throw new Error("the markup message made no investigation");
  const live = await page(`/live/${id}`);
  record({ t, channel: "whatsapp", kind: "markup-live-page", status: live.status, id, note: { shown: live.body.includes(`fcxss_${t}`), raw: live.body.includes(`<script>fcxss_${t}`) || live.body.includes(`<img src=x onerror=fcxss_${t}`) } });
  await waitFor(() => terminal(t), 30_000);
}

/** A claim with a link to an article outside, and one whose link points back at the app's own loopback address. */
export async function urls(): Promise<void> {
  const t = token();
  await chat(`Is this report true? http://news.example:8002/a/${t} ${directive(t)}`, "url-outside", t);
  const l = token();
  await chat(`Is this report true? http://localhost:3000/ ${directive(l)}`, "url-loopback", l);
}

/** Thirteen claims at once from one address. Run from the `burst` container, so the other drivers keep their own budget. */
export async function rateLimit(): Promise<void> {
  await Promise.all(Array.from({ length: 13 }, async () => {
    const t = token();
    await chat(`Good morning to everyone ${directive(t, { cat: "greeting" })}`, "burst", t, { retry: false });
  }));
}
