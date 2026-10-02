// What every command shares: where the app is, how a claim is sent, and how the judge reads what happened.
// The judge reads the stores DIRECTLY (the app's SQLite file, the stub's log, the ledger): never through toxiproxy.
import Database from "better-sqlite3";
import { createHmac, randomBytes } from "node:crypto";
import { appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { hostname } from "node:os";

export const STATE = process.env["STATE"] ?? "/state";
export const APP = process.env["APP_URL"] ?? "http://app:3000";
const TOXI = process.env["TOXIPROXY_URL"] ?? "http://toxiproxy:8474";
const DB_PATH = process.env["DATABASE_PATH"] ?? "/data/forwardcheck.db";
const APP_SECRET = process.env["WHATSAPP_APP_SECRET"] ?? "harness-app-secret";
/** How long after the faults stop a claim may take to reach a terminal status. */
export const SETTLE_MS = Number(process.env["SETTLE_MS"] ?? "45000");
const COMMAND = (process.argv[2] ?? "command").replace(/[^a-z_-]/gi, "_");

export const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
export const token = (): string => randomBytes(5).toString("hex");
/** The script for one claim, read by the scripted model (stub/server.ts). */
export const directive = (t: string, fields: Record<string, string | number> = {}): string => `#fc{${[`t=${t}`, ...Object.entries(fields).map(([key, value]) => `${key}=${String(value)}`)].join(",")}}`;

export async function waitFor(done: () => boolean | Promise<boolean>, ms: number, step = 200): Promise<boolean> {
  const until = Date.now() + ms;
  while (Date.now() < until) {
    if (await done()) return true;
    await sleep(step);
  }
  return await done();
}

// ── files: the ledger, the cues, the flags, the stub's log ───────────────────────────────────────────────────────

const readJsonl = <T>(path: string): T[] => {
  if (!existsSync(path)) return [];
  return readFileSync(path, "utf8").split("\n").flatMap((line) => {
    try {
      return line.trim() === "" ? [] : [JSON.parse(line) as T];
    } catch {
      return []; // a process killed mid-write leaves half a line
    }
  });
};

/** Everything a driver sent: the join key between what was asked and what the app did. */
export type Entry = { t: string; channel: "chat" | "whatsapp"; kind: string; at: number; status: number; src: string; id?: string; phone?: string; waId?: string; signed?: boolean; note?: Record<string, unknown> };
export function record(entry: Omit<Entry, "at" | "src"> & { at?: number }): Entry {
  const full: Entry = { at: Date.now(), src: hostname(), ...entry };
  mkdirSync(`${STATE}/ledger`, { recursive: true });
  appendFileSync(`${STATE}/ledger/${COMMAND}-${String(process.pid)}.jsonl`, `${JSON.stringify(full)}\n`);
  return full;
}
export const ledger = (): Entry[] => (existsSync(`${STATE}/ledger`) ? readdirSync(`${STATE}/ledger`).flatMap((name) => readJsonl<Entry>(`${STATE}/ledger/${name}`)) : []);

/** One fault a scene opened: when, and which investigations were running at that moment. */
export type Cue = { fault: string; openedAt: number; closedAt: number; inFlight: string[]; snapshot?: Record<string, string> };
export const cues = (): Cue[] => readJsonl<Cue>(`${STATE}/cues.jsonl`);
export const writeCue = (cue: Cue): void => { appendFileSync(`${STATE}/cues.jsonl`, `${JSON.stringify(cue)}\n`); };

export const flag = (name: string, on: boolean): void => {
  if (on) writeFileSync(`${STATE}/${name}`, String(Date.now()));
  else rmSync(`${STATE}/${name}`, { force: true });
};
export const flagged = (name: string): boolean => existsSync(`${STATE}/${name}`);

export type StubEntry = { at: number; svc: string; t?: string; agent?: string; role?: string; step?: string; category?: string; confidence?: number; searches?: number; searchesWithResults?: number; article?: string; to?: string; kind?: string; text?: string };
export const stubLog = (): StubEntry[] => readJsonl<StubEntry>(`${STATE}/stub.jsonl`);

// ── the app's database, read only ────────────────────────────────────────────────────────────────────────────────

export type Row = { id: string; original_message: string; status: string; final_verdict: string | null; agent_reports: string | null; completed_at: string | null; created_at: string; platform_message_id: string | null };
export const TERMINAL = new Set(["completed", "completed_non_factual", "failed"]);
export function rows(): Row[] {
  const db = new Database(DB_PATH, { readonly: true, fileMustExist: true });
  try {
    db.pragma("busy_timeout = 3000");
    return db.prepare("SELECT id, original_message, status, final_verdict, agent_reports, completed_at, created_at, platform_message_id FROM investigations").all() as Row[];
  } finally {
    db.close();
  }
}
export const rowsOf = (t: string, all: Row[] = rows()): Row[] => all.filter((row) => row.original_message.includes(`t=${t}`));
/** The rows a ledger entry is answerable for: its own id on chat, every row carrying its token on WhatsApp. */
export const rowsFor = (entry: Entry, all: Row[] = rows()): Row[] => (entry.id !== undefined ? all.filter((row) => row.id === entry.id) : rowsOf(entry.t, all));

// ── sending a claim ──────────────────────────────────────────────────────────────────────────────────────────────

/** A claim through the web chat. A 429 is waited out as a browser's user would, unless `retry` is false. */
export async function chat(text: string, kind: string, t: string, options: { retry?: boolean; note?: Record<string, unknown> } = {}): Promise<Entry> {
  for (;;) {
    const res = await fetch(`${APP}/api/chat/message`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ message: text }) });
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    if (res.status === 429 && options.retry !== false) {
      await sleep((Number(res.headers.get("retry-after") ?? "5") + 1) * 1000);
      continue;
    }
    return record({ t, channel: "chat", kind, status: res.status, ...(body.id === undefined ? {} : { id: body.id }), ...(options.note === undefined ? {} : { note: options.note }) });
  }
}

