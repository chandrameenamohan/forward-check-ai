# ForwardCheck-AI — CI/CD & Feedback Pipeline Implementation Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

---

## Phase 0: CI/CD Infrastructure (Pre-completed)

### Task 0.1: Create GitHub workflows, templates, and repo config files
- [x]
**Objective:** Set up CI/CD pipeline, release automation, issue templates, PR template, CODEOWNERS, Dependabot, and security policy.
**Files created:**
- `.github/workflows/ci.yml` — Quality Gate (typecheck, unit tests, 60% coverage)
- `.github/workflows/release.yml` — Release automation (version bump, changelog, GitHub Release)
- `.github/ISSUE_TEMPLATE/bug_report.yml` — Bug report form
- `.github/ISSUE_TEMPLATE/feature_request.yml` — Feature request form
- `.github/ISSUE_TEMPLATE/config.yml` — Issue template config
- `.github/pull_request_template.md` — PR template
- `.github/CODEOWNERS` — `* @chandrameenamohan`
- `.github/dependabot.yml` — Weekly npm + GitHub Actions updates
- `SECURITY.md` — Vulnerability reporting policy

---

## Phase 1: Feedback Pipeline — Environment & Database

### Task 1.1: Add GitHub feedback env vars to config
- [x]
**Objective:** Add optional GitHub integration environment variables to the Zod env schema.
**Details:**
- Modify `src/config/env.ts` — add to `envSchema`:
  - `GITHUB_TOKEN`: `z.string().optional()`
  - `GITHUB_REPO_OWNER`: `z.string().default('chandrameenamohan')`
  - `GITHUB_REPO_NAME`: `z.string().default('forward-check-ai')`
- Update `.env.example` — add new vars with comments at bottom:
  ```
  # Feedback & GitHub Integration (optional)
  GITHUB_TOKEN=ghp_your-fine-grained-pat
  GITHUB_REPO_OWNER=chandrameenamohan
  GITHUB_REPO_NAME=forward-check-ai
  ```
**Validation:**
- Test file: `tests/unit/config/env.test.ts` (update existing)
- Test: `"should use default values for GITHUB_REPO_OWNER and GITHUB_REPO_NAME"`
- Test: `"should accept optional GITHUB_TOKEN"`
- `npx tsc --noEmit` passes
- `npx vitest run` passes

### Task 1.2: Add feedback table migration
- [x]
**Objective:** Add a `feedback` table to the SQLite database for storing user feedback locally.
**Details:**
- Modify `src/db/migrations.ts` — add a second `CREATE TABLE IF NOT EXISTS` statement:
  ```sql
  CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL,
    source_channel TEXT NOT NULL,
    user_agent TEXT,
    telegram_username TEXT,
    telegram_user_id TEXT,
    github_issue_url TEXT,
    github_issue_number INTEGER,
    ip_address TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  )
  ```
**Validation:**
- Test file: `tests/unit/db/migrations.test.ts` (update existing)
- Test: `"should create feedback table with all columns"`
- Test: `"should be idempotent — running twice doesn't error"` (already exists, verify it covers both tables)
- `npx vitest run` passes

### Task 1.3: Create feedback repository
- [x]
**Objective:** Create a repository class for the feedback table following the InvestigationRepository pattern.
**Details:**
- Create `src/db/feedback-repository.ts`
- Class `FeedbackRepository` — constructor takes `Database.Database`
- Uses `nanoid` for IDs
- Methods:
  - `create(params: { type, title, description, sourceChannel, userAgent?, telegramUsername?, telegramUserId?, ipAddress? })` → returns `string` (id)
  - `updateGitHubIssue(id: string, issueUrl: string, issueNumber: number)` → `void`
  - `getById(id: string)` → `Feedback | null`
  - `getRecent(limit: number)` → `Feedback[]`
- Interface `Feedback` with all table columns typed
- Follow same patterns as `src/db/investigation-repository.ts`
**Validation:**
- Test file: `tests/unit/db/feedback-repository.test.ts`
- Test: `"should create feedback and return nanoid"`
- Test: `"should retrieve feedback by id"`
- Test: `"should return null for non-existent id"`
- Test: `"should update GitHub issue fields"`
- Test: `"should list recent feedback"`
- Uses in-memory SQLite, cleanup after each test

