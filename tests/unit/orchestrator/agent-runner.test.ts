import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import {
  runAgent,
  type AgentConfig,
  type AgentResult,
} from "../../../src/orchestrator/agent-runner.js";
import { ClaudeClient, MODELS } from "../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";

/**
 * Helper to build a mock Message response from the Anthropic API.
 */
function buildMockMessage(
  overrides: Partial<Message> & {
    content: Message["content"];
    stop_reason: Message["stop_reason"];
  },
): Message {
  return {
    id: "msg_test",
    type: "message" as const,
    role: "assistant" as const,
    model: MODELS.HAIKU,
    stop_sequence: null,
    usage: {
      input_tokens: 100,
      output_tokens: 50,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
}

describe("runAgent", () => {
  let client: ClaudeClient;
  let mockCreate: Mock;

  beforeEach(() => {
    client = new ClaudeClient("test-api-key");
    mockCreate = vi.fn();
    (client._client.messages as unknown as { create: Mock }).create =
      mockCreate;
  });

  it("should complete single-turn agent call (no tools)", async () => {
    const response = buildMockMessage({
      content: [{ type: "text" as const, text: "Hello world!", citations: null }],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const config: AgentConfig = {
      client,
      model: MODELS.HAIKU,
      systemPrompt: "You are a helpful assistant.",
      messages: [{ role: "user", content: "Say hello" }],
      maxTurns: 3,
    };

    const result = await runAgent(config);

    expect(result.text).toBe("Hello world!");
    expect(result.toolCalls).toHaveLength(0);
    expect(result.thinkingBlocks).toHaveLength(0);
    expect(result.totalInputTokens).toBe(100);
    expect(result.totalOutputTokens).toBe(50);
    expect(result.totalCostUsd).toBeGreaterThan(0);
    expect(mockCreate).toHaveBeenCalledTimes(1);
  });

  it("should handle tool-use loop with mock tool", async () => {
    // Turn 1: model requests tool use
    const toolUseResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_123",
          name: "get_weather",
          input: { city: "London" },
        },
      ],
      stop_reason: "tool_use",
    });

    // Turn 2: model gives final text after receiving tool result
    const finalResponse = buildMockMessage({
      content: [
        { type: "text" as const, text: "The weather in London is sunny.", citations: null },
      ],
      stop_reason: "end_turn",
    });

    mockCreate
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    const onToolCall = vi.fn().mockResolvedValue("Sunny, 22°C");

    const config: AgentConfig = {
      client,
      model: MODELS.SONNET,
      systemPrompt: "You have weather access.",
      messages: [{ role: "user", content: "What's the weather in London?" }],
      maxTurns: 5,
      tools: [
        {
          name: "get_weather",
          description: "Get weather for a city",
          input_schema: {
            type: "object" as const,
            properties: { city: { type: "string" } },
            required: ["city"],
          },
        },
      ],
      onToolCall,
    };

    const result = await runAgent(config);

    expect(result.text).toBe("The weather in London is sunny.");
    expect(result.toolCalls).toHaveLength(1);
    expect(result.toolCalls[0]!.name).toBe("get_weather");
    expect(result.toolCalls[0]!.input).toEqual({ city: "London" });
    expect(result.toolCalls[0]!.result).toBe("Sunny, 22°C");
    expect(onToolCall).toHaveBeenCalledWith("get_weather", { city: "London" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("should stop after maxTurns", async () => {
    // Model keeps requesting tools on every turn
    const toolUseResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_loop",
          name: "search",
          input: { query: "test" },
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValue(toolUseResponse);

    const onToolCall = vi.fn().mockResolvedValue("search result");

    const config: AgentConfig = {
      client,
      model: MODELS.SONNET,
      systemPrompt: "Search agent.",
      messages: [{ role: "user", content: "Find info" }],
      maxTurns: 2,
      tools: [
        {
          name: "search",
          description: "Search the web",
          input_schema: {
            type: "object" as const,
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ],
      onToolCall,
    };

    const result = await runAgent(config);

    // Should have stopped after 2 turns, not continued indefinitely
    expect(mockCreate).toHaveBeenCalledTimes(2);
    expect(result.toolCalls).toHaveLength(2);
  });

  it("should extract thinking blocks from response", async () => {
    const response = buildMockMessage({
      content: [
        {
          type: "thinking" as const,
          thinking: "Let me think about this carefully...",
          signature: "sig_abc",
        },
        { type: "text" as const, text: "The answer is 42.", citations: null },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const config: AgentConfig = {
      client,
      model: MODELS.OPUS,
      systemPrompt: "Think deeply.",
      messages: [{ role: "user", content: "What is the meaning of life?" }],
      maxTurns: 1,
      thinkingConfig: { type: "enabled", budget_tokens: 5000 },
    };

    const result = await runAgent(config);

    expect(result.text).toBe("The answer is 42.");
    expect(result.thinkingBlocks).toHaveLength(1);
    expect(result.thinkingBlocks[0]).toBe(
      "Let me think about this carefully...",
    );
  });

  it("should timeout after specified duration", async () => {
    // Simulate a slow API call that takes longer than timeout
    mockCreate.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(
            () =>
              resolve(
                buildMockMessage({
                  content: [
                    { type: "text" as const, text: "late", citations: null },
                  ],
                  stop_reason: "end_turn",
                }),
              ),
            5000,
          );
        }),
    );

    const config: AgentConfig = {
      client,
      model: MODELS.HAIKU,
      systemPrompt: "test",
      messages: [{ role: "user", content: "test" }],
      maxTurns: 1,
      timeoutMs: 100,
    };

    await expect(runAgent(config)).rejects.toThrow(/timeout|abort/i);
  });

  it("should accumulate token usage across multi-turn loop", async () => {
    const toolUseResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_1",
          name: "search",
          input: { q: "a" },
        },
      ],
      stop_reason: "tool_use",
      usage: {
        input_tokens: 200,
        output_tokens: 100,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
        inference_geo: null,
      },
    });

    const finalResponse = buildMockMessage({
      content: [{ type: "text" as const, text: "Done", citations: null }],
      stop_reason: "end_turn",
      usage: {
        input_tokens: 300,
        output_tokens: 150,
        cache_creation_input_tokens: null,
        cache_read_input_tokens: null,
        server_tool_use: null,
        service_tier: null,
        inference_geo: null,
      },
    });

    mockCreate
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    const config: AgentConfig = {
      client,
      model: MODELS.SONNET,
      systemPrompt: "Search agent.",
      messages: [{ role: "user", content: "Find" }],
      maxTurns: 5,
      tools: [
        {
          name: "search",
          description: "Search",
          input_schema: {
            type: "object" as const,
            properties: { q: { type: "string" } },
            required: ["q"],
          },
        },
      ],
      onToolCall: vi.fn().mockResolvedValue("result"),
    };

    const result = await runAgent(config);

    expect(result.totalInputTokens).toBe(500);
    expect(result.totalOutputTokens).toBe(250);
  });

  it("should handle tool execution errors gracefully", async () => {
    const toolUseResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_err",
          name: "failing_tool",
          input: {},
        },
      ],
      stop_reason: "tool_use",
    });

    const finalResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Tool failed, but I can still answer.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate
      .mockResolvedValueOnce(toolUseResponse)
      .mockResolvedValueOnce(finalResponse);

    const onToolCall = vi
      .fn()
      .mockRejectedValue(new Error("Connection failed"));

    const config: AgentConfig = {
      client,
      model: MODELS.SONNET,
      systemPrompt: "Agent.",
      messages: [{ role: "user", content: "Do something" }],
      maxTurns: 5,
      tools: [
        {
          name: "failing_tool",
          description: "A tool that fails",
          input_schema: { type: "object" as const },
        },
      ],
      onToolCall,
    };

    // Should not throw — errors are returned to the model as error content
    const result = await runAgent(config);

    expect(result.text).toBe("Tool failed, but I can still answer.");
    expect(mockCreate).toHaveBeenCalledTimes(2);

    // Verify the second call included an error tool_result
    const secondCallArgs = mockCreate.mock.calls[1]![0];
    const lastMessage =
      secondCallArgs.messages[secondCallArgs.messages.length - 1];
    expect(lastMessage.role).toBe("user");
    const toolResultBlock = Array.isArray(lastMessage.content)
      ? lastMessage.content.find(
          (b: { type: string }) => b.type === "tool_result",
        )
      : undefined;
    expect(toolResultBlock).toBeDefined();
    expect(toolResultBlock.is_error).toBe(true);
  });

  it("should pass thinking config to API call", async () => {
    const response = buildMockMessage({
      content: [{ type: "text" as const, text: "Thought about it.", citations: null }],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(response);

    const config: AgentConfig = {
      client,
      model: MODELS.OPUS,
      systemPrompt: "Think.",
      messages: [{ role: "user", content: "Think" }],
      maxTurns: 1,
      thinkingConfig: { type: "enabled", budget_tokens: 10000 },
    };

    await runAgent(config);

    const callArgs = mockCreate.mock.calls[0]![0];
    expect(callArgs.thinking).toEqual({
      type: "enabled",
      budget_tokens: 10000,
    });
  });

  it("should handle multiple tool uses in a single response", async () => {
    // Model requests two tools at once
    const multiToolResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_a",
          name: "search",
          input: { query: "first" },
        },
        {
          type: "tool_use" as const,
          id: "toolu_b",
          name: "search",
          input: { query: "second" },
        },
      ],
      stop_reason: "tool_use",
    });

    const finalResponse = buildMockMessage({
      content: [{ type: "text" as const, text: "Found both.", citations: null }],
      stop_reason: "end_turn",
    });

    mockCreate
      .mockResolvedValueOnce(multiToolResponse)
      .mockResolvedValueOnce(finalResponse);

    const onToolCall = vi.fn().mockResolvedValue("result");

    const config: AgentConfig = {
      client,
      model: MODELS.SONNET,
      systemPrompt: "Agent.",
      messages: [{ role: "user", content: "Search two things" }],
      maxTurns: 5,
      tools: [
        {
          name: "search",
          description: "Search",
          input_schema: {
            type: "object" as const,
            properties: { query: { type: "string" } },
            required: ["query"],
          },
        },
      ],
      onToolCall,
    };

    const result = await runAgent(config);

    expect(result.toolCalls).toHaveLength(2);
    expect(onToolCall).toHaveBeenCalledTimes(2);
    expect(result.text).toBe("Found both.");
  });

  describe("QA: real API call", () => {
    const apiKey = process.env["ANTHROPIC_API_KEY"];

    it.skipIf(!apiKey)(
      "should run a real multi-turn agent with a dummy tool",
      { timeout: 60_000 },
      async () => {
        const realClient = new ClaudeClient(apiKey!);

        const onToolCall = vi.fn().mockImplementation(
          (name: string, input: unknown) => {
            if (name === "get_weather") {
              const inp = input as { city: string };
              return `The weather in ${inp.city} is sunny and 22°C.`;
            }
            return "Unknown tool";
          },
        );

        const config: AgentConfig = {
          client: realClient,
          model: MODELS.HAIKU,
          systemPrompt:
            "You are a weather assistant. Use the get_weather tool to answer weather questions. After getting the result, provide a brief answer.",
          messages: [
            {
              role: "user",
              content: "What is the weather in Paris right now?",
            },
          ],
          maxTurns: 3,
          tools: [
            {
              name: "get_weather",
              description:
                "Get the current weather for a city. Returns a string with temperature and conditions.",
              input_schema: {
                type: "object" as const,
                properties: {
                  city: {
                    type: "string",
                    description: "The city to get weather for",
                  },
                },
                required: ["city"],
              },
            },
          ],
          onToolCall,
        };

        const result = await runAgent(config);

        // Should have called the tool at least once
        expect(result.toolCalls.length).toBeGreaterThanOrEqual(1);
        expect(onToolCall).toHaveBeenCalled();

        // Should have produced final text
        expect(result.text).toBeTruthy();
        expect(result.text.length).toBeGreaterThan(0);

        // Token usage should be tracked
        expect(result.totalInputTokens).toBeGreaterThan(0);
        expect(result.totalOutputTokens).toBeGreaterThan(0);
        expect(result.totalCostUsd).toBeGreaterThan(0);

        // Log cost for budget tracking
        console.info(
          `[QA] Agent runner cost: $${result.totalCostUsd.toFixed(6)} (${result.totalInputTokens} in, ${result.totalOutputTokens} out, ${result.toolCalls.length} tool calls)`,
        );
      },
    );
  });
});
