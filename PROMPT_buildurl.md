# Build Prompt — ForwardCheck-AI URL Investigation Feature

You are implementing URL investigation support for the ForwardCheck-AI project — allowing users to submit news article URLs for fact-checking. The system fetches article content, extracts claims, and runs the existing 6-agent pipeline. Follow these instructions precisely.

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly. Pay special attention to:
   - **Architecture Overview** — understand the module map and data flow before writing code.
   - **Coding Standards** — every line of code you write must comply.
   - **Conventions** — naming, file structure, testing patterns.
   - **Gotchas / Decisions Log** — learn from previous iterations' mistakes and settled decisions.
2. `IMPLEMENTATION_PLAN_URL.md` — the task list for URL support. Find the first task marked `- [ ]` (not started).
3. `HACKATHON_PROD_SPEC_OPUS-4-6.md` — the full product and technical specification. Reference for architecture, agent design, schemas, pipeline flow.
4. `ARCHITECTURE.md` — system architecture diagrams and data flow.

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_PLAN_URL.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Implement (TDD)

Follow Test-Driven Development:

1. **Write the test first** — create the test file specified in the task's validation section. Write tests that assert the expected behavior described in the task.
2. **Run the tests** — confirm they fail (red). Command: `npx vitest run`
3. **Write the implementation** — minimum code to make tests pass.
4. **Run the tests** — confirm they pass (green).
5. **Refactor if needed** — clean up without changing behavior. Tests must still pass.

Rules:
- Only modify files relevant to this one task.
- Follow existing code patterns visible in the codebase.
- Do not over-engineer. Minimum viable implementation.
- If you discover something that needs to change in a future task, do NOT fix it now — note it in AGENTS.md.
- **CRITICAL: Do NOT break existing functionality.** The text-only pipeline must continue to work exactly as before. All existing 575+ tests must pass.

### Code quality gates (MUST pass before proceeding)

- [ ] **No file exceeds 400 lines.** If it does, extract classes/functions into separate files.
- [ ] **No `any` type.** Every variable, parameter, and return value is typed.
- [ ] **No `console.log`.** Use Pino logger.
- [ ] **Test isolation.** Each test is independent. No shared mutable state. Integration tests clean up after themselves.
- [ ] **Descriptive test names.** `"should return enriched message when URL contains article"`, not `"test1"`.

### Special task types

**URL extraction tasks:** When building URL fetching/extraction:
1. Mock HTTP responses in unit tests — do NOT make real HTTP requests in unit tests.
2. Use `vi.mock()` or manual mocks for `fetch()` and JSDOM/Readability.
3. Test edge cases: timeouts, non-HTML responses, empty content, very long articles.
4. The integration test (Task 4.1) will use a REAL URL — that's where we validate real-world behavior.

**Pipeline tasks:** When modifying the pipeline:
1. Write unit tests with fully mocked agents (no real API calls).
2. Verify BOTH the URL path AND the text-only path work correctly.
3. Use the shared test fixtures from `tests/fixtures/factories.ts`.
4. Check that all existing pipeline tests pass before AND after your changes.

**Database tasks:** Ensure data is stored and retrievable. Integration tests should use a test database (separate SQLite file). Clean up test data after each test. Use parameterized queries — never interpolate user input into SQL.

**UI/Frontend tasks:** Use the `frontend-design` skill for creating UI components and pages. After building, start the Express server and verify the page renders correctly in Chrome. At minimum, ensure the server starts without errors and the page loads.

## Step 4: Validate

Run the full test suite to ensure nothing is broken:
```bash
cd /Users/ralph/Projects/forward-check-ai && npx vitest run
```

All tests must pass before proceeding.

Also verify:
- `npx tsc --noEmit` passes (no type errors).

## Step 5: Update plan

In `IMPLEMENTATION_PLAN_URL.md`, change the completed task from `- [ ]` to `- [x]`.

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
git add -A && git commit -m "URL Task X.Y: <short description>"
git push origin $(git branch --show-current)
```

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