---

## Phase 2: Feedback Pipeline — GitHub Service

### Task 2.1: Create GitHub issue service
- [x]
**Objective:** Create a service that creates GitHub issues via the REST API using raw `fetch` (zero new dependencies).
**Details:**
- Create `src/services/github-issues.ts`
- Class `GitHubIssueService` — constructor takes `{ token: string, owner: string, repo: string }`
- Method `createIssue({ title, body, labels })` → `{ success: boolean, issueUrl?: string, issueNumber?: number, error?: string }`
- Uses raw `fetch` to `https://api.github.com/repos/{owner}/{repo}/issues`
- Headers: `Authorization: Bearer {token}`, `Accept: application/vnd.github+json`, `X-GitHub-Api-Version: 2022-11-28`
- **Never throws** — callers check `result.success`
- Handles network errors, non-2xx responses, JSON parse failures
**Validation:**
- Test file: `tests/unit/services/github-issues.test.ts`
- Test: `"should create issue successfully"` (mock global fetch)
- Test: `"should return error for non-2xx response"` (mock fetch with 422)
- Test: `"should handle network errors gracefully"` (mock fetch rejection)
- Test: `"should include authorization header"` (verify fetch was called with correct headers)
- Test: `"should send correct labels"` (verify request body)

---

## Phase 3: Feedback Pipeline — API Route

### Task 3.1: Create feedback API route and page route
- [x]
**Objective:** Create the Express routes for feedback submission and the feedback page.
**Details:**
- Create `src/server/routes/feedback.ts`
- Router factory: `createFeedbackRouter(feedbackRepo: FeedbackRepository, githubService?: GitHubIssueService)`
- Routes:
  - `GET /feedback` — renders `feedback` EJS view
  - `POST /api/feedback` — validates with Zod, saves to DB, creates GitHub issue
- Zod validation schema for POST body:
  ```typescript
  z.object({
    type: z.enum(["bug", "feedback", "feature"]),
    title: z.string().min(5).max(200),
    description: z.string().min(10).max(5000),
  })
  ```
- Response (201): `{ id, status: "created", githubIssueUrl? }`
- Graceful degradation: returns 201 with local ID if GitHub fails or service not provided
- GitHub issue body includes: type badge, title, description, source channel ("web"), IP address, user agent
**Validation:**
- Test file: `tests/unit/server/routes/feedback.test.ts`
- Test: `"POST /api/feedback should create feedback and return 201"`
- Test: `"POST /api/feedback should validate required fields"`
- Test: `"POST /api/feedback should reject title shorter than 5 chars"`
- Test: `"POST /api/feedback should reject description shorter than 10 chars"`
- Test: `"POST /api/feedback should reject invalid type"`
- Test: `"POST /api/feedback should return 201 even when GitHub service is unavailable"`
- Test: `"POST /api/feedback should include githubIssueUrl when GitHub succeeds"`
- Test: `"GET /feedback should return 200"`

---

## Phase 4: Feedback Pipeline — Wiring

### Task 4.1: Wire feedback services into Express app and index.ts
- [x]
**Objective:** Integrate the feedback repository, GitHub issue service, and feedback routes into the application.
**Details:**
- Modify `src/server/app.ts`:
  - Import `createFeedbackRouter` and `FeedbackRepository`, `GitHubIssueService` types
  - Expand `createApp` signature to accept optional `feedbackRepo` and `githubService` params
  - Mount feedback router with rate limiter (5 req / 15 min) using `createRateLimiter(5, 900_000)`
  - Place BEFORE the 404 handler
- Modify `src/index.ts`:
  - Import `FeedbackRepository` and `GitHubIssueService`
  - After investigation repo creation, create `FeedbackRepository(db)`
  - Conditionally create `GitHubIssueService` only when `config.GITHUB_TOKEN` is present
  - Log warning when `GITHUB_TOKEN` absent: `"GITHUB_TOKEN not set — feedback will be saved locally only"`
  - Pass `feedbackRepo` and `githubService` to `createApp()`
