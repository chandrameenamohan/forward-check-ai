import type { Tool, MessageParam } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { ClaudeClient } from "../../services/claude-client.js";
import { AgentReportSchema, type AgentReport } from "../../schemas/agent-report.js";
import type { ToolCallRecord } from "../../orchestrator/agent-runner.js";
import { createLogger } from "../../config/logger.js";

const logger = createLogger({ level: "info" });

/** Parameters for extractReport */
export interface ExtractReportParams {
  /** Tool calls from the agent run */
  toolCalls: ToolCallRecord[];
  /** Final text content from the agent run */
  text: string;
  /** Role name for logging (e.g. "source_verification") */
  agentRole: string;
  /** Claude client for retry follow-up */
  client: ClaudeClient;
  /** Model to use for retry */
  model: string;
  /** System prompt from the original agent run */
  systemPrompt: string;
  /** Messages from the original agent run */
  messages: MessageParam[];
  /** Tools including submit_report */
  tools: Tool[];
}

/**
 * Extract an AgentReport from an investigator agent's output.
 *
 * Strategy (in order):
 *   1. Check if submit_report was called → validate and return
 *   2. Send a 1-turn follow-up asking the model to call submit_report
 *   3. Try JSON.parse fallback on the combined text output
 *   4. Throw with descriptive error
 */
export async function extractReport(params: ExtractReportParams): Promise<AgentReport> {
  const { toolCalls, text, agentRole, client, model, systemPrompt, messages, tools } = params;

  // 1. Check if submit_report was called
  const submitCall = toolCalls.find((tc) => tc.name === "submit_report");
  if (submitCall) {
    return validateReport(submitCall.input, agentRole);
  }

  // 2. Retry: send a follow-up message asking for submit_report
  logger.warn(
    { agentRole },
    `${agentRole} agent did not call submit_report, sending retry follow-up`,
  );

  const retryReport = await retrySubmitReport(client, model, systemPrompt, messages, tools);
  if (retryReport) {
    return validateReport(retryReport, agentRole);
  }

  // 3. Fall back to JSON.parse on text output
  logger.warn(
    { agentRole },
    `${agentRole} retry did not call submit_report, attempting text parse fallback`,
  );
  const jsonReport = tryParseJson(text);
  if (jsonReport) {
    return validateReport(jsonReport, agentRole);
  }

  // 4. All methods failed
  throw new Error(
    `${agentRole} agent failed to produce a valid report: submit_report not called, retry failed, text parse failed`,
  );
}

/** Validate unknown data against AgentReportSchema, throwing on failure */
function validateReport(data: unknown, agentRole: string): AgentReport {
  // Truncate summary if it exceeds 800 chars to prevent Zod rejection
  if (data && typeof data === "object" && "summary" in data) {
    const record = data as Record<string, unknown>;
    if (typeof record["summary"] === "string" && record["summary"].length > 800) {
      record["summary"] = record["summary"].substring(0, 797) + "...";
    }
  }

  const validation = AgentReportSchema.safeParse(data);
  if (!validation.success) {
    logger.error(
      { errors: validation.error.issues, input: data, agentRole },
      `${agentRole} report failed Zod validation`,
    );
    throw new Error(
      `${agentRole} report failed schema validation: ${validation.error.message}`,
    );
  }
  return validation.data;
}

/** Send a 1-turn follow-up asking the model to call submit_report, forcing the tool call */
async function retrySubmitReport(
  client: ClaudeClient,
  model: string,
  systemPrompt: string,
  originalMessages: MessageParam[],
  tools: Tool[],
): Promise<unknown | null> {
  const retryMessages: MessageParam[] = [
    ...originalMessages,
    {
      role: "user",
      content:
        "You must call the submit_report tool now with your investigation findings. Do not respond with text — call the submit_report tool immediately.",
    },
  ];

  const { response } = await client.createMessage({
    model,
    system: systemPrompt,
    max_tokens: 4096,
    messages: retryMessages,
    tools,
    tool_choice: { type: "tool" as const, name: "submit_report" },
  });

  // Check if the retry response contains a submit_report tool call
  for (const block of response.content) {
    if (block.type === "tool_use" && block.name === "submit_report") {
      return block.input;
    }
  }

  return null;
}

/** Try to parse text as JSON, stripping markdown code fences if present */
function tryParseJson(text: string): unknown | null {
  const trimmed = text.trim();
  if (!trimmed) return null;

  // Strip markdown code fences if present
  const jsonText = trimmed.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");

  try {
    return JSON.parse(jsonText);
  } catch {
    return null;
  }
}
