// Everything outside ForwardCheck that the slice needs, in one process and with no internet:
//   :8001 http   the model (Anthropic Messages API), scripted: no model call, no token
//   :443  https  Brave Search, Google Fact Check and the WhatsApp Graph API, told apart by Host
//   :8002 http   a news site (the article a user's URL points at)
// Every request is appended to $STATE/stub.jsonl, which the driver reads directly: a fault must not blind the judge.
//
// The script for one claim is in the claim itself: `#fc{t=<token>,v=likely-false,c=12,inv=90-88-85}`.
//   t    the driver's token for this claim (the ledger's join key)
//   cat  the classifier's category (default factual_claim)
//   v,c  the Judge's category and confidence (default likely-false, 12)
//   inv  the three investigators' confidence scores, in the order source-domain-pattern; `x` = that one fails
//   lat  milliseconds every model call for this claim takes (default STUB_MODEL_LATENCY_MS)
import { appendFileSync, mkdirSync, readFileSync } from "node:fs";
import http from "node:http";
import https from "node:https";

const STATE = process.env["STATE"] ?? "/state";
const LATENCY = Number(process.env["STUB_MODEL_LATENCY_MS"] ?? "250");
mkdirSync(STATE, { recursive: true });

const record = (entry: Record<string, unknown>): void => {
  appendFileSync(`${STATE}/stub.jsonl`, `${JSON.stringify({ at: Date.now(), ...entry })}\n`);
};
const sleep = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

const readBody = async (req: http.IncomingMessage): Promise<string> => {
  const chunks: Buffer[] = [];
  for await (const chunk of req) chunks.push(chunk as Buffer);
  return Buffer.concat(chunks).toString("utf8");
};
const send = (res: http.ServerResponse, status: number, body: unknown, type = "application/json"): void => {
  res.writeHead(status, { "content-type": type });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
};

// ── the scripted model ───────────────────────────────────────────────────────────────────────────────────────────

type Directive = { raw: string; t: string; cat: string; v: string; c: number; inv: string[]; lat: number };
export function directiveOf(text: string): Directive {
  const raw = /#fc\{([^}]*)\}/.exec(text)?.[1] ?? "";
  const fields = Object.fromEntries(raw.split(",").filter(Boolean).map((pair) => pair.split("=") as [string, string]));
  return {
    raw: raw === "" ? "" : `#fc{${raw}}`,
    t: fields["t"] ?? "",
    cat: fields["cat"] ?? "factual_claim",
    v: fields["v"] ?? "likely-false",
    c: Number(fields["c"] ?? "12"),
    inv: (fields["inv"] ?? "90-88-85").split("-"),
    lat: Number(fields["lat"] ?? LATENCY),
  };
}

type Block = { type: string; text?: string; name?: string; content?: unknown };
type ModelRequest = {
  model: string;
  system?: string | Array<{ text: string }>;
  messages: Array<{ role: string; content: string | Block[] }>;
  tools?: Array<{ name: string }>;
};

const ROLES = [
  { role: "source_verification", mark: "Source Verification Investigator" },
  { role: "domain_expertise", mark: "Reporter 2 (Domain Expert)" },
  { role: "pattern_matching", mark: "Pattern Matching Investigator" },
] as const;

const toolUse = (name: string, input: unknown, n = 0): Record<string, unknown> => ({ type: "tool_use", id: `toolu_stub_${String(Date.now())}_${String(n)}`, name, input });
const SOURCE = { url: "https://news.example/fact", title: "Scripted source", credibility: "high", relevantSnippet: "Scripted snippet." };

