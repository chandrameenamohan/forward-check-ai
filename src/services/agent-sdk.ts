import { query, tool, createSdkMcpServer } from "@anthropic-ai/claude-agent-sdk";
import type {
  ContentBlock,
  Message,
  MessageCreateParamsNonStreaming,
  MessageParam,
  Tool,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import { z } from "zod";
import type { BraveSearchResult } from "../tools/brave-search.js";

/**
 * Claude Agent SDK backend: runs on the local Claude Code login
 * (`claude login` or CLAUDE_CODE_OAUTH_TOKEN) instead of an ANTHROPIC_API_KEY.
 */

const SERVER = "fc";
const TOOL_PREFIX = `mcp__${SERVER}__`;

/** Pinned API model IDs → Claude Code family aliases, so the login's current models are used. */
function sdkModel(model: string): string {
  return ["haiku", "sonnet", "opus"].find((f) => model.includes(f)) ?? model;
}

/** An empty ANTHROPIC_API_KEY (e.g. from .env) must not shadow the Claude Code login. */
function useClaudeCodeLogin(): void {
  if (!process.env["ANTHROPIC_API_KEY"]) delete process.env["ANTHROPIC_API_KEY"];
}

// ponytail: each call is a fresh one-turn session, so multi-turn history is
// flattened to text (thinking blocks dropped). Use SDK session resume if
// cross-turn reasoning quality or per-turn startup time starts to matter.
function renderPrompt(messages: MessageParam[]): string {
  const first = messages[0];
  if (messages.length === 1 && first && typeof first.content === "string") {
    return first.content;
  }
  const lines = messages.flatMap((m) => {
    if (typeof m.content === "string") return [`[${m.role}]: ${m.content}`];
    return m.content.flatMap((b) => {
      if (b.type === "text") return [`[${m.role}]: ${b.text}`];
      if (b.type === "tool_use") {
        return [`[assistant called tool ${b.name}]: ${JSON.stringify(b.input)}`];
      }
      if (b.type === "tool_result") {
        const result = typeof b.content === "string" ? b.content : JSON.stringify(b.content);
        return [`[tool result]: ${result}`];
      }
      return [];
    });
  });
  return `Conversation so far:\n\n${lines.join("\n\n")}\n\nContinue with your next step.`;
}

/**
 * Emulates one Messages API turn via the Agent SDK. Tools are exposed as
 * no-op MCP tools: the tool_use blocks are returned to the caller, which
 * executes them itself (same contract as the Messages API).
 */
export async function sdkCreateMessage(
  params: MessageCreateParamsNonStreaming,
): Promise<{ response: Message; costUsd: number }> {
  useClaudeCodeLogin();

  const sdkTools = ((params.tools ?? []) as Tool[]).map((t) =>
    tool(
      t.name,
      t.description ?? "",
      (z.fromJSONSchema(t.input_schema as Parameters<typeof z.fromJSONSchema>[0]) as z.ZodObject).shape,
      async () => ({ content: [{ type: "text" as const, text: "ok" }] }),
      { alwaysLoad: true },
    ),
  );

  let system =
    typeof params.system === "string"
      ? params.system
      : (params.system ?? []).map((b) => b.text).join("\n");
  // The SDK cannot force tool_choice; instruct instead.
  if (params.tool_choice?.type === "tool") {
    system += `\n\nYou MUST respond by calling the ${params.tool_choice.name} tool.`;
  }

  const content: ContentBlock[] = [];
  let costUsd = 0;
  let usage = { input_tokens: 0, output_tokens: 0 };

  const stream = query({
    prompt: renderPrompt(params.messages),
    options: {
      model: sdkModel(params.model),
      systemPrompt: system,
      tools: [], // no built-in Claude Code tools
      ...(sdkTools.length > 0
        ? {
            mcpServers: { [SERVER]: createSdkMcpServer({ name: SERVER, tools: sdkTools }) },
            allowedTools: sdkTools.map((t) => TOOL_PREFIX + t.name),
          }
        : {}),
      maxTurns: 1,
      settingSources: [],
      strictMcpConfig: true, // keep the user's own MCP connectors out
      persistSession: false,
      thinking:
        params.thinking?.type === "adaptive"
          ? { type: "adaptive", display: "summarized" }
          : { type: "disabled" },
      ...(params.output_config?.effort ? { effort: params.output_config.effort } : {}),
    },
  });

  try {
   for await (const msg of stream) {
    if (msg.type === "assistant") {
      for (const block of msg.message.content as ContentBlock[]) {
        content.push(
          block.type === "tool_use"
            ? { ...block, name: block.name.replace(TOOL_PREFIX, "") }
            : block,
        );
      }
    } else if (msg.type === "result") {
      costUsd = msg.total_cost_usd;
      usage = msg.usage;
      // error_max_turns is expected: we stop after the turn that calls a tool.
      if (msg.subtype !== "success" && msg.subtype !== "error_max_turns") {
        throw new Error(`Claude Agent SDK call failed: ${msg.subtype}`);
      }
      if (msg.subtype === "success" && msg.is_error) {
        throw new Error(`Claude Agent SDK call failed: ${msg.result}`);
      }
    }
   }
  } catch (err) {
    // The SDK throws on max-turns after yielding the result; that is our normal stop.
    if (!(err instanceof Error && err.message.includes("maximum number of turns"))) throw err;
  }

  if (content.length === 0) {
    throw new Error("Claude Agent SDK returned no content (is Claude Code logged in?)");
  }

  const response = {
    id: "sdk",
    type: "message",
    role: "assistant",
    model: params.model,
    content,
    stop_reason: content.some((b) => b.type === "tool_use") ? "tool_use" : "end_turn",
    stop_sequence: null,
    usage,
  } as unknown as Message;

  return { response, costUsd };
}

// ponytail: one Haiku session per search (~10s+). Set BRAVE_SEARCH_API_KEY for fast, direct search.
/** Web search through Claude Code's built-in WebSearch tool, for when no Brave key is configured. */
export async function claudeWebSearch(
  searchQuery: string,
  count: number,
): Promise<BraveSearchResult[]> {
  useClaudeCodeLogin();

  let text = "";
  const stream = query({
    prompt: `Search the web for: ${searchQuery}`,
    options: {
      model: "haiku",
      systemPrompt:
        `You are a search API. Run exactly one WebSearch for the user's query, then reply with ONLY a JSON array (no prose, no code fence) of up to ${count} results: ` +
        `[{"title": string, "url": string, "description": string (1-2 sentence factual snippet of what the page says), "age": string (publication date if known, else "")}].`,
      tools: ["WebSearch"],
      allowedTools: ["WebSearch"],
      maxTurns: 3,
      settingSources: [],
      strictMcpConfig: true, // keep the user's own MCP connectors out
      persistSession: false,
    },
  });
  for await (const msg of stream) {
    if (msg.type === "result" && msg.subtype === "success") text = msg.result;
  }

  const parsed = z
    .array(
      z.object({
        title: z.string().default(""),
        url: z.string(),
        description: z.string().default(""),
        age: z.string().default(""),
      }),
    )
    .safeParse(firstJsonArray(text));
  return parsed.success ? parsed.data.slice(0, count) : [];
}

/** Parses the first JSON array in text, tolerating prose (e.g. a "Sources:" list) before or after it. */
function firstJsonArray(text: string): unknown {
  const start = text.indexOf("[");
  if (start < 0) return [];
  for (let end = text.indexOf("]", start); end >= 0; end = text.indexOf("]", end + 1)) {
    try {
      return JSON.parse(text.slice(start, end + 1));
    } catch {
      // not the closing bracket of the array yet — keep extending
    }
  }
  return [];
}
