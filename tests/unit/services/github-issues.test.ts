import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockFetch = vi.fn();

describe("GitHubIssueService", () => {
  beforeEach(() => {
    vi.stubGlobal("fetch", mockFetch);
    mockFetch.mockReset();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("should create issue successfully", async () => {
    const { GitHubIssueService } = await import(
      "../../../src/services/github-issues.js"
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          html_url: "https://github.com/owner/repo/issues/42",
          number: 42,
        }),
    });

    const service = new GitHubIssueService({
      token: "ghp_test123",
      owner: "owner",
      repo: "repo",
    });

    const result = await service.createIssue({
      title: "Bug: something is broken",
      body: "Detailed description of the bug",
      labels: ["bug"],
    });

    expect(result.success).toBe(true);
    expect(result.issueUrl).toBe(
      "https://github.com/owner/repo/issues/42",
    );
    expect(result.issueNumber).toBe(42);
    expect(result.error).toBeUndefined();
  });

  it("should return error for non-2xx response", async () => {
    const { GitHubIssueService } = await import(
      "../../../src/services/github-issues.js"
    );

    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      statusText: "Unprocessable Entity",
      json: () =>
        Promise.resolve({
          message: "Validation Failed",
        }),
    });

    const service = new GitHubIssueService({
      token: "ghp_test123",
      owner: "owner",
      repo: "repo",
    });

    const result = await service.createIssue({
      title: "Test issue",
      body: "Test body",
      labels: [],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("422");
    expect(result.issueUrl).toBeUndefined();
    expect(result.issueNumber).toBeUndefined();
  });

  it("should handle network errors gracefully", async () => {
    const { GitHubIssueService } = await import(
      "../../../src/services/github-issues.js"
    );

    mockFetch.mockRejectedValueOnce(new Error("Network failure"));

    const service = new GitHubIssueService({
      token: "ghp_test123",
      owner: "owner",
      repo: "repo",
    });

    const result = await service.createIssue({
      title: "Test issue",
      body: "Test body",
      labels: ["bug"],
    });

    expect(result.success).toBe(false);
    expect(result.error).toContain("Network failure");
    expect(result.issueUrl).toBeUndefined();
    expect(result.issueNumber).toBeUndefined();
  });

  it("should include authorization header", async () => {
    const { GitHubIssueService } = await import(
      "../../../src/services/github-issues.js"
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          html_url: "https://github.com/owner/repo/issues/1",
          number: 1,
        }),
    });

    const service = new GitHubIssueService({
      token: "ghp_mysecrettoken",
      owner: "owner",
      repo: "repo",
    });

    await service.createIssue({
      title: "Test",
      body: "Body",
      labels: [],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [url, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/repos/owner/repo/issues");
    const headers = options.headers as Record<string, string>;
    expect(headers["Authorization"]).toBe("Bearer ghp_mysecrettoken");
    expect(headers["Accept"]).toBe("application/vnd.github+json");
    expect(headers["X-GitHub-Api-Version"]).toBe("2022-11-28");
  });

  it("should send correct labels", async () => {
    const { GitHubIssueService } = await import(
      "../../../src/services/github-issues.js"
    );

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () =>
        Promise.resolve({
          html_url: "https://github.com/owner/repo/issues/5",
          number: 5,
        }),
    });

    const service = new GitHubIssueService({
      token: "ghp_test123",
      owner: "owner",
      repo: "repo",
    });

    await service.createIssue({
      title: "Feature request",
      body: "Please add dark mode",
      labels: ["feature-request", "from-web", "triage"],
    });

    expect(mockFetch).toHaveBeenCalledOnce();
    const [, options] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(options.body as string) as {
      title: string;
      body: string;
      labels: string[];
    };
    expect(body.title).toBe("Feature request");
    expect(body.body).toBe("Please add dark mode");
    expect(body.labels).toEqual(["feature-request", "from-web", "triage"]);
  });
});
