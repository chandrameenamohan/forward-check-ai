import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  braveWebSearch,
  braveSearchToolDefinition,
  type BraveSearchResult,
} from "../../../src/tools/brave-search.js";

/**
 * Mock global fetch for HTTP request testing.
 */
const mockFetch = vi.fn();

describe("braveWebSearch", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should return formatted search results", async () => {
    const mockApiResponse = {
      web: {
        results: [
          {
            title: "Test Article",
            url: "https://example.com/article",
            description: "A test article about testing",
            age: "2 days ago",
          },
          {
            title: "Another Article",
            url: "https://example.com/another",
            description: "Another test article",
            age: "1 week ago",
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const result = await braveWebSearch("test query", 5, "test-brave-key");

    expect(result.results).toHaveLength(2);
    expect(result.results[0]).toEqual({
      title: "Test Article",
      url: "https://example.com/article",
      description: "A test article about testing",
      age: "2 days ago",
    });
    expect(result.results[1]).toEqual({
      title: "Another Article",
      url: "https://example.com/another",
      description: "Another test article",
      age: "1 week ago",
    });

    // Verify fetch was called with correct URL and headers
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toContain("https://api.search.brave.com/res/v1/web/search");
    expect(url).toContain("q=test+query");
    expect(url).toContain("count=5");
    expect(options.headers).toEqual(
      expect.objectContaining({
        "X-Subscription-Token": "test-brave-key",
      }),
    );
  });

  it("should handle API errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
      statusText: "Too Many Requests",
    });

    const result = await braveWebSearch("test query", 5, "test-brave-key");

    expect(result.results).toHaveLength(0);
  });

  it("should handle network errors gracefully", async () => {
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await braveWebSearch("test query", 5, "test-brave-key");

    expect(result.results).toHaveLength(0);
  });

  it("should limit results to specified count", async () => {
    const mockApiResponse = {
      web: {
        results: [
          {
            title: "Result 1",
            url: "https://example.com/1",
            description: "First",
            age: "1d",
          },
          {
            title: "Result 2",
            url: "https://example.com/2",
            description: "Second",
            age: "2d",
          },
          {
            title: "Result 3",
            url: "https://example.com/3",
            description: "Third",
            age: "3d",
          },
        ],
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve(mockApiResponse),
    });

    const result = await braveWebSearch("test", 2, "test-brave-key");

    // The count parameter is sent to the API, but we also enforce it locally
    expect(result.results.length).toBeLessThanOrEqual(2);

    // Verify the count was passed in the URL
    const [url] = mockFetch.mock.calls[0] as [string];
    expect(url).toContain("count=2");
  });

  it("should handle missing web results in response", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({}),
    });

    const result = await braveWebSearch("test", 5, "test-brave-key");

    expect(result.results).toHaveLength(0);
  });

  it("should handle empty results array", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ web: { results: [] } }),
    });

    const result = await braveWebSearch("empty query", 5, "test-brave-key");

    expect(result.results).toHaveLength(0);
  });
});

describe("braveSearchToolDefinition", () => {
  it("should export valid Claude tool definition", () => {
    expect(braveSearchToolDefinition).toBeDefined();
    expect(braveSearchToolDefinition.name).toBe("brave_web_search");
    expect(braveSearchToolDefinition.description).toBeTruthy();
    expect(braveSearchToolDefinition.input_schema).toBeDefined();
    expect(braveSearchToolDefinition.input_schema.type).toBe("object");
    expect(braveSearchToolDefinition.input_schema.properties).toHaveProperty(
      "query",
    );
    expect(braveSearchToolDefinition.input_schema.required).toContain("query");
  });
});
