# Bug Fix Prompt — ForwardCheck-AI

You are fixing bugs discovered during QA black-box testing of the ForwardCheck-AI project. Follow these instructions precisely.

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly.
2. `IMPLEMENTATION_BUG_FIX.md` — the bug fix task list. Find the first task marked `- [ ]` (not started).
3. `IMPLEMENTATION_PLAN.md` — the main implementation plan (all tasks complete). Reference for understanding what was built.
4. `HACKATHON_PROD_SPEC_OPUS-4-6.md` — the full product spec. Reference for intended behavior.

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_BUG_FIX.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Implement the fix

1. **Read the affected code** — understand the current behavior before changing anything.
2. **Write/update tests first** — add failing tests that reproduce the bug described in the task.
3. **Run the tests** — confirm the new tests fail (red). Command: `npx vitest run`
4. **Fix the code** — minimum change to fix the bug. Do not refactor surrounding code.
5. **Run the tests** — confirm all tests pass (green).

Rules:
- Only modify files relevant to this one task.
- Follow existing code patterns visible in the codebase.
- Do not over-engineer. Minimum fix for the bug.
- If you discover a NEW bug while fixing this one, do NOT fix it now — note it in AGENTS.md.
- **CRITICAL: Do not regress existing tests.** All existing tests must continue passing.

### Code quality gates (MUST pass before proceeding)

- [ ] **No file exceeds 400 lines.** If it does, extract classes/functions into separate files.
- [ ] **No `any` type.** Every variable, parameter, and return value is typed.
- [ ] **No `console.log`.** Use Pino logger.
- [ ] **Test isolation.** Each test is independent. No shared mutable state.
- [ ] **Descriptive test names.** `"should keep likely-false when confidence is 15"`, not `"test1"`.

### Bug fix guidance

**Confidence gate fix (B1):** The core issue is that the Judge outputs confidence as "certainty in verdict" instead of "truthfulness score." Fix the Judge prompt to be explicit. Do NOT change the gate logic — the gate ranges are correct per spec.

**Investigator submit_report fix (B2):** The agents run out of turns before calling submit_report. Increasing max turns helps, but the real fix is a retry mechanism. Extract the shared fallback logic into a helper.

**Log identity fix (B3):** Simple change — map Promise.allSettled indices to role names and include in error logs.

## Step 4: Validate

Run the full test suite:
```bash
cd /Users/ralph/Projects/forward-check-ai && npx vitest run
```

All tests must pass. Also verify:
- `npx tsc --noEmit` passes (no type errors).

## Step 5: Update plan

In `IMPLEMENTATION_BUG_FIX.md`, change the completed task from `- [ ]` to `- [x]`.

## Step 6: Update AGENTS.md

If you discovered any of these during the fix, append them to the appropriate section in `AGENTS.md`:

- **Gotchas:** Surprises, things that didn't work as expected
- **Decisions Log:** Design decisions made and WHY

## Step 7: Commit and push

Commit all changes with a descriptive message referencing the bug number:
```bash
git add -A && git commit -m "Bug B<X.Y>: <short description>"
git push origin $(git branch --show-current)
```

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
