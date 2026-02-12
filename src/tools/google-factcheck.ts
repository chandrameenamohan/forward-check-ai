import type { Tool } from "@anthropic-ai/sdk/resources/messages/messages.js";
import { createLogger } from "../config/logger.js";

const logger = createLogger({ level: "info" });

/** A single fact-check claim with review markup */
export interface FactCheckClaim {
  text: string;
  claimant: string;
  claimReviewMarkup: {
    url: string;
    title: string;
    publisher: string;
    rating: string;
  };
}

/** Return type of googleFactCheckSearch */
export interface GoogleFactCheckResponse {
  claims: FactCheckClaim[];
}

/** Shape of the Google Fact Check API response */
interface GoogleFactCheckApiResponse {
  claims?: Array<{
    text?: string;
    claimant?: string;
    claimReview?: Array<{
      url?: string;
      title?: string;
      publisher?: { name?: string };
      textualRating?: string;
      languageCode?: string;
    }>;
  }>;
}

/**
 * Search for existing fact-checks using the Google Fact Check Tools API.
 *
 * @param query - The claim text to search for
 * @param apiKey - Google API key
 * @returns Matching fact-check claims, or empty claims on failure
 */
export async function googleFactCheckSearch(
  query: string,
  apiKey: string,
): Promise<GoogleFactCheckResponse> {
  const url = new URL(
    "https://factchecktools.googleapis.com/v1alpha1/claims:search",
  );
  url.searchParams.set("query", query);
  url.searchParams.set("key", apiKey);

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Accept: "application/json",
      },
    });

    if (!response.ok) {
      logger.error(
        { status: response.status, statusText: response.statusText },
        "Google Fact Check API request failed",
      );
      return { claims: [] };
    }

    const data = (await response.json()) as GoogleFactCheckApiResponse;

    const rawClaims = data.claims ?? [];

    const claims: FactCheckClaim[] = rawClaims
      .filter(
        (c) =>
          c.claimReview !== undefined &&
          c.claimReview !== null &&
          c.claimReview.length > 0,
      )
      .map((c) => {
        const review = c.claimReview![0]!;
        return {
          text: c.text ?? "",
          claimant: c.claimant ?? "",
          claimReviewMarkup: {
            url: review.url ?? "",
            title: review.title ?? "",
            publisher: review.publisher?.name ?? "",
            rating: review.textualRating ?? "",
          },
        };
      });

    return { claims };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, "Google Fact Check request error");
    return { claims: [] };
  }
}

/** Claude tool definition for google_fact_check_search */
export const googleFactCheckToolDefinition: Tool = {
  name: "google_fact_check_search",
  description:
    "Search for existing fact-checks from organizations like Snopes, PolitiFact, and others using the Google Fact Check Tools API. Returns matching claims with their ratings and review URLs.",
  input_schema: {
    type: "object" as const,
    properties: {
      query: {
        type: "string",
        description: "The claim text to search for existing fact-checks",
      },
    },
    required: ["query"],
  },
};
