import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** A tool handler that takes arbitrary input and returns a string result */
export type ToolHandler = (input: unknown) => Promise<string> | string;

/** Internal entry stored in the registry */
interface ToolEntry {
  handler: ToolHandler;
  definition: Tool;
}

/**
 * Registry that maps tool names to their execution functions.
 * Used by the agent runner to dispatch tool_use blocks.
 */
export class ToolRegistry {
  private readonly tools = new Map<string, ToolEntry>();

  /**
   * Register a tool with its handler and Claude tool definition.
   *
   * @param name - Unique tool name (must match the tool definition name)
   * @param handler - Function that executes the tool
   * @param definition - Claude API tool definition
   */
  register(name: string, handler: ToolHandler, definition: Tool): void {
    this.tools.set(name, { handler, definition });
    logger.debug({ tool: name }, "Tool registered");
  }

  /**
   * Execute a registered tool by name.
   * Returns the string result, or an error string if the tool is unknown or throws.
   *
   * @param name - Tool name to execute
   * @param input - Input payload for the tool
   * @returns String result from the tool, or an error message
   */
  async execute(name: string, input: unknown): Promise<string> {
    const entry = this.tools.get(name);

    if (!entry) {
      const msg = `Error: Unknown tool "${name}"`;
      logger.warn({ tool: name }, msg);
      return msg;
    }

    try {
      const result = await entry.handler(input);
      return result;
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : String(err);
      const msg = `Error executing tool "${name}": ${errorMessage}`;
      logger.warn({ tool: name, error: errorMessage }, "Tool execution failed");
      return msg;
    }
  }

  /**
   * Get all registered tool definitions for passing to the Claude API.
   *
   * @returns Array of Claude tool definitions
   */
  getToolDefinitions(): Tool[] {
    return Array.from(this.tools.values()).map((entry) => entry.definition);
  }
}
