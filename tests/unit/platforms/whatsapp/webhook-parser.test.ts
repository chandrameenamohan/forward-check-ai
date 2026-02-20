import { describe, it, expect } from "vitest";

/**
 * Helper: builds a minimal valid WhatsApp webhook payload containing
 * one text message.
 */
function makeTextMessagePayload(overrides?: {
  from?: string;
  messageId?: string;
  text?: string;
  forwarded?: boolean;
  frequentlyForwarded?: boolean;
  senderName?: string;
  phoneNumberId?: string;
}) {
  const {
    from = "15551234567",
    messageId = "wamid.abc123",
    text = "PM Modi Rs 5000 direct transfer",
    forwarded,
    frequentlyForwarded,
    senderName = "Test User",
    phoneNumberId = "109876543",
  } = overrides ?? {};

  const message: Record<string, unknown> = {
    from,
    id: messageId,
    timestamp: "1708300000",
    type: "text",
    text: { body: text },
  };

  // Only add context if forwarding flags are set
  if (forwarded !== undefined || frequentlyForwarded !== undefined) {
    message["context"] = {
      ...(forwarded !== undefined ? { forwarded } : {}),
      ...(frequentlyForwarded !== undefined
        ? { frequently_forwarded: frequentlyForwarded }
        : {}),
    };
  }

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WBA_ID_123",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15559990000",
                phone_number_id: phoneNumberId,
              },
              contacts: [{ profile: { name: senderName }, wa_id: from }],
              messages: [message],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

/**
 * Helper: builds a WhatsApp webhook payload with a status update.
 */
function makeStatusPayload(overrides?: {
  messageId?: string;
  status?: string;
}) {
  const { messageId = "wamid.xyz789", status = "delivered" } = overrides ?? {};

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WBA_ID_123",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15559990000",
                phone_number_id: "109876543",
              },
              statuses: [
                {
                  id: messageId,
                  status,
                  timestamp: "1708300000",
                  recipient_id: "15551234567",
                },
              ],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

describe("parseWebhookPayload", () => {
  async function importParser() {
    return import("../../../../src/platforms/whatsapp/webhook-parser.js");
  }

  it("should parse a text message into PlatformMessage", async () => {
    const { parseWebhookPayload } = await importParser();

    const payload = makeTextMessagePayload({
      from: "15551234567",
      messageId: "wamid.abc123",
      text: "Is this true?",
      senderName: "Alice",
    });

    const events = parseWebhookPayload(payload);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("message");

    if (event.type === "message") {
      expect(event.message.platform).toBe("whatsapp");
      expect(event.message.chatId).toBe("15551234567");
      expect(event.message.messageId).toBe("wamid.abc123");
      expect(event.message.text).toBe("Is this true?");
      expect(event.message.isForwarded).toBe(false);
      expect(event.message.isFrequentlyForwarded).toBeUndefined();
      expect(event.message.sender.id).toBe("15551234567");
      expect(event.message.sender.displayName).toBe("Alice");
    }
  });

  it("should detect forwarded messages via context.forwarded", async () => {
    const { parseWebhookPayload } = await importParser();

    const payload = makeTextMessagePayload({ forwarded: true });

    const events = parseWebhookPayload(payload);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("message");

    if (event.type === "message") {
      expect(event.message.isForwarded).toBe(true);
    }
  });

  it("should detect frequently forwarded messages", async () => {
    const { parseWebhookPayload } = await importParser();

    const payload = makeTextMessagePayload({
      forwarded: true,
      frequentlyForwarded: true,
    });

    const events = parseWebhookPayload(payload);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("message");

    if (event.type === "message") {
      expect(event.message.isForwarded).toBe(true);
      expect(event.message.isFrequentlyForwarded).toBe(true);
    }
  });

  it("should parse status update events", async () => {
    const { parseWebhookPayload } = await importParser();

    const payload = makeStatusPayload({
      messageId: "wamid.xyz789",
      status: "delivered",
    });

    const events = parseWebhookPayload(payload);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("status");

    if (event.type === "status") {
      expect(event.messageId).toBe("wamid.xyz789");
      expect(event.status).toBe("delivered");
    }
  });

  it("should return 'unknown' for non-text message types", async () => {
    const { parseWebhookPayload } = await importParser();

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WBA_ID_123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15559990000",
                  phone_number_id: "109876543",
                },
                contacts: [
                  { profile: { name: "Bob" }, wa_id: "15551234567" },
                ],
                messages: [
                  {
                    from: "15551234567",
                    id: "wamid.img001",
                    timestamp: "1708300000",
                    type: "image",
                    image: { id: "media_123", mime_type: "image/jpeg" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const events = parseWebhookPayload(payload);

    expect(events).toHaveLength(1);
    const event = events[0]!;
    expect(event.type).toBe("unknown");
  });

  it("should handle malformed payloads gracefully", async () => {
    const { parseWebhookPayload } = await importParser();

    // Completely bogus payload
    expect(parseWebhookPayload(null)).toEqual([]);
    expect(parseWebhookPayload(undefined)).toEqual([]);
    expect(parseWebhookPayload(42)).toEqual([]);
    expect(parseWebhookPayload("not json")).toEqual([]);
    expect(parseWebhookPayload({})).toEqual([]);
    expect(parseWebhookPayload({ object: "other" })).toEqual([]);

    // Missing entry
    expect(
      parseWebhookPayload({ object: "whatsapp_business_account" }),
    ).toEqual([]);

    // Empty entry array
    expect(
      parseWebhookPayload({
        object: "whatsapp_business_account",
        entry: [],
      }),
    ).toEqual([]);

    // Entry with no changes
    expect(
      parseWebhookPayload({
        object: "whatsapp_business_account",
        entry: [{ id: "WBA", changes: [] }],
      }),
    ).toEqual([]);
  });

  it("should parse multiple messages in a single payload", async () => {
    const { parseWebhookPayload } = await importParser();

    const payload = {
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WBA_ID_123",
          changes: [
            {
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15559990000",
                  phone_number_id: "109876543",
                },
                contacts: [
                  { profile: { name: "Alice" }, wa_id: "15551111111" },
                  { profile: { name: "Bob" }, wa_id: "15552222222" },
                ],
                messages: [
                  {
                    from: "15551111111",
                    id: "wamid.msg1",
                    timestamp: "1708300000",
                    type: "text",
                    text: { body: "First claim" },
                  },
                  {
                    from: "15552222222",
                    id: "wamid.msg2",
                    timestamp: "1708300001",
                    type: "text",
                    text: { body: "Second claim" },
                  },
                ],
              },
              field: "messages",
            },
          ],
        },
      ],
    };

    const events = parseWebhookPayload(payload);

    expect(events).toHaveLength(2);
    expect(events[0]!.type).toBe("message");
    expect(events[1]!.type).toBe("message");

    if (events[0]!.type === "message" && events[1]!.type === "message") {
      expect(events[0]!.message.text).toBe("First claim");
      expect(events[0]!.message.sender.displayName).toBe("Alice");
      expect(events[1]!.message.text).toBe("Second claim");
      expect(events[1]!.message.sender.displayName).toBe("Bob");
    }
  });

  it("should store raw message in PlatformMessage.raw", async () => {
    const { parseWebhookPayload } = await importParser();

    const payload = makeTextMessagePayload({ text: "test raw" });

    const events = parseWebhookPayload(payload);
    const event = events[0]!;

    if (event.type === "message") {
      expect(event.message.raw).toBeDefined();
    }
  });
});
