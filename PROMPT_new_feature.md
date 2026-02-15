# Build Prompt — ForwardCheck-AI New Feature (CI/CD + Feedback Pipeline)

You are adding CI/CD infrastructure and a multi-channel feedback pipeline to ForwardCheck-AI — a Telegram bot that fact-checks forwarded messages using multi-agent AI pipeline with Claude. Follow these instructions precisely.

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly. Pay special attention to:
   - **Architecture Overview** — understand the module map and data flow before writing code.
   - **Coding Standards** — every line of code you write must comply.
   - **Conventions** — naming, file structure, testing patterns.
   - **Gotchas / Decisions Log** — learn from previous iterations' mistakes and settled decisions.
2. `IMPLEMENTATION_PLAN_NEW_FEATURE.md` — the task list. Find the first task marked `- [ ]` (not started).
3. Read the source files you'll be modifying to understand existing patterns:
   - `src/config/env.ts` — Zod env schema pattern
   - `src/db/migrations.ts` — migration pattern
   - `src/db/investigation-repository.ts` — repository pattern (FOLLOW THIS EXACTLY for feedback repository)
   - `src/server/app.ts` — Express app factory, route mounting pattern
   - `src/server/routes/chat.ts` — route factory pattern
   - `src/server/middleware/rate-limit.ts` — rate limiter factory
   - `src/bot/message-handler.ts` — bot command/handler pattern
   - `src/index.ts` — service wiring pattern
   - `src/server/views/chat.ejs` — page structure pattern (topbar, design tokens, scripts)

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_PLAN_NEW_FEATURE.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

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
- **Zero new npm dependencies.** Use raw `fetch` for HTTP, existing `nanoid` for IDs, existing `zod` for validation, existing `better-sqlite3` for DB. The entire feedback pipeline adds NO new packages.

### Code quality gates (MUST pass before proceeding)

- [ ] **No file exceeds 400 lines.** If it does, extract classes/functions into separate files.
- [ ] **No `any` type.** Every variable, parameter, and return value is typed.
- [ ] **No `console.log`.** Use Pino logger.
- [ ] **Test isolation.** Each test is independent. No shared mutable state. Integration tests clean up after themselves.
- [ ] **Descriptive test names.** `"should return 201 with local ID when GitHub is unavailable"`, not `"test1"`.

### Special task types

**Database tasks:** Ensure data is stored and retrievable. Tests should use in-memory SQLite (`:memory:`). Use parameterized queries — never interpolate user input into SQL.

**API/Backend tasks:** Write tests that verify endpoints return expected responses. Test both success and error cases. Validate all external input at system boundaries.

**Service tasks (GitHub API):** Mock `global.fetch` in tests. Test success, error (non-2xx), and network failure cases. The service must NEVER throw — return `{ success: false, error }` instead.

**UI/Frontend tasks:** Use the `frontend-design` skill for creating UI components and pages. After building, start the Express server and verify the page renders correctly in browser. Match the existing dark theme (`--fc-bg: #0a0a0f`, Satoshi font, glass-morphism cards, `--fc-*` CSS variables from `_design-tokens.ejs`).

**Bot command tasks:** Mock Grammy `Context` in tests. Test valid input, validation failures, and service unavailability.

**GitHub CLI tasks (labels, branch protection):** These are not TDD tasks. Run the `gh` commands directly and verify the results.

## Step 4: Validate

Run the full test suite to ensure nothing is broken:
```bash
cd /Users/ralph/Projects/forward-check-ai && npx vitest run
```

All tests must pass before proceeding.

Also verify:
- `npx tsc --noEmit` passes (no type errors).

## Step 5: Update plan

In `IMPLEMENTATION_PLAN_NEW_FEATURE.md`, change the completed task from `- [ ]` to `- [x]`.

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
git add -A && git commit -m "Feature Task X.Y: <short description>"
git push origin $(git branch --show-current)
```

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