/** What the scripted model answers: a Messages API response body, or an API error. */
export function answer(body: ModelRequest): { status: number; json: Record<string, unknown>; log: Record<string, unknown> } {
  const system = typeof body.system === "string" ? body.system : (body.system ?? []).map((part) => part.text).join("\n");
  const d = directiveOf(JSON.stringify(body.messages));
  // A tool reaches the Agent SDK's model as mcp__<server>__<name>: the script is the same on either path.
  const tools = (body.tools ?? []).map((tool) => tool.name.replace(/^mcp__[a-z]+__/, ""));
  const results = body.messages.flatMap((message) => (typeof message.content === "string" ? [] : message.content)).filter((block) => block.type === "tool_result").map((block) => JSON.stringify(block.content));
  const ok = (content: unknown[], log: Record<string, unknown>): ReturnType<typeof answer> => ({
    status: 200,
    json: { id: "msg_stub", type: "message", role: "assistant", model: body.model, content, stop_reason: content.some((block) => (block as Block).type === "tool_use") ? "tool_use" : "end_turn", stop_sequence: null, usage: { input_tokens: 100, output_tokens: 50 } },
    log: { svc: "model", t: d.t, ...log },
  });
  const done = (agent: string): ReturnType<typeof answer> => ok([{ type: "text", text: "Done." }], { agent, step: "end" });

  if (tools.includes("submit_strategy")) {
    const guidance = { targetQueries: [`fc ${d.t} one`, `fc ${d.t} two`], prioritySources: ["news.example"], lookFor: "Scripted." };
    return ok([toolUse("submit_strategy", {
      claimCharacteristics: { type: "factual_statistic", verifiabilityAssessment: "Scripted." },
      investigatorGuidance: { sourceVerification: guidance, domainExpertise: guidance, patternMatching: guidance },
      falsificationCriteria: { whatWouldProveTrue: ["An official confirmation"], whatWouldProveFalse: ["An official denial"] },
      thinkingExcerpt: "Scripted strategy.",
    })], { agent: "strategist" });
  }

  if (tools.includes("submit_challenge")) {
    return ok([toolUse("submit_challenge", {
      challenges: [{ targetAgent: "source_verification", claim: "Scripted", challenge: "Scripted challenge.", severity: "minor", evidence: "Scripted." }],
      overallAssessment: "The findings hold.", suggestedConfidenceAdjustment: 0, counterArgumentSucceeded: false,
      counterArgumentSummary: "The counter-argument failed.", thinkingExcerpt: "Scripted challenge.",
    })], { agent: "da", effort: (body as unknown as { output_config?: { effort?: string } }).output_config?.effort ?? "" });
  }

  if (tools.includes("submit_verdict")) {
    if (results.length === 0) return ok([toolUse("brave_web_search", { query: `fc ${d.t} judge`, count: 3 })], { agent: "judge", step: "search" });
    if (results.some((result) => result.includes("Verdict submitted"))) return done("judge");
    return ok([toolUse("submit_verdict", {
      category: d.v, confidence: d.c,
      confidenceDecomposition: { evidenceStrength: d.c, sourceReliability: d.c, claimComplexity: 50, counterArgumentResilience: d.c },
      summary: `Scripted verdict for ${d.raw}.`, reasoning: "Scripted reasoning.", manipulationTechniques: [],
      keyFindings: ["Scripted finding"], sources: [{ url: SOURCE.url, title: SOURCE.title, relevance: "Scripted" }],
      whatWouldChangeMyMind: "An official confirmation.", devilsAdvocateOutcome: "counter_argument_failed", thinkingSummary: "Scripted summary.",
    })], { agent: "judge", step: "submit", category: d.v, confidence: d.c });
  }

  if (tools.includes("submit_report")) {
    const at = Math.max(0, ROLES.findIndex((entry) => system.includes(entry.mark)));
    const role = ROLES[at]!.role;
    const score = d.inv[at] ?? "85";
    if (score === "x") {
      return { status: 400, json: { type: "error", error: { type: "invalid_request_error", message: "scripted investigator failure" } }, log: { svc: "model", t: d.t, agent: "investigator", role, step: "fail" } };
    }
    if (results.length === 0) {
      const searches = [toolUse("brave_web_search", { query: `fc ${d.t} ${role}`, count: 3 })];
      if (tools.includes("google_fact_check_search")) searches.push(toolUse("google_fact_check_search", { query: `fc ${d.t} ${role}` }, 1));
      return ok(searches, { agent: "investigator", role, step: "search" });
    }
    if (results.some((result) => result.includes("Report submitted"))) return done("investigator");
    // What the app's search tools gave this investigator: the driver judges a search outage from it.
    const found = results.filter((result) => result.includes("news.example")).length;
    return ok([toolUse("submit_report", {
      agentRole: role, summary: `Scripted report. Searches with results: ${String(found)} of ${String(results.length)}.`,
      findings: [{ claim: "Scripted", assessment: "contradicted", confidence: Number(score), sources: found > 0 ? [SOURCE] : [] }],
      manipulationIndicators: [], overallAssessment: "Scripted assessment.", confidenceScore: Number(score),
    })], { agent: "investigator", role, step: "submit", searches: results.length, searchesWithResults: found });
  }

  // No tools: the classifier. The claim it extracts carries the script on to every later agent.
  const message = body.messages.map((entry) => (typeof entry.content === "string" ? entry.content : "")).join("\n");
  return ok([{ type: "text", text: JSON.stringify({
    category: d.cat, extractedClaim: `${d.raw} ${message.slice(0, 300)}`, isCompound: false, domain: "general", language: "en", urgency: "low", reasoning: "Scripted.",
  }) }], { agent: "classifier", category: d.cat, article: /\[Article from ([^\]]+)\]/.exec(message)?.[1] ?? "" });
}

