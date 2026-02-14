import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** A single Brave Search result */
export interface BraveSearchResult {
  title: string;
  url: string;
  description: string;
  age: string;
}

/** Return type of braveWebSearch */
export interface BraveSearchResponse {
  results: BraveSearchResult[];
}

/** Shape of the Brave API web search response */
interface BraveApiResponse {
  web?: {
    results?: Array<{
      title?: string;
      url?: string;
      description?: string;
      age?: string;
    }>;
  };
}

/**
 * Search the web using the Brave Search API.
 *
 * @param query - The search query string
 * @param count - Maximum number of results to return (default 5)
 * @param apiKey - Brave Search API key
 * @returns Formatted search results, or empty results on failure
 */
export async function braveWebSearch(
  query: string,
  count: number = 5,
  apiKey: string,
): Promise<BraveSearchResponse> {
  const url = new URL("https://api.search.brave.com/res/v1/web/search");
  url.searchParams.set("q", query);
  url.searchParams.set("count", String(count));

  try {
    const response = await fetch(url.toString(), {
      headers: {
        "X-Subscription-Token": apiKey,
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, statusText: response.statusText },
        "Brave Search API request failed",
      );
      return { results: [] };
    }

    const data = (await response.json()) as BraveApiResponse;

    const rawResults = data.web?.results ?? [];

    const results: BraveSearchResult[] = rawResults
      .slice(0, count)
      .map((r) => ({
        title: r.title ?? "",
        url: r.url ?? "",
        description: r.description ?? "",
        age: r.age ?? "",
      }));

    return { results };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, "Brave Search request error");
    return { results: [] };
  }
}

/** Claude tool definition for brave_web_search */
export const braveSearchToolDefinition: Tool = {
  name: "brave_web_search",
  description:
    "Search the web using Brave Search. Returns titles, URLs, descriptions, and age of results. Use this to find information about claims, sources, and fact-checks.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The search query to look up",
      },
      count: {
        type: "number",
        description:
          "Maximum number of results to return (default 5, max 20)",
      },
    },
    required: ["query"],
  },
};
