import { describe, it, expect, afterEach, vi } from "vitest";
import { createApp } from "../../../src/server/app.js";
import type { Server } from "node:http";
import type { WhatsAppAdapter } from "../../../src/platforms/whatsapp/adapter.js";
import { Router } from "express";
import type { Request, Response } from "express";

describe("Express server — WhatsApp webhook mounting", () => {
  let server: Server | undefined;

  afterEach(() => {
    if (server) {
      server.close();
      server = undefined;
    }
  });

  function startServer(whatsAppAdapter?: WhatsAppAdapter): Promise<number> {
    return new Promise((resolve) => {
      const app = createApp(
        undefined, // repo
        undefined, // eventBus
        undefined, // pipeline
        undefined, // feedbackRepo
        undefined, // githubService
        undefined, // telegramBotUsername
        whatsAppAdapter,
      );
      server = app.listen(0, () => {
        const addr = server!.address();
        if (typeof addr === "object" && addr !== null) {
          resolve(addr.port);
        }
      });
    });
  }

  it("GET /webhook/whatsapp should return 404 when WhatsApp not configured", async () => {
    const port = await startServer(); // no WhatsApp adapter
    const res = await fetch(`http://127.0.0.1:${port}/webhook/whatsapp`);

    expect(res.status).toBe(404);
  });

  it("GET /webhook/whatsapp should handle verification when WhatsApp configured", async () => {
    const verifyToken = "test-verify-token-123";

    // Create a mock WhatsApp adapter whose getWebhookRouter returns real routes
    const webhookRouter = Router();
    webhookRouter.get("/webhook/whatsapp", (req: Request, res: Response) => {
      const mode = req.query["hub.mode"];
      const token = req.query["hub.verify_token"];
      const challenge = req.query["hub.challenge"];

      if (mode === "subscribe" && token === verifyToken) {
        res.status(200).send(challenge);
        return;
      }
      res.sendStatus(403);
    });

    const mockAdapter = {
      platform: "whatsapp" as const,
      getWebhookRouter: vi.fn().mockReturnValue(webhookRouter),
      handleMessage: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as WhatsAppAdapter;

    const port = await startServer(mockAdapter);

    // Valid verification request
    const url = `http://127.0.0.1:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=${verifyToken}&hub.challenge=test_challenge_string`;
    const res = await fetch(url);

    expect(res.status).toBe(200);
    const body = await res.text();
    expect(body).toBe("test_challenge_string");
    expect(mockAdapter.getWebhookRouter).toHaveBeenCalled();
  });

  it("GET /webhook/whatsapp should return 403 for invalid verify token when configured", async () => {
    const webhookRouter = Router();
    webhookRouter.get("/webhook/whatsapp", (_req: Request, res: Response) => {
      res.sendStatus(403);
    });

    const mockAdapter = {
      platform: "whatsapp" as const,
      getWebhookRouter: vi.fn().mockReturnValue(webhookRouter),
      handleMessage: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as WhatsAppAdapter;

    const port = await startServer(mockAdapter);

    const url = `http://127.0.0.1:${port}/webhook/whatsapp?hub.mode=subscribe&hub.verify_token=wrong-token&hub.challenge=test`;
    const res = await fetch(url);

    expect(res.status).toBe(403);
  });

  it("should not break existing routes when WhatsApp is configured", async () => {
    const webhookRouter = Router();
    webhookRouter.get("/webhook/whatsapp", (_req: Request, res: Response) => {
      res.sendStatus(200);
    });

    const mockAdapter = {
      platform: "whatsapp" as const,
      getWebhookRouter: vi.fn().mockReturnValue(webhookRouter),
      handleMessage: vi.fn(),
      start: vi.fn(),
      stop: vi.fn(),
    } as unknown as WhatsAppAdapter;

    const port = await startServer(mockAdapter);

    // Health endpoint should still work
    const healthRes = await fetch(`http://127.0.0.1:${port}/health`);
    expect(healthRes.status).toBe(200);
    const healthBody = await healthRes.json();
    expect(healthBody.status).toBe("ok");

    // 404 for unknown routes should still work
    const unknownRes = await fetch(`http://127.0.0.1:${port}/unknown`);
    expect(unknownRes.status).toBe(404);
  });
});
