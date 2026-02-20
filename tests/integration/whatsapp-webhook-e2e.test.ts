import { describe, it, expect, vi, afterEach } from "vitest";
import { randomUUID } from "node:crypto";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync, unlinkSync } from "node:fs";
import type { Server } from "node:http";
import type { InvestigateResult, InvestigateOptions } from "../../src/orchestrator/pipeline.js";
import { makeFinalVerdict } from "../fixtures/index.js";

/** Helper to clean up SQLite database files (including WAL/SHM) */
function cleanupDb(dbPath: string): void {
  for (const suffix of ["", "-wal", "-shm"]) {
    const filePath = dbPath + suffix;
    if (existsSync(filePath)) {
      unlinkSync(filePath);
    }
  }
}

/** Poll until condition is true or timeout. */
async function waitFor(
  condition: () => boolean,
  maxMs = 5000,
): Promise<void> {
  const start = Date.now();
  while (!condition() && Date.now() - start < maxMs) {
    await new Promise((r) => setTimeout(r, 50));
  }
  if (!condition()) {
    throw new Error(`waitFor timed out after ${maxMs}ms`);
  }
}

/** Build a minimal WhatsApp Cloud API webhook payload for a text message. */
function makeWebhookPayload(options: {
  from: string;
  messageId: string;
  text: string;
  contactName?: string;
  forwarded?: boolean;
  frequentlyForwarded?: boolean;
}): Record<string, unknown> {
  const message: Record<string, unknown> = {
    from: options.from,
    id: options.messageId,
    timestamp: "1700000000",
    type: "text",
    text: { body: options.text },
  };

  if (options.forwarded || options.frequentlyForwarded) {
    message["context"] = {
      ...(options.forwarded ? { forwarded: true } : {}),
      ...(options.frequentlyForwarded ? { frequently_forwarded: true } : {}),
    };
  }

  return {
    object: "whatsapp_business_account",
    entry: [
      {
        id: "BUSINESS_ACCOUNT_ID",
        changes: [
          {
            value: {
              messaging_product: "whatsapp",
              metadata: {
                display_phone_number: options.from,
                phone_number_id: "test-phone-id",
              },
              contacts: [
                {
                  profile: { name: options.contactName ?? "Test User" },
                  wa_id: options.from,
                },
              ],
              messages: [message],
            },
            field: "messages",
          },
        ],
      },
    ],
  };
}

