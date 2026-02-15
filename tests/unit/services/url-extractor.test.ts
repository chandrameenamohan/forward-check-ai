import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  detectUrl,
  fetchUrlContent,
  enrichMessageWithUrl,
} from "../../../src/services/url-extractor.js";

describe("detectUrl", () => {
  it("should return null for plain text without URLs", () => {
    expect(detectUrl("PM Modi announced Rs 5000")).toBeNull();
  });

  it("should detect https URL", () => {
    expect(detectUrl("https://example.com/article")).toBe(
      "https://example.com/article",
    );
  });

  it("should detect http URL", () => {
    expect(detectUrl("http://example.com/article")).toBe(
      "http://example.com/article",
    );
  });

  it("should extract URL from mixed text", () => {
    expect(
      detectUrl("Is this true? https://example.com/article check it"),
    ).toBe("https://example.com/article");
  });

  it("should return first URL when multiple present", () => {
    expect(
      detectUrl(
        "Check https://first.com/a and https://second.com/b for info",
      ),
    ).toBe("https://first.com/a");
  });

  it("should not match email addresses", () => {
    expect(detectUrl("Contact user@example.com for info")).toBeNull();
  });

  it("should strip trailing punctuation from URL", () => {
    expect(detectUrl("See https://example.com/article.")).toBe(
      "https://example.com/article",
    );
    expect(detectUrl("See https://example.com/article,")).toBe(
      "https://example.com/article",
    );
    expect(detectUrl("(https://example.com/article)")).toBe(
      "https://example.com/article",
    );
    expect(detectUrl("[https://example.com/article]")).toBe(
      "https://example.com/article",
    );
  });

  it("should handle URLs with query parameters", () => {
    expect(detectUrl("https://example.com/search?q=test&page=1")).toBe(
      "https://example.com/search?q=test&page=1",
    );
  });

  it("should handle URLs with fragments", () => {
    expect(detectUrl("https://example.com/page#section")).toBe(
      "https://example.com/page#section",
    );
  });

  it("should handle URLs with paths and extensions", () => {
    expect(
      detectUrl("https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/"),
    ).toBe("https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/");
  });

  it("should return null for empty string", () => {
    expect(detectUrl("")).toBeNull();
  });

  it("should return null for whitespace only", () => {
    expect(detectUrl("   ")).toBeNull();
  });
});

const SAMPLE_HTML = `
<!DOCTYPE html>
<html>
<head><title>Breaking News: Mars Discovery</title></head>
<body>
  <article>
    <h1>Scientists Discover Water on Mars</h1>
    <p class="byline">By Jane Reporter</p>
    <p>NASA scientists announced today that they have discovered liquid water beneath the surface of Mars. The discovery was made using ground-penetrating radar on the Mars Reconnaissance Orbiter.</p>
    <p>The finding has major implications for the search for extraterrestrial life. "This changes everything," said Dr. Smith, lead researcher on the project.</p>
    <p>The underground lake is estimated to be about 20 kilometers wide and sits about 1.5 kilometers beneath the Martian south pole ice cap.</p>
  </article>
</body>
</html>`;

describe("fetchUrlContent", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return extracted article content", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(SAMPLE_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );

    const result = await fetchUrlContent("https://example.com/mars-article");

    expect(result.url).toBe("https://example.com/mars-article");
    expect(result.title).toBeTruthy();
    expect(result.textContent).toContain("water");
    expect(result.wordCount).toBeGreaterThan(0);
  });

  it("should throw on timeout", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockImplementationOnce(
      () => new Promise((_resolve, reject) => {
        setTimeout(() => reject(new Error("The operation was aborted")), 50);
      }),
    );

    await expect(fetchUrlContent("https://example.com/slow", 50)).rejects.toThrow();
  });

  it("should throw on non-HTML content type", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("PDF content", {
        status: 200,
        headers: { "Content-Type": "application/pdf" },
      }),
    );

    await expect(
      fetchUrlContent("https://example.com/file.pdf"),
    ).rejects.toThrow("non-HTML");
  });

  it("should truncate long articles to 4000 chars", async () => {
    const longArticle = `
    <!DOCTYPE html>
    <html><head><title>Long Article</title></head>
    <body><article><h1>Very Long Article</h1>
    <p>${"This is a very long paragraph that repeats many times to exceed the character limit. ".repeat(100)}</p>
    </article></body></html>`;

    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(longArticle, {
        status: 200,
        headers: { "Content-Type": "text/html" },
      }),
    );

    const result = await fetchUrlContent("https://example.com/long");
    expect(result.textContent.length).toBeLessThanOrEqual(4000);
  });

  it("should handle fetch errors gracefully", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    await expect(
      fetchUrlContent("https://example.com/broken"),
    ).rejects.toThrow();
  });

  it("should throw on non-200 status", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response("Not Found", {
        status: 404,
        headers: { "Content-Type": "text/html" },
      }),
    );

    await expect(
      fetchUrlContent("https://example.com/missing"),
    ).rejects.toThrow("404");
  });
});

describe("enrichMessageWithUrl", () => {
  beforeEach(() => {
    vi.stubGlobal(
      "fetch",
      vi.fn<(input: string | URL | Request, init?: RequestInit) => Promise<Response>>(),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should return null for plain text", async () => {
    const result = await enrichMessageWithUrl("PM Modi announced Rs 5000");
    expect(result).toBeNull();
  });

  it("should return enriched message for URL input", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(SAMPLE_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );

    const result = await enrichMessageWithUrl("https://example.com/mars-article");

    expect(result).not.toBeNull();
    expect(result!.sourceUrl).toBe("https://example.com/mars-article");
    expect(result!.enrichedMessage).toContain("[Article from example.com]");
    expect(result!.enrichedMessage).toContain("Title:");
    expect(result!.enrichedMessage).toContain("Article content:");
  });

  it("should include user commentary alongside article", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockResolvedValueOnce(
      new Response(SAMPLE_HTML, {
        status: 200,
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );

    const result = await enrichMessageWithUrl(
      "Is this true? https://example.com/mars-article I doubt it",
    );

    expect(result).not.toBeNull();
    expect(result!.enrichedMessage).toContain("---");
    expect(result!.enrichedMessage).toContain("Is this true?");
    expect(result!.enrichedMessage).toContain("I doubt it");
  });

  it("should return null when URL fetch fails", async () => {
    const mockFetch = vi.mocked(fetch);
    mockFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await enrichMessageWithUrl("https://broken.example.com/article");
    expect(result).toBeNull();
  });
});
