import type {
  MessageParam,
  ContentBlockParam,
  ThinkingConfigParam,
  ToolChoice,
} from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import type { ClaudeClient } from "../services/claude-client.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** Record of a single tool call made during the agent loop */
export interface ToolCallRecord {
  name: string;
  input: unknown;
  result: string;
}

/** Configuration for a single agent run */
export interface AgentConfig {
  client: ClaudeClient;
  model: string;
  systemPrompt: string;
  messages: MessageParam[];
  maxTurns: number;
  tools?: Tool[];
  thinkingConfig?: ThinkingConfigParam;
  /** Called for each tool_use block. Must return a string result or throw. */
  onToolCall?: (name: string, input: unknown) => Promise<string> | string;
  /** Timeout in milliseconds (default 120_000) */
  timeoutMs?: number;
  /** Optional output_config for effort levels (e.g., { effort: "max" }) */
  outputConfig?: { effort: "low" | "medium" | "high" | "max" };
  /** Optional tool_choice to force a specific tool call (e.g., { type: "tool", name: "submit_verdict" }) */
  toolChoice?: ToolChoice;
}

/** Result of a completed agent run */
export interface AgentResult {
  /** Final text content from the last response */
  text: string;
  /** All thinking block texts across all turns */
  thinkingBlocks: string[];
  /** All tool calls made during the run */
  toolCalls: ToolCallRecord[];
  /** Total input tokens across all turns */
  totalInputTokens: number;
  /** Total output tokens across all turns */
  totalOutputTokens: number;
  /** Total estimated cost in USD */
  totalCostUsd: number;
  /** Internal conversation messages (for retry/follow-up use) */
  _messages: MessageParam[];
}

/**
 * Core agentic loop that handles multi-turn tool-use conversations with Claude.
 *
 * Loop logic:
 *   1. Call client.messages.create() with model, system, tools, messages, thinking
 *   2. Check response for tool_use blocks
 *   3. For each tool_use: call onToolCall, push assistant message + tool result to messages
 *   4. Loop until: stop_reason === "end_turn" OR maxTurns reached OR no tool_use blocks
 *   5. Extract and return: final text content, thinking blocks, all tool calls made, token usage
 */
export async function runAgent(config: AgentConfig): Promise<AgentResult> {
  const { timeoutMs = 120_000 } = config;

  const agentPromise = runAgentLoop(config);

  // Race the agent loop against a timeout
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    setTimeout(
      () => reject(new Error(`Agent timeout after ${timeoutMs}ms`)),
      timeoutMs,
    );
  });

  return Promise.race([agentPromise, timeoutPromise]);
}

async function runAgentLoop(config: AgentConfig): Promise<AgentResult> {
  const {
    client,
    model,
    systemPrompt,
    maxTurns,
    tools,
    thinkingConfig,
    onToolCall,
    outputConfig,
    toolChoice,
  } = config;

  // Clone messages to avoid mutating the caller's array
  const messages: MessageParam[] = [...config.messages];

  const allThinkingBlocks: string[] = [];
  const allToolCalls: ToolCallRecord[] = [];
  let totalInputTokens = 0;
  let totalOutputTokens = 0;
  let totalCostUsd = 0;
  let lastTextContent = "";

  for (let turn = 0; turn < maxTurns; turn++) {
    const { response, costUsd } = await client.createMessage({
      model,
      system: systemPrompt,
      max_tokens: thinkingConfig ? 16000 : 4096,
      messages,
      ...(tools && tools.length > 0 ? { tools } : {}),
      ...(thinkingConfig ? { thinking: thinkingConfig } : {}),
      ...(outputConfig ? { output_config: outputConfig } : {}),
      ...(toolChoice ? { tool_choice: toolChoice } : {}),
    });

    totalInputTokens += response.usage.input_tokens;
    totalOutputTokens += response.usage.output_tokens;
    totalCostUsd += costUsd;

    // Extract thinking blocks and text from this turn
    for (const block of response.content) {
      if (block.type === "thinking") {
        allThinkingBlocks.push(block.thinking);
      }
      if (block.type === "text") {
        lastTextContent = block.text;
      }
    }

    // Check for tool_use blocks
    const toolUseBlocks = response.content.filter(
      (block) => block.type === "tool_use",
    );

    // If no tool_use blocks or stop_reason is end_turn, we're done
    if (toolUseBlocks.length === 0 || response.stop_reason !== "tool_use") {
      break;
    }

    // Push the full assistant response (including thinking blocks) to messages
    messages.push({
      role: "assistant",
      content: response.content as unknown as ContentBlockParam[],
    });

    // Execute each tool call and collect results
    const toolResults: ContentBlockParam[] = [];

    for (const block of toolUseBlocks) {
      if (block.type !== "tool_use") continue;

      let resultContent: string;
      let isError = false;

      try {
        if (onToolCall) {
          resultContent = await onToolCall(block.name, block.input);
        } else {
          resultContent = `Error: No tool handler registered for "${block.name}"`;
          isError = true;
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : String(err);
        resultContent = `Error executing tool "${block.name}": ${errorMessage}`;
        isError = true;
        logger.warn(
          { tool: block.name, error: errorMessage },
          "Tool execution failed",
        );
      }

      allToolCalls.push({
        name: block.name,
        input: block.input,
        result: resultContent,
      });

      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: resultContent,
        is_error: isError,
      } as ContentBlockParam);
    }

    // Push tool results as a user message
    messages.push({
      role: "user",
      content: toolResults,
    });
  }

  return {
    text: lastTextContent,
    thinkingBlocks: allThinkingBlocks,
    toolCalls: allToolCalls,
    totalInputTokens,
    totalOutputTokens,
    totalCostUsd,
    _messages: messages,
  };
}
