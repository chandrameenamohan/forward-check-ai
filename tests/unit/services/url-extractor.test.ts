import { describe, it, expect } from "vitest";
import { detectUrl } from "../../../src/services/url-extractor.js";

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
