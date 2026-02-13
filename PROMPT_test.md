# Test Prompt — ForwardCheck-AI

You are implementing the SDET test plan for the ForwardCheck-AI project — a Telegram bot that fact-checks forwarded messages using multi-agent AI pipeline with Claude. Follow these instructions precisely.

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly. Pay special attention to:
   - **Architecture Overview** — understand the module map and data flow before writing test code.
   - **Coding Standards** — every line of code you write must comply.
   - **Conventions** — naming, file structure, testing patterns.
   - **Gotchas / Decisions Log** — learn from previous iterations' mistakes and settled decisions.
2. `IMPLEMENTATION_TEST_PLAN.md` — the test task list. Find the first task marked `- [ ]` (not started).
3. `IMPLEMENTATION_PLAN.md` — the main implementation plan (all tasks complete). Reference for understanding what was built and how.
4. `HACKATHON_PROD_SPEC_OPUS-4-6.md` — the full product and technical specification. Reference for architecture, agent design, schemas, pipeline flow.

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_TEST_PLAN.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Implement (TDD)

Follow Test-Driven Development:

1. **Write the test first** (if the task creates tests) — create the test file specified in the task's validation section. Write tests that assert the expected behavior described in the task.
2. **Run the tests** — confirm they fail (red). Command: `npx vitest run`
3. **Write the implementation** — minimum code to make tests pass.
4. **Run the tests** — confirm they pass (green).
5. **Refactor if needed** — clean up without changing behavior. Tests must still pass.

Rules:
- Only modify files relevant to this one task.
- Follow existing code patterns visible in the codebase.
- Do not over-engineer. Minimum viable implementation.
- If you discover something that needs to change in a future task, do NOT fix it now — note it in AGENTS.md.
- **CRITICAL: Do not regress existing tests.** All 326+ existing tests must continue passing after your changes.

### Code quality gates (MUST pass before proceeding)

- [ ] **No file exceeds 400 lines.** If it does, extract classes/functions into separate files.
- [ ] **No `any` type.** Every variable, parameter, and return value is typed.
- [ ] **No `console.log`.** Use Pino logger.
- [ ] **Test isolation.** Each test is independent. No shared mutable state. Integration tests clean up after themselves.
- [ ] **Descriptive test names.** `"should return likely-false when confidence is below 29%"`, not `"test1"`.

### Special task types

**Coverage tasks:** Ensure coverage tooling integrates cleanly with vitest. Verify coverage reports generate without breaking existing test runs.

**Fixture tasks:** When building shared fixtures, validate every factory output against its corresponding Zod schema. When refactoring existing tests to use fixtures, run the full suite after each file change to catch regressions immediately.

**Integration test tasks:** Use in-memory SQLite (`:memory:`) for database-backed tests. Use dynamic port assignment (`server.listen(0)`) to avoid port conflicts. Clean up server handles in `afterAll`.

**Script tasks:** Shell scripts must be POSIX-compatible, use `set -euo pipefail`, and exit non-zero on any failure. Test by intentionally breaking inputs to verify fail-fast behavior.

## Step 4: Validate

Run the full test suite to ensure nothing is broken:
```bash
cd /Users/ralph/Projects/forward-check-ai && npx vitest run
```

All tests must pass before proceeding.

Also verify:
- `npx tsc --noEmit` passes (no type errors).

## Step 5: Update plan

In `IMPLEMENTATION_TEST_PLAN.md`, change the completed task from `- [ ]` to `- [x]`.

## Step 6: Update AGENTS.md

If you discovered any of these during implementation, append them to the appropriate section in `AGENTS.md`:

- **Gotchas:** Surprises, things that didn't work as expected
- **Conventions:** New patterns established
- **Decisions Log:** Design decisions made and WHY
- **Architecture:** If you added a new module, update the module table

This is critical — AGENTS.md is the institutional memory that makes every future iteration smarter.

## Step 7: Commit and push

Commit all changes with a descriptive message referencing the task number:
```bash
git add -A && git commit -m "Task T<X.Y>: <short description>"
git push origin $(git branch --show-current)
```

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
