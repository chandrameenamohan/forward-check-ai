import { describe, it, expect, vi, beforeEach } from "vitest";
import { createMessageRouter } from "../../../src/platforms/message-router.js";
import type { PlatformMessage, PlatformResponder } from "../../../src/platforms/types.js";
import type { InvestigationPipeline, InvestigateResult } from "../../../src/orchestrator/pipeline.js";
import type { InvestigationRepository } from "../../../src/db/investigation-repository.js";
import { makeFinalVerdict } from "../../fixtures/index.js";

function makePlatformMessage(overrides?: Partial<PlatformMessage>): PlatformMessage {
  return {
    platform: "telegram",
    chatId: "12345",
    messageId: "msg-1",
    text: "Some factual claim to check",
    isForwarded: false,
    sender: { id: "user-1", username: "testuser" },
    ...overrides,
  };
}

function makeMockResponder(): PlatformResponder {
  return {
    sendText: vi.fn().mockResolvedValue(undefined),
    sendVerdict: vi.fn().mockResolvedValue(undefined),
    sendStatusUpdate: vi.fn().mockResolvedValue(undefined),
    sendInitial: vi.fn().mockResolvedValue(undefined),
    sendLink: vi.fn().mockResolvedValue(undefined),
  };
}

function makeMockPipeline(result?: Partial<InvestigateResult>): InvestigationPipeline {
  const defaultResult: InvestigateResult = {
    verdict: makeFinalVerdict(),
    investigationId: "inv-123",
    totalCostUsd: 0.5,
    durationMs: 1000,
    ...result,
  };
  return {
    investigate: vi.fn().mockResolvedValue(defaultResult),
  } as unknown as InvestigationPipeline;
}

function makeMockRepo(): InvestigationRepository {
  return {
    updateStatus: vi.fn(),
  } as unknown as InvestigationRepository;
}

describe("createMessageRouter", () => {
  let responder: PlatformResponder;
  let repo: InvestigationRepository;
  const baseUrl = "https://example.com";

  beforeEach(() => {
    responder = makeMockResponder();
    repo = makeMockRepo();
  });

  it("should send initial status via responder", async () => {
    const pipeline = makeMockPipeline();
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage();

    await router.route(message, responder);

    expect(responder.sendInitial).toHaveBeenCalledWith("12345");
  });

  it("should call pipeline.investigate with platform-agnostic fields", async () => {
    const pipeline = makeMockPipeline();
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage({
      platform: "whatsapp",
      chatId: "wa-chat-1",
      messageId: "wa-msg-1",
      text: "Is this claim true?",
    });

    await router.route(message, responder);

    expect(pipeline.investigate).toHaveBeenCalledWith(
      "Is this claim true?",
      expect.objectContaining({
        platform: "whatsapp",
        platformChatId: "wa-chat-1",
        platformMessageId: "wa-msg-1",
      }),
    );
  });

  it("should send verdict via responder on success", async () => {
    const verdict = makeFinalVerdict({ category: "likely-false", confidence: 10 });
    const pipeline = makeMockPipeline({
      verdict,
      investigationId: "inv-456",
    });
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage();

    await router.route(message, responder);

    expect(responder.sendVerdict).toHaveBeenCalledWith(
      "12345",
      verdict,
      "https://example.com/v/inv-456",
    );
  });

  it("should send non-factual response for greeting messages", async () => {
    const pipeline = makeMockPipeline({
      verdict: null,
      nonFactualResponse: "Hi! I'm a fact-checking bot.",
    });
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage({ text: "Hello" });

    await router.route(message, responder);

    expect(responder.sendText).toHaveBeenCalledWith(
      "12345",
      "Hi! I'm a fact-checking bot.",
    );
    expect(responder.sendVerdict).not.toHaveBeenCalled();
  });

  it("should send error message on pipeline failure", async () => {
    const pipeline = {
      investigate: vi.fn().mockRejectedValue(new Error("Pipeline exploded")),
    } as unknown as InvestigationPipeline;
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage();

    await router.route(message, responder);

    expect(responder.sendText).toHaveBeenCalledWith(
      "12345",
      expect.stringContaining("error occurred"),
    );
  });

  it("should mark investigation as failed on timeout", async () => {
    // Simulate a pipeline that captures the onInvestigationCreated callback
    // and then rejects with a timeout
    const pipeline = {
      investigate: vi.fn().mockImplementation(
        async (_text: string, options: { onInvestigationCreated?: (id: string) => void }) => {
          // Trigger investigation creation before failing
          if (options.onInvestigationCreated) {
            await options.onInvestigationCreated("inv-timeout");
          }
          throw new Error("Investigation pipeline timed out after 300s");
        },
      ),
    } as unknown as InvestigationPipeline;
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage();

    await router.route(message, responder);

    expect(repo.updateStatus).toHaveBeenCalledWith("inv-timeout", "failed");
    expect(responder.sendText).toHaveBeenCalledWith(
      "12345",
      expect.stringContaining("taking longer than expected"),
    );
  });

  it("should detect URL and send 'Reading article...' message", async () => {
    const pipeline = makeMockPipeline();
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage({
      text: "Check this: https://example.com/article",
    });

    await router.route(message, responder);

    // sendText should be called with "Reading article..." before pipeline
    const sendTextCalls = vi.mocked(responder.sendText).mock.calls;
    const readingCall = sendTextCalls.find(
      (call) => typeof call[1] === "string" && call[1].includes("Reading article"),
    );
    expect(readingCall).toBeDefined();
  });

  it("should pass onStatusUpdate callback to pipeline", async () => {
    const pipeline = {
      investigate: vi.fn().mockImplementation(
        async (_text: string, options: { onStatusUpdate?: (stage: string) => void }) => {
          if (options.onStatusUpdate) {
            options.onStatusUpdate("planning");
            options.onStatusUpdate("searching");
          }
          return {
            verdict: makeFinalVerdict(),
            investigationId: "inv-999",
            totalCostUsd: 0.5,
            durationMs: 1000,
          };
        },
      ),
    } as unknown as InvestigationPipeline;
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage();

    await router.route(message, responder);

    expect(responder.sendStatusUpdate).toHaveBeenCalledWith("12345", "planning");
    expect(responder.sendStatusUpdate).toHaveBeenCalledWith("12345", "searching");
  });

  it("should pass onInvestigationCreated callback that sends live link", async () => {
    const pipeline = {
      investigate: vi.fn().mockImplementation(
        async (_text: string, options: { onInvestigationCreated?: (id: string) => void }) => {
          if (options.onInvestigationCreated) {
            await options.onInvestigationCreated("inv-live");
          }
          return {
            verdict: makeFinalVerdict(),
            investigationId: "inv-live",
            totalCostUsd: 0.5,
            durationMs: 1000,
          };
        },
      ),
    } as unknown as InvestigationPipeline;
    const router = createMessageRouter(pipeline, repo, baseUrl);
    const message = makePlatformMessage();

    await router.route(message, responder);

    expect(responder.sendLink).toHaveBeenCalledWith(
      "12345",
      "Watch Live Investigation",
      "https://example.com/live/inv-live",
    );
  });
});
