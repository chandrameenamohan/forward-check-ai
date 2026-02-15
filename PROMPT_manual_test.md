# Manual Test Prompt — CI/CD & Feedback Pipeline

You are testing the newly implemented CI/CD infrastructure and feedback pipeline for ForwardCheck-AI. Run through every test below and report pass/fail for each.

## Project Context

- **Working directory:** `/Users/ralph/Projects/forward-check-ai`
- **Branch:** `feature/feedback-pipeline` (should already be checked out)
- **Stack:** TypeScript (strict ESM), Node.js 20+, Express 5, better-sqlite3, Grammy, Zod
- **Remote:** `git@github.com:chandrameenamohan/forward-check-ai.git`
- **Feature:** 3-channel feedback pipeline (Web UI, Telegram bot, GitHub Issues) + CI/CD infrastructure

## Pre-flight Checks

Before testing, run these commands and verify they pass:

```bash
npx tsc --noEmit          # TypeScript compiles cleanly
npx vitest run            # All unit tests pass
npx vitest run --coverage # Coverage report generates
```

Report the number of tests passed/failed/skipped and the coverage percentage.

---

## Test 1: CI/CD Files Exist

Verify all 9 CI/CD infrastructure files exist with correct content:

| File | Check |
|------|-------|
| `.github/workflows/ci.yml` | Has "Quality Gate" job, triggers on push to main/develop, runs typecheck + vitest |
| `.github/workflows/release.yml` | Has workflow_dispatch trigger with bump input (patch/minor/major), guards on main |
| `.github/ISSUE_TEMPLATE/bug_report.yml` | Has component dropdown, description, reproduction steps fields |
| `.github/ISSUE_TEMPLATE/feature_request.yml` | Has problem, proposed solution, component, alternatives fields |
| `.github/ISSUE_TEMPLATE/config.yml` | Has blank_issues_enabled and contact_links to /feedback |
| `.github/pull_request_template.md` | Has summary, changes, type checkboxes, testing checklist |
| `.github/CODEOWNERS` | Contains `* @chandrameenamohan` |
| `.github/dependabot.yml` | Has npm + github-actions ecosystems, weekly schedule |
| `SECURITY.md` | Has vulnerability reporting instructions |

---

## Test 2: Environment Config

Verify `src/config/env.ts` has the new optional env vars:

```bash
grep -n "GITHUB_TOKEN" src/config/env.ts
grep -n "GITHUB_REPO_OWNER" src/config/env.ts
grep -n "GITHUB_REPO_NAME" src/config/env.ts
```

All three should appear in the Zod schema. `GITHUB_TOKEN` should be optional. `GITHUB_REPO_OWNER` should default to `chandrameenamohan`. `GITHUB_REPO_NAME` should default to `forward-check-ai`.

Also verify `.env.example` documents these vars.

---

## Test 3: Database Migration

Verify the feedback table exists in the migration:

```bash
grep -A 15 "feedback" src/db/migrations.ts
```

Should show `CREATE TABLE IF NOT EXISTS feedback` with columns: id, type, title, description, source_channel, user_agent, telegram_username, telegram_user_id, github_issue_url, github_issue_number, ip_address, created_at.

---

## Test 4: Feedback Repository

Verify `src/db/feedback-repository.ts` exists and has:
- `FeedbackRepository` class
- `create()` method that accepts `{ type, title, description, sourceChannel, ... }`
- `updateGitHubIssue()` method
- `getById()` method
- `getRecent()` method
- Uses `nanoid` for IDs

Check its test file exists: `tests/unit/db/feedback-repository.test.ts`

---

## Test 5: GitHub Issue Service

Verify `src/services/github-issues.ts` exists and has:
- `GitHubIssueService` class
- Constructor takes `{ token, owner, repo }`
- `createIssue()` method that returns `{ success, issueUrl?, issueNumber?, error? }`
- Uses raw `fetch` (not Octokit)
- Never throws

Check its test file exists: `tests/unit/services/github-issues.test.ts`

---

## Test 6: Feedback API Route

Verify `src/server/routes/feedback.ts` exists and has:
- `createFeedbackRouter()` factory function
- `GET /feedback` route (renders EJS view)
- `POST /api/feedback` route with Zod validation
- Accepts `{ type: "bug"|"feedback"|"feature", title: string, description: string }`
- Returns 201 with `{ id, status: "created", githubIssueUrl? }`

Check its test file exists: `tests/unit/server/routes/feedback.test.ts`

---

## Test 7: App Wiring

Verify `src/server/app.ts` accepts feedback params:

```bash
grep -n "feedbackRepo\|FeedbackRepository\|githubService\|GitHubIssueService\|createFeedbackRouter" src/server/app.ts
```

Should show imports and the feedback router being mounted.

Verify `src/index.ts` wires the services:

```bash
grep -n "FeedbackRepository\|GitHubIssueService\|feedbackRepo\|githubService\|GITHUB_TOKEN" src/index.ts
```

Should show conditional creation of GitHubIssueService and passing to createApp.

---

## Test 8: Feedback Page UI (Manual Browser Test)