export const newPhone = (): string => `1555${String(Math.floor(1_000_000 + Math.random() * 8_999_999))}`;
type Sign = "ok" | "none" | "bad";
/** A WhatsApp text message as Meta delivers it. `meta` spells the JSON Meta's way (escaped slashes and non-ASCII). */
export async function whatsapp(text: string, kind: string, t: string, options: { phone?: string; waId?: string; sign?: Sign; meta?: boolean; note?: Record<string, unknown> } = {}): Promise<Entry> {
  const phone = options.phone ?? newPhone();
  const waId = options.waId ?? `wamid.${token()}`;
  const sign = options.sign ?? "ok";
  const payload = {
    object: "whatsapp_business_account",
    entry: [{ id: "harness", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp", metadata: { display_phone_number: "15550000000", phone_number_id: "harness-phone" },
      contacts: [{ profile: { name: "Harness" }, wa_id: phone }],
      messages: [{ from: phone, id: waId, timestamp: String(Math.floor(Date.now() / 1000)), type: "text", text: { body: text } }],
    } }] }],
  };
  const canonical = JSON.stringify(payload);
  const raw = options.meta === true ? canonical.replace(/\//g, "\\/").replace(/[\u0080-￿]/g, (char) => `\\u${char.charCodeAt(0).toString(16).padStart(4, "0")}`) : canonical;
  const signature = `sha256=${createHmac("sha256", sign === "bad" ? "not-the-secret" : APP_SECRET).update(raw).digest("hex")}`;
  const res = await fetch(`${APP}/webhook/whatsapp`, { method: "POST", headers: { "content-type": "application/json", ...(sign === "none" ? {} : { "x-hub-signature-256": signature }) }, body: raw });
  return record({ t, channel: "whatsapp", kind, status: res.status, phone, waId, signed: sign === "ok", note: { ...options.note, spelledAsStringify: raw === canonical } });
}

// ── looking at the app from outside ──────────────────────────────────────────────────────────────────────────────

export async function page(path: string): Promise<{ status: number; body: string }> {
  const res = await fetch(`${APP}${path}`, { signal: AbortSignal.timeout(5000) });
  return { status: res.status, body: await res.text() };
}

/** The kinds of the events an investigation's stream sends in `ms`: its history, then whatever is live. */
export async function streamKinds(id: string, ms: number): Promise<{ kind: string; data: Record<string, unknown> }[]> {
  const controller = new AbortController();
  const timer = setTimeout(() => { controller.abort(); }, ms);
  let text = "";
  try {
    const res = await fetch(`${APP}/api/live/${id}/stream`, { signal: controller.signal });
    const decoder = new TextDecoder();
    for await (const chunk of res.body as unknown as AsyncIterable<Uint8Array>) text += decoder.decode(chunk, { stream: true });
  } catch {
    // the abort is how a stream that never ends is left
  } finally {
    clearTimeout(timer);
  }
  return text.split("\n\n").flatMap((block) => {
    const kind = /^event: (.+)$/m.exec(block)?.[1];
    const data = /^data: (.+)$/m.exec(block)?.[1];
    if (kind === undefined) return [];
    try {
      return [{ kind, data: data === undefined ? {} : (JSON.parse(data) as Record<string, unknown>) }];
    } catch {
      return [{ kind, data: {} }];
    }
  });
}

/** A WhatsApp user's final answer, as opposed to the welcome, the progress lines and the link buttons. */
const PROGRESS = ["Welcome to ForwardCheck", "🔗 Reading article", "🔍 Investigating your claim", "📄 Reading article", "🔍 Planning", "🌐 Searching", "🧠 Analyzing", "⚔️ Challenging", "⚖️ Rendering"];
export const finalAnswers = (phone: string, log: StubEntry[] = stubLog()): StubEntry[] => log.filter((entry) => entry.svc === "graph" && entry.to === phone && entry.kind === "text" && !PROGRESS.some((line) => (entry.text ?? "").startsWith(line)));

// ── toxiproxy ────────────────────────────────────────────────────────────────────────────────────────────────────

export async function toxi(method: string, path: string, body?: unknown): Promise<unknown> {
  const res = await fetch(`${TOXI}${path}`, { method, ...(body === undefined ? {} : { headers: { "content-type": "application/json" }, body: JSON.stringify(body) }) });
  if (!res.ok) throw new Error(`toxiproxy ${method} ${path}: ${String(res.status)} ${await res.text()}`);
  return res.status === 204 ? undefined : await res.json();
}
export const cut = (proxy: string, open: boolean): Promise<unknown> => toxi("POST", `/proxies/${proxy}`, { enabled: open });
