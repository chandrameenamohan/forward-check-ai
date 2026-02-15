export interface GitHubIssueServiceConfig {
  token: string;
  owner: string;
  repo: string;
}

export interface CreateIssueParams {
  title: string;
  body: string;
  labels: string[];
}

export interface CreateIssueResult {
  success: boolean;
  issueUrl?: string;
  issueNumber?: number;
  error?: string;
}

export class GitHubIssueService {
  private token: string;
  private owner: string;
  private repo: string;

  constructor(config: GitHubIssueServiceConfig) {
    this.token = config.token;
    this.owner = config.owner;
    this.repo = config.repo;
  }

  async createIssue(params: CreateIssueParams): Promise<CreateIssueResult> {
    const url = `https://api.github.com/repos/${this.owner}/${this.repo}/issues`;

    try {
      const response = await fetch(url, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${this.token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          title: params.title,
          body: params.body,
          labels: params.labels,
        }),
      });

      if (!response.ok) {
        return {
          success: false,
          error: `GitHub API error: ${response.status} ${response.statusText}`,
        };
      }

      const data = (await response.json()) as {
        html_url: string;
        number: number;
      };

      return {
        success: true,
        issueUrl: data.html_url,
        issueNumber: data.number,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: `GitHub API request failed: ${message}`,
      };
    }
  }
}
