import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  googleFactCheckSearch,
  googleFactCheckToolDefinition,
  type FactCheckClaim,
} from "../../../src/tools/google-factcheck.js";

/**
 * Mock global fetch for HTTP request testing.
 */
const mockFetch = vi.fn();

describe("googleFactCheckSearch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return formatted fact-check claims", async () => {
    const mockApiResponse = {
      claims: [
        {
          text: "Earth is flat",
          claimant: "Social media post",
          claimReview: [
            {
              url: "https://factcheck.org/flat-earth",
              title: "Fact Check: Earth is not flat",
              publisher: { name: "FactCheck.org" },
              textualRating: "False",
              languageCode: "en",
            },
          ],
        },
        {
          text: "Vaccines cause autism",
          claimant: "Blog post",
          claimReview: [
            {
              url: "https://snopes.com/vaccines-autism",
              title: "Vaccines Do Not Cause Autism",
              publisher: { name: "Snopes" },
              textualRating: "False",
              languageCode: "en",
            },
          ],
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const result = await googleFactCheckSearch("flat earth", "test-api-key");

    expect(result.claims).toHaveLength(2);
    expect(result.claims[0]).toEqual({
      text: "Earth is flat",
      claimant: "Social media post",
      claimReviewMarkup: {
        url: "https://factcheck.org/flat-earth",
        title: "Fact Check: Earth is not flat",
        publisher: "FactCheck.org",
        rating: "False",
      },
    });
    expect(result.claims[1]).toEqual({
      text: "Vaccines cause autism",
      claimant: "Blog post",
      claimReviewMarkup: {
        url: "https://snopes.com/vaccines-autism",
        title: "Vaccines Do Not Cause Autism",
        publisher: "Snopes",
        rating: "False",
      },
    });

    // Verify fetch was called with correct URL and key
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain(
      "https://factchecktools.googleapis.com/v1alpha1/claims:search",
    );
    expect(url).toContain("query=flat+earth");
    expect(url).toContain("key=test-api-key");
  });

  it("should handle API errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 403,
      statusText: "Forbidden",
    });

    const result = await googleFactCheckSearch("test query", "bad-key");

    expect(result.claims).toHaveLength(0);
  });

  it("should handle network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await googleFactCheckSearch("test query", "test-key");

    expect(result.claims).toHaveLength(0);
  });

  it("should handle missing claims in response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await googleFactCheckSearch("obscure query", "test-key");

    expect(result.claims).toHaveLength(0);
  });

  it("should handle claims with missing claimReview", async () => {
    const mockApiResponse = {
      claims: [
        {
          text: "Some claim without reviews",
          claimant: "Unknown",
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const result = await googleFactCheckSearch("some claim", "test-key");

    // Claims without reviews should be skipped
    expect(result.claims).toHaveLength(0);
  });

  it("should use the first claimReview when multiple exist", async () => {
    const mockApiResponse = {
      claims: [
        {
          text: "A debated claim",
          claimant: "Various sources",
          claimReview: [
            {
              url: "https://first-review.com",
              title: "First Review",
              publisher: { name: "First Publisher" },
              textualRating: "Mostly False",
              languageCode: "en",
            },
            {
              url: "https://second-review.com",
              title: "Second Review",
              publisher: { name: "Second Publisher" },
              textualRating: "False",
              languageCode: "en",
            },
          ],
        },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const result = await googleFactCheckSearch("debated claim", "test-key");

    expect(result.claims).toHaveLength(1);
    expect(result.claims[0]?.claimReviewMarkup.publisher).toBe(
      "First Publisher",
    );
    expect(result.claims[0]?.claimReviewMarkup.rating).toBe("Mostly False");
  });
});

describe("googleFactCheckToolDefinition", () => {
  it("should export valid Claude tool definition", () => {
    expect(googleFactCheckToolDefinition).toBeDefined();
    expect(googleFactCheckToolDefinition.name).toBe(
      "google_fact_check_search",
    );
    expect(googleFactCheckToolDefinition.description).toBeTruthy();
    expect(googleFactCheckToolDefinition.input_schema).toBeDefined();
    expect(googleFactCheckToolDefinition.input_schema.type).toBe("object");
    expect(
      googleFactCheckToolDefinition.input_schema.properties,
    ).toHaveProperty("query");
    expect(googleFactCheckToolDefinition.input_schema.required).toContain(
      "query",
    );
  });
});
