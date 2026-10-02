// The scenes: one fault each, opened at a trust boundary while claims are running. Only a local run has these;
// inside Antithesis the platform chooses the faults. A scene makes its own traffic, opens the fault through
// toxiproxy, and leaves a cue (when, and which investigations were in flight) for the checks.
// Killing the app is run.sh's (the driver has no Docker): `app-kill-open` and `app-kill-close` are its two halves.
import { readFileSync, writeFileSync } from "node:fs";
import { cut, directive, flag, rows, rowsOf, sleep, STATE, TERMINAL, token, toxi, waitFor, whatsapp, writeCue } from "./world.js";

const HOLD_MS = Number(process.env["FAULT_HOLD_MS"] ?? "6000");

/** `n` WhatsApp claims whose every model call takes `lat` ms, so a fault has something running to land on. */
async function batch(n: number, lat: number, kind: string): Promise<string[]> {
  const tokens = Array.from({ length: n }, () => token());
  await Promise.all(tokens.map((t) => whatsapp(`A forwarded claim ${directive(t, { lat })}`, kind, t)));
  await waitFor(() => tokens.every((t) => rowsOf(t).length > 0), 5000, 100);
  return tokens;
}
const running = (tokens: string[]): string[] => { const all = rows(); return tokens.flatMap((t) => rowsOf(t, all)).filter((row) => !TERMINAL.has(row.status)).map((row) => row.id); };

/** Cut `proxies` for HOLD_MS, `lead` ms after the batch started (or before it, when `before`). */
async function outage(fault: string, proxies: string[], options: { lead?: number; before?: boolean } = {}): Promise<void> {
  const set = async (open: boolean): Promise<void> => { for (const proxy of proxies) await cut(proxy, open); };
  let tokens: string[] = [];
  if (options.before !== true) {
    tokens = await batch(3, 400, fault);
    await sleep(options.lead ?? 1200);
  }
  const openedAt = Date.now();
  flag("fault-open", true);
  await set(false);
  try {
    if (options.before === true) tokens = await batch(3, 300, fault);
    const inFlight = running(tokens);
    await sleep(HOLD_MS);
    writeCue({ fault, openedAt, closedAt: Date.now(), inFlight });
  } finally {
    await set(true);
    flag("fault-open", false);
  }
}

export const modelUnavailable = (): Promise<void> => outage("model-unavailable", ["model"]);
export const graphUnavailable = (): Promise<void> => outage("graph-unavailable", ["graph"], { lead: 1500 });
export const searchUnavailable = (): Promise<void> => outage("search-unavailable", ["brave", "factcheck"], { before: true });

/** A toxic on the model's answers for HOLD_MS: `latency` (slow) or `timeout` 0 (data dropped, connection kept: frozen). */
async function toxic(fault: string, type: string, attributes: Record<string, number>): Promise<void> {
  const tokens = await batch(3, 300, fault);
  await sleep(800);
  const openedAt = Date.now();
  flag("fault-open", true);
  await toxi("POST", "/proxies/model/toxics", { name: fault, type, stream: "downstream", attributes });
  try {
    const inFlight = running(tokens);
    await sleep(HOLD_MS);
    writeCue({ fault, openedAt, closedAt: Date.now(), inFlight });
  } finally {
    await toxi("DELETE", `/proxies/model/toxics/${fault}`);
    flag("fault-open", false);
  }
}
export const modelSlow = (): Promise<void> => toxic("model-slow", "latency", { latency: 1200 });
export const modelFrozen = (): Promise<void> => toxic("model-frozen", "timeout", { timeout: 0 });

/** Before the kill: one verdict completed, three investigations running, and a note of both. */
export async function appKillOpen(): Promise<void> {
  const [done] = await batch(1, 50, "app-killed-finished");
  await waitFor(() => rowsOf(done ?? "").every((row) => TERMINAL.has(row.status)), 20_000);
  const tokens = await batch(3, 500, "app-killed");
  await sleep(1200);
  const snapshot = Object.fromEntries(rows().filter((row) => row.status === "completed" && row.final_verdict !== null).map((row) => [row.id, row.final_verdict ?? ""]));
  writeFileSync(`${STATE}/app-kill.json`, JSON.stringify({ openedAt: Date.now(), inFlight: running(tokens), snapshot }));
  flag("app-down", true);
}

/** After the restart. */
export function appKillClose(): void {
  const open = JSON.parse(readFileSync(`${STATE}/app-kill.json`, "utf8")) as { openedAt: number; inFlight: string[]; snapshot: Record<string, string> };
  writeCue({ fault: "app-killed", closedAt: Date.now(), ...open });
  flag("app-down", false);
}
