import { describe, it, expect, vi, beforeEach, type Mock } from "vitest";
import { ClaudeClient, MODELS } from "../../../../src/services/claude-client.js";
import type { Message } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { makeAgentReport } from "../../../fixtures/index.js";
import { extractReport } from "../../../../src/agents/investigators/report-extractor.js";

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
    model: MODELS.SONNET,
    stop_sequence: null,
    usage: {
      input_tokens: 500,
      output_tokens: 300,
      cache_creation_input_tokens: null,
      cache_read_input_tokens: null,
      server_tool_use: null,
      service_tier: null,
      inference_geo: null,
    },
    ...overrides,
  };
}

const VALID_REPORT = makeAgentReport({ agentRole: "source_verification" });

const SUBMIT_REPORT_TOOL = {
  name: "submit_report",
  description: "Submit report",
  input_schema: {
    type: "object" as const,
    properties: {},
    required: [],
  },
};

describe("extractReport", () => {
  let client: ClaudeClient;
  let mockCreate: Mock;

  beforeEach(() => {
    client = new ClaudeClient("test-api-key");
    mockCreate = vi.fn();
    (client._client.messages as unknown as { create: Mock }).create =
      mockCreate;
  });

  it("should extract report from submit_report tool call", async () => {
    const toolCalls = [
      { name: "brave_web_search", input: { query: "test" }, result: "{}" },
      { name: "submit_report", input: VALID_REPORT, result: "Report submitted." },
    ];

    const result = await extractReport({
      toolCalls,
      text: "",
      agentRole: "source_verification",
      client,
      model: MODELS.SONNET,
      systemPrompt: "test prompt",
      messages: [],
      tools: [SUBMIT_REPORT_TOOL],
    });

    expect(result.agentRole).toBe("source_verification");
    expect(result.confidenceScore).toBe(VALID_REPORT.confidenceScore);
    // Should not have called the API for a retry
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("should retry when submit_report not called", async () => {
    const toolCalls = [
      { name: "brave_web_search", input: { query: "test" }, result: "{}" },
    ];

    // Retry follow-up: model calls submit_report this time
    const retryResponse = buildMockMessage({
      content: [
        {
          type: "tool_use" as const,
          id: "toolu_retry",
          name: "submit_report",
          input: VALID_REPORT,
        },
      ],
      stop_reason: "tool_use",
    });

    mockCreate.mockResolvedValueOnce(retryResponse);

    const result = await extractReport({
      toolCalls,
      text: "I found some information about the claim...",
      agentRole: "source_verification",
      client,
      model: MODELS.SONNET,
      systemPrompt: "test prompt",
      messages: [],
      tools: [SUBMIT_REPORT_TOOL],
    });

    expect(result.agentRole).toBe("source_verification");
    expect(mockCreate).toHaveBeenCalledTimes(1);

    // Verify the retry message asks the model to call submit_report
    const callArgs = mockCreate.mock.calls[0]![0] as Record<string, unknown>;
    const messages = callArgs["messages"] as Array<{ role: string; content: string }>;
    const lastMessage = messages[messages.length - 1];
    expect(lastMessage?.role).toBe("user");
    expect(typeof lastMessage?.content === "string" ? lastMessage.content : "").toContain(
      "submit_report",
    );
  });

  it("should fall back to JSON parse when retry also fails", async () => {
    const toolCalls = [
      { name: "brave_web_search", input: { query: "test" }, result: "{}" },
    ];

    // Retry follow-up: model returns text instead of calling submit_report
    const retryResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "I already provided my findings above.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(retryResponse);

    const result = await extractReport({
      toolCalls,
      text: JSON.stringify(VALID_REPORT),
      agentRole: "source_verification",
      client,
      model: MODELS.SONNET,
      systemPrompt: "test prompt",
      messages: [],
      tools: [SUBMIT_REPORT_TOOL],
    });

    expect(result.agentRole).toBe("source_verification");
  });

  it("should handle JSON wrapped in markdown code fences", async () => {
    const toolCalls: Array<{ name: string; input: unknown; result: string }> = [];

    // Retry also fails — model returns text
    const retryResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Sorry, I cannot call tools.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(retryResponse);

    const fencedJson = "```json\n" + JSON.stringify(VALID_REPORT) + "\n```";

    const result = await extractReport({
      toolCalls,
      text: fencedJson,
      agentRole: "source_verification",
      client,
      model: MODELS.SONNET,
      systemPrompt: "test prompt",
      messages: [],
      tools: [SUBMIT_REPORT_TOOL],
    });

    expect(result.agentRole).toBe("source_verification");
  });

  it("should throw when all extraction methods fail", async () => {
    const toolCalls = [
      { name: "brave_web_search", input: { query: "test" }, result: "{}" },
    ];

    // Retry follow-up: model returns non-JSON text
    const retryResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "I could not complete the investigation.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(retryResponse);

    await expect(
      extractReport({
        toolCalls,
        text: "Some non-JSON text about findings",
        agentRole: "source_verification",
        client,
        model: MODELS.SONNET,
        systemPrompt: "test prompt",
        messages: [],
        tools: [SUBMIT_REPORT_TOOL],
      }),
    ).rejects.toThrow("source_verification agent failed to produce a valid report");
  });

  it("should throw with descriptive error including agent role", async () => {
    const toolCalls: Array<{ name: string; input: unknown; result: string }> = [];

    const retryResponse = buildMockMessage({
      content: [
        {
          type: "text" as const,
          text: "Unable to assist.",
          citations: null,
        },
      ],
      stop_reason: "end_turn",
    });

    mockCreate.mockResolvedValueOnce(retryResponse);

    await expect(
      extractReport({
        toolCalls,
        text: "no json here",
        agentRole: "domain_expertise",
        client,
        model: MODELS.SONNET,
        systemPrompt: "test prompt",
        messages: [],
        tools: [SUBMIT_REPORT_TOOL],
      }),
    ).rejects.toThrow("domain_expertise");
  });
});
