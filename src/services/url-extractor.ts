/**
 * URL detection and extraction utilities for ForwardCheck-AI.
 * Detects URLs in user input and extracts article content for fact-checking.
 */

/** Regex to match http/https URLs, excluding email addresses */
const URL_REGEX = /(?<![@\w])https?:\/\/[^\s<>"{}|\\^`[\]]+/g;

/** Characters that commonly trail a URL but aren't part of it */
const TRAILING_PUNCTUATION = /[.,)\]]+$/;

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
