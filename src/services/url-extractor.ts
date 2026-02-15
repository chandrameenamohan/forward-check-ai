/**
 * URL detection and extraction utilities for ForwardCheck-AI.
 * Detects URLs in user input and extracts article content for fact-checking.
 */

import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** Regex to match http/https URLs, excluding email addresses */
const URL_REGEX = /(?<![@\w])https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

/** Characters that commonly trail a URL but aren't part of it */
const TRAILING_PUNCTUATION = /[.,)\]]+$/;

/** Max characters to keep from extracted article text */
const MAX_TEXT_LENGTH = 4000;

/** Default timeout for HTTP fetch (ms) */
const DEFAULT_TIMEOUT_MS = 10_000;

/** User-Agent header for HTTP requests */
const USER_AGENT = "ForwardCheck-AI/1.0 (fact-checking bot)";

/** Result of extracting article content from a URL */
export interface UrlExtractionResult {
  url: string;
  title: string;
  byline: string | null;
  excerpt: string | null;
  textContent: string;
  wordCount: number;
  siteName: string | null;
}

/**
 * Detect the first URL in a string. Returns null if no URL is found.
 * Strips trailing punctuation that isn't part of the URL.
 */
export function detectUrl(input: string): string | null {
  const matches = input.match(URL_REGEX);
  if (!matches || matches.length === 0) {
    return null;
  }

  const raw = matches[0] as string;
  const cleaned = raw.replace(TRAILING_PUNCTUATION, "");
  return cleaned;
}

/**
 * Fetch a URL and extract readable article text using Mozilla Readability.
 * Throws typed errors for timeout, non-HTML, fetch failure, or extraction failure.
 */
export async function fetchUrlContent(
  url: string,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<UrlExtractionResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { "User-Agent": USER_AGENT },
      signal: controller.signal,
      redirect: "follow",
    });
  } catch (err) {
    clearTimeout(timer);
    const message = err instanceof Error ? err.message : String(err);
    throw new Error(`URL fetch failed: ${message}`);
  } finally {
    clearTimeout(timer);
  }

  if (!response.ok) {
    throw new Error(`URL fetch failed with status ${response.status} (${response.statusText || response.status})`);
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) {
    throw new Error(`URL returned non-HTML content type: ${contentType}`);
  }

  const html = await response.text();
  const dom = new JSDOM(html, { url });
  const reader = new Readability(dom.window.document);
  const article = reader.parse();

  if (!article) {
    throw new Error("Readability failed to extract article content");
  }

  const rawText = article.textContent ?? "";
  const textContent =
    rawText.length > MAX_TEXT_LENGTH
      ? rawText.slice(0, MAX_TEXT_LENGTH)
      : rawText;

  return {
    url,
    title: article.title ?? "",
    byline: article.byline ?? null,
    excerpt: article.excerpt ?? null,
    textContent,
    wordCount: textContent.split(/\s+/).filter(Boolean).length,
    siteName: article.siteName ?? null,
  };
}

/**
 * Detect a URL in the message, fetch and extract article content,
 * and compose an enriched message for the Classifier.
 * Returns null if no URL found or if extraction fails.
 */
export async function enrichMessageWithUrl(
  message: string,
): Promise<{ enrichedMessage: string; sourceUrl: string } | null> {
  const url = detectUrl(message);
  if (!url) {
    return null;
  }

  let extraction: UrlExtractionResult;
  try {
    extraction = await fetchUrlContent(url);
  } catch (err) {
    const errMsg = err instanceof Error ? err.message : String(err);
    logger.warn({ url, error: errMsg }, "URL extraction failed, falling back to raw message");
    return null;
  }

  const domain = new URL(url).hostname;
  const parts: string[] = [];

  parts.push(`[Article from ${domain}]`);
  parts.push(`Title: ${extraction.title}`);
  if (extraction.byline) {
    parts.push(extraction.byline);
  }
  parts.push("");
  parts.push("Article content:");
  parts.push(extraction.textContent);

  // Include user's original text (minus the URL) if there is any
  const userText = message.replace(url, "").trim();
  if (userText) {
    parts.push("");
    parts.push("---");
    parts.push(userText);
  }

  return {
    enrichedMessage: parts.join("\n"),
    sourceUrl: url,
  };
}
