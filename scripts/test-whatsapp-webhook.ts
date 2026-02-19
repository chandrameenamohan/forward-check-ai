/**
 * WhatsApp Webhook Test Script
 *
 * Simulates WhatsApp Cloud API webhook payloads for local development testing.
 * Sends 4 requests to the local server:
 *   1. Text message
 *   2. Forwarded message (context.forwarded: true)
 *   3. Frequently forwarded message (context.frequently_forwarded: true)
 *   4. Webhook verification GET request
 *
 * Usage:
 *   npx tsx scripts/test-whatsapp-webhook.ts
 *   PORT=3001 npx tsx scripts/test-whatsapp-webhook.ts
 *   VERIFY_TOKEN=my-token npx tsx scripts/test-whatsapp-webhook.ts
 */

const BASE_URL = `http://localhost:${process.env["PORT"] ?? "3000"}`;
const WEBHOOK_URL = `${BASE_URL}/webhook/whatsapp`;
const VERIFY_TOKEN = process.env["VERIFY_TOKEN"] ?? "test-verify-token";

// --- Payload builders ---

interface WebhookPayload {
  object: string;
  entry: Array<{
    id: string;
    changes: Array<{
      value: {
        messaging_product: string;
        metadata: {
          display_phone_number: string;
          phone_number_id: string;
        };
        contacts?: Array<{
          profile: { name: string };
          wa_id: string;
        }>;
        messages?: Array<{
          from: string;
          id: string;
          timestamp: string;
          type: string;
          text?: { body: string };
          context?: {
            forwarded?: boolean;
            frequently_forwarded?: boolean;
          };
        }>;
      };
      field: string;
    }>;
  }>;
}

function createTextMessagePayload(
  text: string,
  context?: { forwarded?: boolean; frequently_forwarded?: boolean },
): WebhookPayload {
  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "WHATSAPP_BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: "15555550100",
                phone_number_id: "123456789",
              },
              contacts: [
                {
                  profile: { name: "Test User" },
                  wa_id: "14155551234",
                },
              ],
              messages: [
                {
                  from: "14155551234",
                  id: `wamid.test_${Date.now()}`,
                  timestamp: String(Math.floor(Date.now() / 1000)),
                  type: "text",
                  text: { body: text },
                  ...(context ? { context } : {}),
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

// --- Request helpers ---

async function sendPostWebhook(
  label: string,
  payload: WebhookPayload,
): Promise<void> {
  process.stdout.write(`\n--- ${label} ---\n`);
  process.stdout.write(`POST ${WEBHOOK_URL}\n`);
  process.stdout.write(`Payload: ${JSON.stringify(payload, null, 2).slice(0, 200)}...\n`);

  try {
    const response = await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    process.stdout.write(`Status: ${response.status} ${response.statusText}\n`);
    const body = await response.text();
    if (body) {
      process.stdout.write(`Body: ${body}\n`);
    }
    process.stdout.write(`Result: ${response.ok ? "OK" : "FAILED"}\n`);
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
  }
}

async function sendVerificationRequest(): Promise<void> {
  const challenge = "test_challenge_string_12345";
  const params = new URLSearchParams({
    "hub.mode": "subscribe",
    "hub.verify_token": VERIFY_TOKEN,
    "hub.challenge": challenge,
  });
  const url = `${WEBHOOK_URL}?${params.toString()}`;

  process.stdout.write(`\n--- Webhook Verification (GET) ---\n`);
  process.stdout.write(`GET ${url}\n`);

  try {
    const response = await fetch(url, { method: "GET" });

    process.stdout.write(`Status: ${response.status} ${response.statusText}\n`);
    const body = await response.text();
    process.stdout.write(`Body: ${body}\n`);

    if (body === challenge) {
      process.stdout.write(`Result: OK (challenge echoed correctly)\n`);
    } else {
      process.stdout.write(`Result: UNEXPECTED (expected "${challenge}", got "${body}")\n`);
    }
  } catch (err) {
    process.stderr.write(`Error: ${String(err)}\n`);
  }
}

// --- Main ---

async function main(): Promise<void> {
  process.stdout.write("=== WhatsApp Webhook Test Script ===\n");
  process.stdout.write(`Target: ${WEBHOOK_URL}\n`);
  process.stdout.write(`Verify Token: ${VERIFY_TOKEN}\n`);

  // 1. Plain text message
  await sendPostWebhook(
    "1. Text Message",
    createTextMessagePayload(
      "NASA confirmed that water exists on Mars in liquid form during summer months in 2024",
    ),
  );

  // 2. Forwarded message
  await sendPostWebhook(
    "2. Forwarded Message",
    createTextMessagePayload(
      "BREAKING: Scientists discover that drinking warm lemon water cures diabetes completely",
      { forwarded: true },
    ),
  );

  // 3. Frequently forwarded message
  await sendPostWebhook(
    "3. Frequently Forwarded Message",
    createTextMessagePayload(
      "URGENT: 5G towers are being used to spread COVID-19 variants, share with everyone!",
      { forwarded: true, frequently_forwarded: true },
    ),
  );

  // 4. Verification GET request
  await sendVerificationRequest();

  process.stdout.write("\n=== All requests completed ===\n");
}

main().catch((err) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