describe("WhatsApp webhook end-to-end", () => {
  const dbPath = join(tmpdir(), `forwardcheck-wa-e2e-${randomUUID()}.db`);
  let server: Server | undefined;
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
    cleanupDb(dbPath);
    globalThis.fetch = originalFetch;
  });

  /**
   * Shared setup: creates DB, mocks fetch, mocks pipeline, creates Express app
   * with WhatsApp webhook routes mounted, and starts on a random port.
   */
  async function setupApp(verifyToken = "test-verify-token", appSecret?: string) {
    const { createDatabase } = await import("../../src/db/connection.js");
    const { runMigrations } = await import("../../src/db/migrations.js");
    const { InvestigationRepository } = await import(
      "../../src/db/investigation-repository.js"
    );
    const { createMessageRouter } = await import(
      "../../src/platforms/message-router.js"
    );
    const { WhatsAppAdapter } = await import(
      "../../src/platforms/whatsapp/adapter.js"
    );
    const { createApp } = await import("../../src/server/app.js");

    const db = createDatabase(dbPath);
    runMigrations(db);
    const repo = new InvestigationRepository(db);
    const baseUrl = "http://localhost:3000";

    // Mock globalThis.fetch so WhatsApp Cloud API calls don't go to Meta
    const mockFetch = vi.fn(
      async (_input: string | URL | Request, _init?: RequestInit) => {
        return new Response(
          JSON.stringify({ messages: [{ id: "wamid.mock-response" }] }),
          { status: 200, headers: { "Content-Type": "application/json" } },
        );
      },
    );
    globalThis.fetch = mockFetch as unknown as typeof fetch;

    // Mock pipeline that creates a DB record and returns a canned verdict
    const verdict = makeFinalVerdict({
      category: "likely-false",
      confidence: 25,
      summary: "This claim has been debunked by multiple sources.",
    });

    const mockInvestigate = vi.fn(
      async (
        text: string,
        options?: InvestigateOptions,
      ): Promise<InvestigateResult> => {
        const investigationId = repo.create(text, {
          platform: options?.platform,
          platformChatId: options?.platformChatId,
          platformMessageId: options?.platformMessageId,
        });

        if (options?.onInvestigationCreated) {
          await options.onInvestigationCreated(investigationId);
        }

        return {
          verdict,
          investigationId,
          totalCostUsd: 0.5,
          durationMs: 1000,
        };
      },
    );

    const mockPipeline = {
      investigate: mockInvestigate,
    } as unknown as Parameters<typeof createMessageRouter>[0];

    const messageRouter = createMessageRouter(mockPipeline, repo, baseUrl);

    const whatsAppAdapter = new WhatsAppAdapter(
      "test-phone-id",
      "test-access-token",
      verifyToken,
      appSecret,
      messageRouter,
    );

    const app = createApp(
      repo,
      undefined, // eventBus
      undefined, // pipeline
      undefined, // feedbackRepo
      undefined, // githubService
      undefined, // telegramBotUsername
      whatsAppAdapter,
    );

    const port = await new Promise<number>((resolve) => {
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });

    return { db, repo, port, mockFetch, mockInvestigate, verdict };
  }

  it(
    "should process a WhatsApp text message end-to-end",
    { timeout: 30_000 },
    async () => {
      const { db, repo, port, mockFetch, mockInvestigate } = await setupApp();

      const payload = makeWebhookPayload({
        from: "1234567890",
        messageId: "wamid.test123",
        text: "Is it true that vaccines cause autism?",
      });

      // POST webhook — should return 200 immediately
      const webhookRes = await originalFetch(
        `http://127.0.0.1:${port}/webhook/whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      expect(webhookRes.status).toBe(200);

      // Wait for pipeline to be invoked
      await waitFor(() => mockInvestigate.mock.calls.length >= 1);

      // Wait for post-pipeline processing (welcome + initial + sendLink + verdict text + verdict CTA)
      await waitFor(() => mockFetch.mock.calls.length >= 5, 10_000);

      // --- Verify pipeline was called with correct args ---
      expect(mockInvestigate).toHaveBeenCalledOnce();
      const [calledText, calledOptions] = mockInvestigate.mock.calls[0]!;
      expect(calledText).toBe("Is it true that vaccines cause autism?");
      const opts = calledOptions as InvestigateOptions;
      expect(opts.platform).toBe("whatsapp");
      expect(opts.platformChatId).toBe("1234567890");

      // --- Verify WhatsApp Cloud API calls ---
      // All mocked fetch calls should target the WhatsApp Graph API
      for (const call of mockFetch.mock.calls) {
        const url = String(call[0]);
        expect(url).toContain("graph.facebook.com");
      }

      // Find the verdict text message — should contain "LIKELY FALSE"
      const verdictTextCall = mockFetch.mock.calls.find((call) => {
        const init = call[1] as RequestInit | undefined;
        if (!init?.body) return false;
        const body = JSON.parse(init.body as string) as Record<string, unknown>;
        if (body.type !== "text") return false;
        const textObj = body.text as { body: string } | undefined;
        return textObj?.body?.includes("LIKELY FALSE");
      });
      expect(verdictTextCall).toBeDefined();

      // --- Verify DB record has correct platform fields ---
      const investigations = repo.getRecent(10);
      expect(investigations.length).toBeGreaterThanOrEqual(1);
      const investigation = investigations[0]!;
      expect(investigation.source_platform).toBe("whatsapp");
      expect(investigation.platform_chat_id).toBe("1234567890");
      expect(investigation.original_message).toBe(
        "Is it true that vaccines cause autism?",
      );

      db.close();
    },
  );

  it(
    "should handle forwarded WhatsApp message with context.forwarded",
    { timeout: 30_000 },
    async () => {
      const { db, repo, port, mockFetch, mockInvestigate } = await setupApp();

      const payload = makeWebhookPayload({
        from: "9876543210",
        messageId: "wamid.fwd456",
        text: "BREAKING: PM Modi announces Rs 5000 for everyone",
        contactName: "Forwarding User",
        forwarded: true,
      });

      const webhookRes = await originalFetch(
        `http://127.0.0.1:${port}/webhook/whatsapp`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      expect(webhookRes.status).toBe(200);

      // Wait for pipeline to be invoked
      await waitFor(() => mockInvestigate.mock.calls.length >= 1);

      // Wait for all API calls to complete
      await waitFor(() => mockFetch.mock.calls.length >= 5, 10_000);

      // Pipeline called with correct text and platform
      expect(mockInvestigate).toHaveBeenCalledOnce();
      const [calledText, calledOptions] = mockInvestigate.mock.calls[0]!;
      expect(calledText).toBe(
        "BREAKING: PM Modi announces Rs 5000 for everyone",
      );
      expect((calledOptions as InvestigateOptions).platform).toBe("whatsapp");
      expect((calledOptions as InvestigateOptions).platformChatId).toBe(
        "9876543210",
      );

      // WhatsApp Cloud API was used for sending responses
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(5);
      for (const call of mockFetch.mock.calls) {
        expect(String(call[0])).toContain("graph.facebook.com");
      }

      // DB record stored with whatsapp platform
      const investigations = repo.getRecent(10);
      expect(investigations.length).toBeGreaterThanOrEqual(1);
      const investigation = investigations[0]!;
      expect(investigation.source_platform).toBe("whatsapp");
      expect(investigation.platform_chat_id).toBe("9876543210");
      expect(investigation.original_message).toBe(
        "BREAKING: PM Modi announces Rs 5000 for everyone",
      );

      db.close();
    },
  );

  it(
    "should reject webhook with invalid verify token",
    { timeout: 30_000 },
    async () => {
      const { db, port } = await setupApp("correct-verify-token");

      // GET with wrong verify token — should return 403
      const badRes = await originalFetch(
        `http://127.0.0.1:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test_challenge`,
      );
      expect(badRes.status).toBe(403);

      // GET with correct verify token — should return 200 with challenge
      const goodRes = await originalFetch(
        `http://127.0.0.1:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=correct-verify-token&hub.challenge=my_challenge`,
      );
      expect(goodRes.status).toBe(200);
      const body = await goodRes.text();
      expect(body).toBe("my_challenge");

      db.close();
    },
  );
});