**Validation:**
- Existing tests still pass (`tests/unit/server/app.test.ts`)
- Test: `"POST /api/feedback should be rate limited to 5 requests per 15 minutes"` (add to feedback route tests)
- `npx tsc --noEmit` passes
- `npx vitest run` passes

---

## Phase 5: Feedback Pipeline — Frontend

### Task 5.1: Create feedback page UI
- [ ]
**Objective:** Build the `/feedback` page with a form for submitting bugs, feedback, and feature requests.
**Details:**
- Create `src/server/views/feedback.ejs` — full HTML page
- Create `src/server/views/_feedback-styles.ejs` — page-specific CSS
- Page structure:
  - Include `_design-tokens.ejs` for shared theme
  - Topbar: `<nav class="fc-topbar"><a class="fc-topbar-brand" href="/">ForwardCheck</a><a class="fc-topbar-link" href="/">Home</a></nav>`
  - Page title: "Report a Bug or Share Feedback"
  - Type selector: 3 styled radio buttons or segmented control (Bug / Feedback / Feature Request)
  - Title input (5–200 chars)
  - Description textarea (10–5000 chars) with character counter (same pattern as chat.ejs)
  - Submit button: "Submit Feedback"
  - Success state: green confirmation with GitHub issue link (when available)
  - Error state: red message
  - Loading state: spinner during submission
- Client-side JS: form submits via `fetch` to `POST /api/feedback`, handles response states
- Design: match dark theme (`--fc-bg`, `--fc-surface`, `--fc-accent-green`, glass-morphism cards)
- Fonts: Satoshi via Google Fonts CDN, Bootstrap 5.3.3 CDN
- Responsive: works at 375px, 768px, 1440px
- Use `frontend-design` skill for the implementation
**Validation:**
- Start server, navigate to `/feedback`, verify form renders
- Submit feedback, verify success state
- Test: `"GET /feedback should return 200 with form"` (already covered in Task 3.1)
- Visual verification at mobile and desktop widths

---

## Phase 6: Feedback Pipeline — Telegram Commands

### Task 6.1: Add /bug and /feedback Telegram commands
- [ ]
**Objective:** Add Telegram bot commands for submitting bugs and feedback directly from the bot.
**Details:**
- Modify `src/bot/message-handler.ts`:
  - Expand `createMessageHandler` signature:
    ```typescript
    export function createMessageHandler(
      bot: Bot,
      pipeline: InvestigationPipeline,
      baseUrl: string,
      feedbackRepo?: FeedbackRepository,
      githubService?: GitHubIssueService,
    ): void
    ```
  - Add `bot.command('bug', ...)` handler:
    - Extract description from command text (everything after `/bug `)
    - Validate min 10 chars, reply with usage hint if too short
    - Create feedback with `type: "bug"`, `sourceChannel: "telegram"`
    - Include `telegramUsername` and `telegramUserId` from context
    - Create GitHub issue with telegram metadata in body
    - Reply with confirmation + GitHub issue URL (or local-only message if GitHub unavailable)
  - Add `bot.command('feedback', ...)` handler:
    - Same pattern as `/bug` but with `type: "feedback"`
  - Command handlers must be registered BEFORE the `bot.on("message:text", ...)` handler
- Modify `src/index.ts`:
  - Pass `feedbackRepo` and `githubService` to `createMessageHandler()`
**Validation:**
- Test file: `tests/unit/bot/feedback-commands.test.ts`
- Test: `"/bug with valid description should create feedback and reply with issue URL"`
- Test: `"/bug with short description should reply with error message"`
- Test: `"/bug without description should reply with usage hint"`
- Test: `"/feedback with valid description should create feedback"`
- Test: `"/bug should work without GitHub service (local-only)"`
- Mock Grammy context, FeedbackRepository, and GitHubIssueService

---

## Phase 7: Navigation Links & Cleanup