Start the dev server:

```bash
npx tsx src/index.ts
```

Then test in browser:

1. **Navigate to `http://localhost:3000/feedback`**
   - [ ] Page loads without errors
   - [ ] Dark theme matches rest of site (dark background, green accents)
   - [ ] Topbar shows "ForwardCheck" brand linking to `/` and "Home" link
   - [ ] Type selector shows 3 options: Bug / Feedback / Feature Request
   - [ ] Title input field present (5-200 chars)
   - [ ] Description textarea present (10-5000 chars) with character counter
   - [ ] Submit button present

2. **Test form validation**
   - [ ] Submit with empty fields — should show validation error
   - [ ] Submit with title < 5 chars — should show error
   - [ ] Submit with description < 10 chars — should show error

3. **Test successful submission (without GITHUB_TOKEN)**
   - [ ] Fill valid form: type=bug, title="Test bug report", description="This is a test bug report for manual testing purposes"
   - [ ] Click submit
   - [ ] Should show success state with local feedback ID
   - [ ] Should NOT show GitHub issue URL (since no GITHUB_TOKEN set)

4. **Test via curl**
   ```bash
   curl -X POST http://localhost:3000/api/feedback \
     -H "Content-Type: application/json" \
     -d '{"type":"bug","title":"Test from curl","description":"This is a manual test of the feedback API endpoint"}'
   ```
   - [ ] Returns 201 with `{ id, status: "created" }`

5. **Test rate limiting**
   ```bash
   for i in {1..6}; do
     echo "Request $i:"
     curl -s -o /dev/null -w "%{http_code}" -X POST http://localhost:3000/api/feedback \
       -H "Content-Type: application/json" \
       -d '{"type":"feedback","title":"Rate limit test '$i'","description":"Testing rate limiting on the feedback endpoint attempt '$i'"}'
     echo ""
   done
   ```
   - [ ] First 5 requests return 201
   - [ ] 6th request returns 429 (rate limited)

---

## Test 9: Telegram Bot Commands

If the bot is running (requires TELEGRAM_BOT_TOKEN in .env), test in Telegram:

1. Send `/bug This is a test bug report from Telegram`
   - [ ] Bot replies with confirmation message
   - [ ] If GITHUB_TOKEN set: reply includes GitHub issue URL
   - [ ] If no GITHUB_TOKEN: reply confirms saved locally

2. Send `/feedback Great tool, love the real-time investigation view`
   - [ ] Bot replies with confirmation message

3. Send `/bug short`
   - [ ] Bot replies with error about minimum length (10 chars)

4. Send `/bug` (no description)
   - [ ] Bot replies with usage hint

---

## Test 10: Navigation Links

1. **Landing page (`http://localhost:3000/`)**
   - [ ] Footer contains "Report a Bug" link pointing to `/feedback`
   - [ ] Link is styled (muted color, green on hover)

2. **Chat page (`http://localhost:3000/chat`)**
   - [ ] Topbar contains "Feedback" link pointing to `/feedback`
   - [ ] Link sits next to "Home" link

---

## Test 11: GitHub Labels (requires `gh` CLI authenticated)

```bash
gh label list --repo chandrameenamohan/forward-check-ai
```

Verify these labels exist:
- bug, enhancement, feedback, feature-request
- from-web, from-telegram, triage
- agent-pipeline, telegram-bot, web-ui, database, infrastructure, ci, dependencies
- priority:high, priority:medium, priority:low
- status:wontfix, status:duplicate

---

## Test 12: Branch Protection (requires repo admin access)

```bash
gh api repos/chandrameenamohan/forward-check-ai/branches/main/protection 2>/dev/null | head -5
```

- [ ] Main branch has protection rules enabled
- [ ] Requires pull request reviews
- [ ] Requires status checks ("Quality Gate")

---

## Test 13: Graceful Degradation

Without `GITHUB_TOKEN` in .env:

1. Start server: `npx tsx src/index.ts`
   - [ ] Server starts without errors
   - [ ] Log shows warning about GITHUB_TOKEN not being set

2. Submit feedback via web:
   - [ ] Returns 201 (not 500)
   - [ ] Response has `id` and `status: "created"`
   - [ ] No `githubIssueUrl` in response (expected)

3. Submit feedback via Telegram `/bug`:
   - [ ] Bot replies with confirmation (saved locally)
   - [ ] No crash or error

---

## Test 14: Database Persistence

After submitting feedback via web and/or Telegram:

```bash
sqlite3 data/forwardcheck.db "SELECT id, type, title, source_channel, github_issue_url FROM feedback ORDER BY created_at DESC LIMIT 5;"
```

- [ ] Shows feedback rows with correct type, title, and source_channel
- [ ] `source_channel` is "web" for web submissions, "telegram" for bot submissions
- [ ] `github_issue_url` is NULL when GITHUB_TOKEN not set

---

## Summary

Report results as:
```
PASS: X/14
FAIL: Y/14
SKIP: Z/14 (reason)
```

For any failures, describe what went wrong and suggest fixes.
