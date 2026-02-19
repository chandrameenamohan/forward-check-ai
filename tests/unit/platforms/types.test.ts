import { describe, it, expect } from "vitest";
import type {
  PlatformMessage,
  PlatformResponder,
  PlatformAdapter,
  PipelineStage,
} from "../../../src/platforms/types.js";
import { PIPELINE_STAGES } from "../../../src/platforms/types.js";

describe("Platform type definitions", () => {
  it("PlatformMessage should be importable and usable as a type", () => {
    const msg: PlatformMessage = {
      platform: "telegram",
      chatId: "12345",
      messageId: "67890",
      text: "Is this true?",
      isForwarded: false,
      sender: { id: "user1" },
    };

    expect(msg.platform).toBe("telegram");
    expect(msg.chatId).toBe("12345");
    expect(msg.messageId).toBe("67890");
    expect(msg.text).toBe("Is this true?");
    expect(msg.isForwarded).toBe(false);
    expect(msg.sender.id).toBe("user1");
  });

  it("PlatformMessage should support optional fields", () => {
    const msg: PlatformMessage = {
      platform: "whatsapp",
      chatId: "5551234",
      messageId: "wamid.abc",
      text: "Check this claim",
      isForwarded: true,
      isFrequentlyForwarded: true,
      sender: {
        id: "5551234",
        username: "john",
        displayName: "John Doe",
      },
      raw: { some: "data" },
    };

    expect(msg.isFrequentlyForwarded).toBe(true);
    expect(msg.sender.username).toBe("john");
    expect(msg.sender.displayName).toBe("John Doe");
    expect(msg.raw).toEqual({ some: "data" });
  });

  it("PlatformResponder should be importable and usable as a type", () => {
    const responder: PlatformResponder = {
      sendText: async (_chatId: string, _text: string) => {},
      sendVerdict: async (_chatId: string, _verdict: unknown, _analysisUrl: string) => {},
      sendStatusUpdate: async (_chatId: string, _stage: PipelineStage) => {},
      sendInitial: async (_chatId: string) => {},
      sendLink: async (_chatId: string, _text: string, _url: string) => {},
    };

    expect(typeof responder.sendText).toBe("function");
    expect(typeof responder.sendVerdict).toBe("function");
    expect(typeof responder.sendStatusUpdate).toBe("function");
    expect(typeof responder.sendInitial).toBe("function");
    expect(typeof responder.sendLink).toBe("function");
  });

  it("PlatformAdapter should be importable and usable as a type", () => {
    const adapter: PlatformAdapter = {
      platform: "whatsapp",
      start: async () => {},
      stop: async () => {},
    };

    expect(adapter.platform).toBe("whatsapp");
    expect(typeof adapter.start).toBe("function");
    expect(typeof adapter.stop).toBe("function");
  });

  it("PIPELINE_STAGES should export all 6 stages", () => {
    const expectedStages: PipelineStage[] = [
      "fetching",
      "planning",
      "searching",
      "analyzing",
      "challenging",
      "judging",
    ];

    for (const stage of expectedStages) {
      expect(PIPELINE_STAGES[stage]).toBeDefined();
      expect(typeof PIPELINE_STAGES[stage]).toBe("string");
    }

    expect(Object.keys(PIPELINE_STAGES)).toHaveLength(6);
  });

  it("PIPELINE_STAGES messages should be human-readable", () => {
    expect(PIPELINE_STAGES.fetching).toContain("Reading");
    expect(PIPELINE_STAGES.planning).toContain("Planning");
    expect(PIPELINE_STAGES.searching).toContain("Searching");
    expect(PIPELINE_STAGES.analyzing).toContain("Analyzing");
    expect(PIPELINE_STAGES.challenging).toContain("Challenging");
    expect(PIPELINE_STAGES.judging).toContain("verdict");
  });

  it("PlatformMessage platform should accept all valid platform values", () => {
    const platforms: Array<PlatformMessage["platform"]> = ["telegram", "whatsapp", "web"];

    for (const platform of platforms) {
      const msg: PlatformMessage = {
        platform,
        chatId: "1",
        messageId: "1",
        text: "test",
        isForwarded: false,
        sender: { id: "1" },
      };
      expect(msg.platform).toBe(platform);
    }
  });
});