/** The same answer as server-sent events, for a caller that asked to stream (the Agent SDK's CLI does). */
function stream(res: http.ServerResponse, json: Record<string, unknown>): void {
  res.writeHead(200, { "content-type": "text/event-stream" });
  const event = (name: string, data: unknown): void => { res.write(`event: ${name}\ndata: ${JSON.stringify({ type: name, ...(data as object) })}\n\n`); };
  const content = json["content"] as Array<Record<string, unknown>>;
  event("message_start", { message: { ...json, content: [], stop_reason: null } });
  content.forEach((block, index) => {
    const isTool = block["type"] === "tool_use";
    event("content_block_start", { index, content_block: isTool ? { ...block, input: {} } : { type: "text", text: "" } });
    event("content_block_delta", { index, delta: isTool ? { type: "input_json_delta", partial_json: JSON.stringify(block["input"]) } : { type: "text_delta", text: block["text"] } });
    event("content_block_stop", { index });
  });
  event("message_delta", { delta: { stop_reason: json["stop_reason"], stop_sequence: null }, usage: { output_tokens: 50 } });
  event("message_stop", {});
  res.end();
}

const model = http.createServer((req, res) => {
  void (async () => {
    const text = await readBody(req);
    if (req.method !== "POST" || !(req.url ?? "").startsWith("/v1/messages") || (req.url ?? "").includes("count_tokens")) {
      send(res, 404, { type: "error", error: { type: "not_found_error", message: "the scripted model only answers POST /v1/messages" } });
      return;
    }
    const body = JSON.parse(text) as ModelRequest & { stream?: boolean };
    const { status, json, log } = answer(body);
    await sleep(directiveOf(JSON.stringify(body.messages)).lat);
    record(log);
    if (status === 200 && body.stream === true) stream(res, json);
    else send(res, status, json);
  })().catch((err: unknown) => { send(res, 500, { type: "error", error: { type: "api_error", message: String(err) } }); });
});

// ── Brave, Google Fact Check, WhatsApp Graph (https, by Host) ────────────────────────────────────────────────────

let sent = 0;
const thirdParty = (req: http.IncomingMessage, res: http.ServerResponse): void => {
  void (async () => {
    const host = (req.headers.host ?? "").split(":")[0];
    const url = new URL(req.url ?? "/", `https://${host ?? "unknown"}`);
    const text = await readBody(req);
    if (host === "api.search.brave.com") {
      const q = url.searchParams.get("q") ?? "";
      record({ svc: "brave", q });
      send(res, 200, { web: { results: [1, 2, 3].map((n) => ({ title: `Scripted result ${String(n)}`, url: `https://news.example/${String(n)}`, description: `Scripted snippet for ${q}.`, age: "1 day ago" })) } });
    } else if (host === "factchecktools.googleapis.com") {
      const q = url.searchParams.get("query") ?? "";
      record({ svc: "factcheck", q });
      send(res, 200, { claims: [{ text: `Scripted claim for ${q}`, claimant: "Scripted", claimReview: [{ url: "https://news.example/review", title: "Scripted review", publisher: { name: "news.example" }, textualRating: "False" }] }] });
    } else if (host === "graph.facebook.com") {
      const body = JSON.parse(text === "" ? "{}" : text) as { to?: string; type?: string; text?: { body?: string }; interactive?: { body?: { text?: string } } };
      sent += 1;
      record({ svc: "graph", to: body.to ?? "", kind: body.type ?? "", text: body.text?.body ?? body.interactive?.body?.text ?? "" });
      send(res, 200, { messaging_product: "whatsapp", messages: [{ id: `wamid.stub.${String(sent)}` }] });
    } else {
      send(res, 404, { error: `no such host in the slice: ${host ?? ""}` });
    }
  })().catch((err: unknown) => { send(res, 500, { error: String(err) }); });
};

// ── the news site ────────────────────────────────────────────────────────────────────────────────────────────────

const news = http.createServer((req, res) => {
  const token = (req.url ?? "/").split("/").pop() ?? "";
  record({ svc: "news", path: req.url ?? "" });
  const paragraph = `Officials said on Tuesday that the measure marked ${token} had been reviewed by the committee, and that its findings would be published in full once the review was complete. `;
  send(res, 200, `<!doctype html><html><head><title>Report ${token}</title></head><body><article><h1>Report ${token}</h1>${`<p>${paragraph.repeat(4)}</p>`.repeat(5)}</article></body></html>`, "text/html; charset=utf-8");
});

if (process.argv[1]?.endsWith("server.ts") === true) {
  const certs = process.env["CERTS"] ?? "/certs";
  model.listen(8001);
  news.listen(8002);
  https.createServer({ key: readFileSync(`${certs}/key.pem`), cert: readFileSync(`${certs}/cert.pem`) }, thirdParty).listen(443);
  record({ svc: "stub", event: "started" });
  process.stdout.write("stub: model :8001, news :8002, brave/factcheck/graph :443\n");
}
