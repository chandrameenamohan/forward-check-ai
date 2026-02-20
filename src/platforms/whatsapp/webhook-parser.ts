import { z } from "zod";
import { createLogger } from "../../config/logger.js";
import type { PlatformMessage } from "../types.js";

const logger = createLogger({ level: "info" });

// --- Parsed event types ---

export type ParsedWebhookEvent =
  | { type: "message"; message: PlatformMessage }
  | { type: "status"; messageId: string; status: string }
  | { type: "unknown" };

// --- Zod schemas for the WhatsApp Cloud API webhook payload ---

const ContactSchema = z.object({
  profile: z.object({ name: z.string().optional() }).optional(),
  wa_id: z.string(),
});

const MessageContextSchema = z.object({
  forwarded: z.boolean().optional(),
  frequently_forwarded: z.boolean().optional(),
}).optional();

const TextBodySchema = z.object({
  body: z.string(),
});

const WebhookMessageSchema = z.object({
  from: z.string(),
  id: z.string(),
  timestamp: z.string(),
  type: z.string(),
  text: TextBodySchema.optional(),
  context: MessageContextSchema,
});

const StatusSchema = z.object({
  id: z.string(),
  status: z.string(),
  timestamp: z.string(),
  recipient_id: z.string(),
});

const ChangeValueSchema = z.object({
  messaging_product: z.string(),
  metadata: z.object({
    display_phone_number: z.string(),
    phone_number_id: z.string(),
  }),
  contacts: z.array(ContactSchema).optional(),
  messages: z.array(WebhookMessageSchema).optional(),
  statuses: z.array(StatusSchema).optional(),
});

const ChangeSchema = z.object({
  value: ChangeValueSchema,
  field: z.string(),
});

const EntrySchema = z.object({
  id: z.string(),
  changes: z.array(ChangeSchema),
});

const WebhookPayloadSchema = z.object({
  object: z.literal("whatsapp_business_account"),
  entry: z.array(EntrySchema),
});

// --- Contact lookup helper ---

/**
 * Build a map from wa_id → display name from the contacts array.
 */
function buildContactMap(
  contacts: z.infer<typeof ContactSchema>[] | undefined,
): Map<string, string> {
  const map = new Map<string, string>();
  if (!contacts) return map;
  for (const contact of contacts) {
    const name = contact.profile?.name;
    if (name) {
      map.set(contact.wa_id, name);
    }
  }
  return map;
}

// --- Main parser ---

/**
 * Parse an incoming WhatsApp Cloud API webhook POST payload into
 * an array of typed events (messages, statuses, or unknown).
 *
 * Returns an empty array for malformed or unrecognized payloads.
 */
export function parseWebhookPayload(body: unknown): ParsedWebhookEvent[] {
  const parsed = WebhookPayloadSchema.safeParse(body);
  if (!parsed.success) {
    logger.debug({ error: parsed.error.message }, "Webhook payload validation failed");
    return [];
  }

  const events: ParsedWebhookEvent[] = [];

  for (const entry of parsed.data.entry) {
    for (const change of entry.changes) {
      const { value } = change;
      const contactMap = buildContactMap(value.contacts);

      // Process messages
      if (value.messages) {
        for (const msg of value.messages) {
          if (msg.type === "text" && msg.text) {
            const isForwarded = msg.context?.forwarded === true;
            const isFrequentlyForwarded =
              msg.context?.frequently_forwarded === true;

            const platformMessage: PlatformMessage = {
              platform: "whatsapp",
              chatId: msg.from,
              messageId: msg.id,
              text: msg.text.body,
              isForwarded,
              ...(isFrequentlyForwarded
                ? { isFrequentlyForwarded: true }
                : {}),
              sender: {
                id: msg.from,
                displayName: contactMap.get(msg.from),
              },
              raw: msg,
            };

            events.push({ type: "message", message: platformMessage });
          } else {
            // Non-text message type — log and emit unknown event
            logger.debug(
              { messageType: msg.type, messageId: msg.id },
              "Skipping non-text WhatsApp message",
            );
            events.push({ type: "unknown" });
          }
        }
      }

      // Process status updates
      if (value.statuses) {
        for (const statusUpdate of value.statuses) {
          events.push({
            type: "status",
            messageId: statusUpdate.id,
            status: statusUpdate.status,
          });
        }
      }
    }
  }

  return events;
}
