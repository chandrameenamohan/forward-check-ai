import express from "express";
import type { Request, Response, NextFunction } from "express";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create and configure the Express application.
 * Does NOT call app.listen() — that belongs in the entry point.
 */
export function createApp(): express.Express {
  const app = express();

  // JSON body parsing
  app.use(express.json());

  // EJS view engine
  app.set("view engine", "ejs");
  app.set("views", join(__dirname, "views"));

  // Health endpoint
  app.get("/health", (_req: Request, res: Response) => {
    res.json({
      status: "ok",
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    });
  });

  // 404 handler
  app.use((_req: Request, res: Response) => {
    res.status(404).json({ error: "Not found" });
  });

  // Error handling middleware
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    logger.error({ err }, "Unhandled error");
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
