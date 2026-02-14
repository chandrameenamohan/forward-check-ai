import type { FinalVerdict } from "../schemas/final-verdict.js";

/** Cached investigation result */
export interface CacheEntry {
  result: FinalVerdict;
  investigationId: string;
  timestamp: number;
}

/** Default TTL: 1 hour in milliseconds */
const DEFAULT_TTL_MS = 60 * 60 * 1000;

/**
 * Simple in-memory cache for repeated claims.
 * Keys are normalized (lowercase, trimmed, whitespace-collapsed).
 */
export class ClaimCache {
  private cache: Map<string, CacheEntry>;
  private ttlMs: number;

  constructor(ttlMs: number = DEFAULT_TTL_MS) {
    this.cache = new Map();
    this.ttlMs = ttlMs;
  }

  /** Normalize claim text: lowercase, trim, collapse whitespace */
  private normalize(claim: string): string {
    return claim.toLowerCase().trim().replace(/\s+/g, " ");
  }

  /** Store a verdict in the cache */
  set(claim: string, result: FinalVerdict, investigationId: string): void {
    const key = this.normalize(claim);
    this.cache.set(key, {
      result,
      investigationId,
      timestamp: Date.now(),
    });
  }

  /** Retrieve a cached verdict, or null if missing/expired */
  get(claim: string): CacheEntry | null {
    const key = this.normalize(claim);
    const entry = this.cache.get(key);

    if (!entry) {
      return null;
    }

    if (Date.now() - entry.timestamp > this.ttlMs) {
      this.cache.delete(key);
      return null;
    }

    return entry;
  }
}
