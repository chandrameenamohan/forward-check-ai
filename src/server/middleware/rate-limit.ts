import type { Request, Response, NextFunction } from "express";

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

const ipMap = new Map<string, RateLimitEntry>();
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

const CLEANUP_INTERVAL_MS = 60_000;

/**
 * Create rate limiting middleware that restricts each IP to
 * maxRequests per windowMs sliding window.
 */
export function createRateLimiter(
  maxRequests: number,
  windowMs: number,
): (req: Request, res: Response, next: NextFunction) => void {
  // Start stale entry cleanup if not already running
  if (cleanupTimer === null) {
    cleanupTimer = setInterval(() => {
      const now = Date.now();
      for (const [ip, entry] of ipMap) {
        if (now - entry.windowStart > windowMs) {
          ipMap.delete(ip);
        }
      }
    }, CLEANUP_INTERVAL_MS);
    // Allow the process to exit even if the timer is running
    if (cleanupTimer.unref) {
      cleanupTimer.unref();
    }
  }

  return (req: Request, res: Response, next: NextFunction) => {
    const ip = req.ip ?? req.socket.remoteAddress ?? "unknown";
    const now = Date.now();

    const entry = ipMap.get(ip);

    if (!entry || now - entry.windowStart > windowMs) {
      // No entry or window expired — start fresh
      ipMap.set(ip, { count: 1, windowStart: now });
      next();
      return;
    }

    if (entry.count < maxRequests) {
      // Within window and under limit
      entry.count += 1;
      next();
      return;
    }

    // Rate limit exceeded
    const retryAfterSec = Math.ceil((windowMs - (now - entry.windowStart)) / 1000);
    res.setHeader("Retry-After", String(retryAfterSec));
    res.status(429).json({
      error: "Too many requests. Please wait before checking another claim.",
    });
  };
}

/**
 * Clean up rate limiter state. Call in test teardown.
 */
export function cleanupRateLimiter(): void {
  ipMap.clear();
  if (cleanupTimer !== null) {
    clearInterval(cleanupTimer);
    cleanupTimer = null;
  }
}