### Task 7.1: Add navigation links to feedback page
- [ ]
**Objective:** Add links to the feedback page from the landing page footer and chat page topbar.
**Details:**
- Modify `src/server/views/landing.ejs`:
  - Add a footer link between the two existing `<p class="fc-footer-line">` elements:
    ```html
    <p class="fc-footer-line"><a href="/feedback" class="fc-footer-link">Report a Bug</a></p>
    ```
  - Add CSS for `.fc-footer-link` in `_landing-styles.ejs`: color `var(--fc-text-muted)`, hover `var(--fc-accent-green)`, underline on hover
- Modify `src/server/views/chat.ejs`:
  - Add feedback link to topbar, after the existing "Home" link:
    ```html
    <a class="fc-topbar-link" href="/feedback">Feedback</a>
    ```
**Validation:**
- Test file: update `tests/unit/server/routes/landing.test.ts`
- Test: `"GET / should contain feedback link in footer"`
- Visually verify links appear and navigate correctly
- `npx vitest run` passes

---

## Phase 8: GitHub Labels & Branch Protection

### Task 8.1: Create GitHub labels via CLI
- [ ]
**Objective:** Create project-specific labels for issue triage and categorization.
**Details:**
- Run `gh label create` commands for:
  - `bug` (#d73a4a), `enhancement` (#a2eeef), `feedback` (#d876e3), `feature-request` (#0075ca)
  - `from-web` (#fbca04), `from-telegram` (#1d76db), `triage` (#e4e669)
  - `agent-pipeline` (#5319e7), `telegram-bot` (#0e8a16), `web-ui` (#006b75)
  - `database` (#bfd4f2), `infrastructure` (#d4c5f9), `ci` (#c5def5), `dependencies` (#0366d6)
  - `priority:high` (#b60205), `priority:medium` (#fbca04), `priority:low` (#0e8a16)
  - `status:wontfix` (#ffffff), `status:duplicate` (#cfd3d7)
- Skip labels that already exist (use `|| true` to ignore errors)
**Validation:**
- Run `gh label list` and verify all labels exist
- No errors during creation

### Task 8.2: Set up branch protection rules via CLI
- [ ]
**Objective:** Configure branch protection for main and develop branches.
**Details:**
- **Main branch** (via `gh api`):
  - Require PRs with 1 approval, dismiss stale reviews
  - Require "Quality Gate" status check (strict — must be up to date)
  - No force push, no deletion
  - Admin bypass for emergencies
- **Develop branch** (lighter):
  - Require "Quality Gate" status check (non-strict)
  - No force push, no deletion
  - Direct push allowed (no PR required)
- Note: branch protection requires the CI workflow to have run at least once on the branch
**Validation:**
- Verify via `gh api repos/{owner}/{repo}/branches/main/protection`
- Attempt force push to main — should be blocked

---

## Dependency Graph

```
Phase 0 (CI/CD Infrastructure) ✓ COMPLETE
  └─→ Phase 1 (Env + Database)
        ├─→ Task 1.1 (Env vars)
        ├─→ Task 1.2 (Feedback migration)
        └─→ Task 1.3 (Feedback repository) ← depends on 1.2
              └─→ Phase 2 (GitHub Service)
                    └─→ Task 2.1 (GitHub issue service)
                          └─→ Phase 3 (API Route)
                                └─→ Task 3.1 (Feedback routes)
                                      └─→ Phase 4 (Wiring)
                                            └─→ Task 4.1 (Wire into app)
                                                  ├─→ Phase 5 (Frontend)
                                                  │     └─→ Task 5.1 (Feedback page UI)
                                                  ├─→ Phase 6 (Telegram Commands)
                                                  │     └─→ Task 6.1 (/bug + /feedback commands)
                                                  └─→ Phase 7 (Nav Links)
                                                        └─→ Task 7.1 (Footer + topbar links)
                                                              └─→ Phase 8 (GitHub Config)
                                                                    ├─→ Task 8.1 (Labels)
                                                                    └─→ Task 8.2 (Branch protection)
```
