import { describe, it, expect, vi } from "vitest";
import { ToolRegistry } from "../../../src/tools/tool-registry.js";

describe("ToolRegistry", () => {
  it("should register and execute a tool by name", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn().mockResolvedValue("tool result");

    registry.register("my_tool", handler, {
      name: "my_tool",
      description: "A test tool",
      input_schema: {
        type: "object" as const,
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    });

    const result = await registry.execute("my_tool", { query: "hello" });

    expect(result).toBe("tool result");
    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith({ query: "hello" });
  });

  it("should return all tool definitions", () => {
    const registry = new ToolRegistry();

    const def1 = {
      name: "tool_a",
      description: "Tool A",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    };

    const def2 = {
      name: "tool_b",
      description: "Tool B",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    };

    registry.register("tool_a", vi.fn(), def1);
    registry.register("tool_b", vi.fn(), def2);

    const definitions = registry.getToolDefinitions();

    expect(definitions).toHaveLength(2);
    expect(definitions[0]!.name).toBe("tool_a");
    expect(definitions[1]!.name).toBe("tool_b");
  });

  it("should return error string for unknown tool", async () => {
    const registry = new ToolRegistry();

    const result = await registry.execute("nonexistent_tool", {});

    expect(result).toContain("Error");
    expect(result).toContain("nonexistent_tool");
  });

  it("should catch tool execution errors and return error string", async () => {
    const registry = new ToolRegistry();
    const failingHandler = vi
      .fn()
      .mockRejectedValue(new Error("Something went wrong"));

    registry.register("failing_tool", failingHandler, {
      name: "failing_tool",
      description: "A tool that fails",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    });

    const result = await registry.execute("failing_tool", {});

    expect(result).toContain("Error");
    expect(result).toContain("Something went wrong");
  });

  it("should handle synchronous tool handlers", async () => {
    const registry = new ToolRegistry();
    const syncHandler = vi.fn().mockReturnValue("sync result");

    registry.register("sync_tool", syncHandler, {
      name: "sync_tool",
      description: "A sync tool",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    });

    const result = await registry.execute("sync_tool", { data: "test" });

    expect(result).toBe("sync result");
    expect(syncHandler).toHaveBeenCalledWith({ data: "test" });
  });

  it("should handle non-Error thrown values in tool execution", async () => {
    const registry = new ToolRegistry();
    const handler = vi.fn().mockRejectedValue("string error");

    registry.register("string_throw_tool", handler, {
      name: "string_throw_tool",
      description: "Throws a string",
      input_schema: {
        type: "object" as const,
        properties: {},
        required: [],
      },
    });

    const result = await registry.execute("string_throw_tool", {});

    expect(result).toContain("Error");
    expect(result).toContain("string error");
  });
});
