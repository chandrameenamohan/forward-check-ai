# Smoke Test Prompt — ForwardCheck-AI

You are running production smoke tests for the ForwardCheck-AI project — a Telegram bot that fact-checks forwarded messages using a multi-agent AI pipeline with Claude. The app is deployed on Railway. Follow these instructions precisely.

## Constants

```
PROD_URL=https://sincere-love-production-ced7.up.railway.app
TELEGRAM_BOT=@forward_check_opus_bot
PROJECT_DIR=/Users/ralph/Projects/forward-check-ai
```

## Step 1: Study context

Read these files before doing anything:

1. `IMPLEMENTATION_SMOKE_PLAN.md` — the smoke test task list. Find the first task marked `- [ ]` (not started).
2. `AGENTS.md` — operational learnings and coding standards. Relevant if you need to fix a bug.

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_SMOKE_PLAN.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Execute the smoke test

Run each step listed in the task sequentially. For each step:

1. Run the command exactly as specified (substitute `$PROD_URL` with the constant above)
2. Capture the output
3. Compare against the expected result
4. If it PASSES — log "PASS" and move to the next step
5. If it FAILS — follow the Fix Protocol below

### Important rules

- **Use curl for all HTTP requests.** Do not use fetch, wget, or other tools.
- **Source .env for secrets:** `source /Users/ralph/Projects/forward-check-ai/.env` when you need `TELEGRAM_BOT_TOKEN` or other env vars.
- **Use Railway CLI for logs:** `railway service logs` to check production logs.
- **Timeouts:** For polling endpoints (like waiting for investigation to complete), poll every 10 seconds with a max timeout of 5 minutes. If it times out, that's a FAIL.
- **Do NOT modify production env vars** unless a fix specifically requires it.
- **Log all outputs.** Print the actual response body or status code for every check so it's visible in the loop log.

### For end-to-end investigation tasks (S2.x)

These submit real claims to the production pipeline and cost Anthropic API credits:
- Use `jq` or `python3 -c "import sys,json; ..."` to parse JSON responses
- When polling, print the status each time so progress is visible
- After completion, extract and log: verdict category, confidence, cost, duration
- These tests may take 2-5 minutes due to the multi-agent pipeline

### For concurrent/stress tests (S4.x)

- Use background subshells with `&` and `wait` to run concurrent requests
- Collect all HTTP status codes and count unique values
- Any 500 response is a FAIL

## Step 4: Handle failures (Fix Protocol)

If any step in the task fails:

1. **Diagnose:** Check Railway logs: `railway service logs 2>&1 | tail -30`
2. **Identify:** Is it a code bug, config issue, or infrastructure problem?
3. **Fix:** If it's a code bug:
   - Edit the source code in `PROJECT_DIR/src/`
   - Run `npx tsc --noEmit` — must pass
   - Run `npx vitest run` — all tests must pass
   - Commit: `git add -A && git commit -m "Smoke fix S<X.Y>: <description>"`
4. **Redeploy:** `cd /Users/ralph/Projects/forward-check-ai && railway up -d`
5. **Wait:** Poll `railway service status` every 10s until `SUCCESS` (timeout 3 min)
6. **Re-verify:** Re-run the failed step
7. If it still fails after one fix attempt, log the failure details and mark the task as failed with notes

## Step 5: Document results

After all steps in the task pass (or are documented as failed), print a summary:

```
═══════════════════════════════════════
SMOKE TEST RESULT: S<X.Y>
═══════════════════════════════════════
Status: PASS / FAIL
Steps passed: X/Y
Failures: <details if any>
Fixes applied: <commits if any>
Notes: <anything noteworthy>
═══════════════════════════════════════
```

## Step 6: Update plan

In `IMPLEMENTATION_SMOKE_PLAN.md`, change the completed task from `- [ ]` to `- [x]`.

## Step 7: Update AGENTS.md (if applicable)

If you discovered bugs and applied fixes, or learned something about production behavior, append to `AGENTS.md`:
- **Gotchas:** Production issues encountered
- **Decisions Log:** Any config or architecture decisions made during fixes

## Step 8: Commit and push

If any files were modified (plan updates, code fixes):
```bash
git add -A && git commit -m "Smoke S<X.Y>: <result summary>"
git push origin $(git branch --show-current)
```

## Step 9: Exit

You are done. Do NOT start another task. Exit immediately after committing.
