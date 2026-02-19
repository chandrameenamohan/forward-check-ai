import type { InvestigationPipeline } from "../orchestrator/pipeline.js";
import type { InvestigationRepository } from "../db/investigation-repository.js";
import type { PlatformMessage, PlatformResponder } from "./types.js";
import { detectUrl } from "../services/url-extractor.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** Maximum time (ms) to wait for the pipeline before timing out. */
const PIPELINE_TIMEOUT_MS = 300_000;

export interface MessageRouter {
  route(message: PlatformMessage, responder: PlatformResponder): Promise<void>;
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      reject(new Error(`${label} timed out after ${ms / 1000}s`));
    }, ms);

    promise.then(
      (value) => { clearTimeout(timer); resolve(value); },
      (err: unknown) => { clearTimeout(timer); reject(err); },
    );
  });
}

/**
 * Creates a MessageRouter that receives a PlatformMessage + PlatformResponder
 * pair, runs the pipeline, and sends responses back through the responder.
 *
 * This is the shared routing logic used by all platform adapters.
 */
export function createMessageRouter(
  pipeline: InvestigationPipeline,
  repo: InvestigationRepository,
  baseUrl: string,
): MessageRouter {
  return {
    async route(message: PlatformMessage, responder: PlatformResponder): Promise<void> {
      const chatId = message.chatId;

      logger.info(
        { chatId, platform: message.platform, isForwarded: message.isForwarded },
        message.isForwarded ? "Received forwarded message" : "Received direct text message",
      );

      // Detect URL in message
      const detectedUrl = detectUrl(message.text);
      if (detectedUrl) {
        logger.info({ url: detectedUrl, chatId }, "URL detected in message");
        await responder.sendText(chatId, "🔗 Reading article...");
      }

      // Send initial status
      await responder.sendInitial(chatId);

      let investigationId: string | undefined;

      try {
        const pipelinePromise = pipeline.investigate(message.text, {
          platform: message.platform,
          platformChatId: chatId,
          platformMessageId: message.messageId,
          onStatusUpdate: (stage) => responder.sendStatusUpdate(chatId, stage),
          onInvestigationCreated: async (id) => {
            investigationId = id;
            const liveUrl = `${baseUrl}/live/${id}`;
            await responder.sendLink(chatId, "Watch Live Investigation", liveUrl);
          },
        });

        const result = await withTimeout(pipelinePromise, PIPELINE_TIMEOUT_MS, "Investigation pipeline");

        if (result.nonFactualResponse) {
          await responder.sendText(chatId, result.nonFactualResponse);
          return;
        }

        if (result.verdict) {
          const analysisUrl = `${baseUrl}/v/${result.investigationId}`;
          await responder.sendVerdict(chatId, result.verdict, analysisUrl);
        }
      } catch (err: unknown) {
        const errMsg = err instanceof Error ? err.message : String(err);
        logger.error({ err: errMsg, chatId, investigationId }, "Pipeline failed for message");

        if (investigationId) {
          try {
            repo.updateStatus(investigationId, "failed");
          } catch (dbErr) {
            logger.error({ dbErr, investigationId }, "Failed to mark investigation as failed");
          }
        }

        const isTimeout = errMsg.includes("timed out");
        const userMessage = isTimeout
          ? "Sorry, this investigation is taking longer than expected. Please try again — some claims require more time."
          : "Sorry, an error occurred while investigating your claim. Please try again later.";

        await responder.sendText(chatId, userMessage);
      }
    },
  };
}
