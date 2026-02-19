# Build Prompt — ForwardCheck-AI WhatsApp Integration

You are implementing the WhatsApp integration for ForwardCheck-AI — extending the existing Telegram fact-checking bot to support WhatsApp as a second messaging platform using the platform adapter pattern. Follow these instructions precisely.

> **CRITICAL: The existing Telegram bot MUST continue working. Do NOT break existing functionality. Run the full test suite after every change.**

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly. Pay special attention to:
   - **Architecture Overview** — understand the module map and data flow before writing code.
   - **Coding Standards** — every line of code you write must comply.
   - **Conventions** — naming, file structure, testing patterns.
   - **Gotchas / Decisions Log** — learn from previous iterations' mistakes and settled decisions.
2. `IMPLEMENTATION_PLAN_WHATSAPP.md` — the task list for WhatsApp integration. Find the first task marked `- [ ]` (not started).
3. `docs/WHATSAPP_INTEGRATION_SPEC.md` — the full WhatsApp integration specification. Reference for architecture, platform adapter design, WhatsApp Cloud API details, interfaces, and implementation phases.

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_PLAN_WHATSAPP.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

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
- **Follow the PlatformAdapter/PlatformResponder/PlatformMessage interfaces in `src/platforms/types.ts`.** All new platform code must implement these interfaces.

### Code quality gates (MUST pass before proceeding)

- [ ] **No file exceeds 400 lines.** If it does, extract classes/functions into separate files.
- [ ] **No `any` type.** Every variable, parameter, and return value is typed.
- [ ] **No `console.log`.** Use Pino logger.
- [ ] **Test isolation.** Each test is independent. No shared mutable state. Integration tests clean up after themselves.
- [ ] **Descriptive test names.** `"should return likely-false when confidence is below 29%"`, not `"test1"`.
- [ ] **Existing Telegram tests still pass.** Do not break any existing functionality.

### Special task types

**Database tasks:** Ensure data is stored and retrievable. Integration tests should use a test database (separate SQLite file). Clean up test data after each test. Use parameterized queries — never interpolate user input into SQL.

**API/Backend tasks:** Write integration tests that verify endpoints return expected responses. Test both success and error cases. Validate all external input at system boundaries.

**Agent tasks (CRITICAL):** When building AI agent logic:
1. Write unit tests with mocked Anthropic SDK responses first.
2. Then write a QA integration test that calls the REAL Anthropic API with a known test claim. Use the API key from `.env` (`ANTHROPIC_API_KEY`).
3. Validate the agent returns structurally valid output matching its Zod schema.
4. Log the actual API cost for budget tracking.
This ensures agents work end-to-end with the real SDK, not just mocks.

**WhatsApp webhook/adapter tasks:** Write integration tests that simulate incoming WhatsApp webhook payloads. Verify signature validation, message parsing, and correct routing to the pipeline. Test the full flow: webhook → adapter → PlatformMessage → pipeline → responder.

**Platform refactoring tasks:** When moving existing Telegram code into the platform adapter pattern, ensure the Telegram bot behavior is identical before and after. Write comparison tests if needed. The refactor must be invisible to Telegram users.

**UI/Frontend tasks:** Use the `frontend-design` skill for creating UI components and pages. After building, start the Express server and verify the page renders correctly in Chrome. At minimum, ensure the server starts without errors and the page loads.

## Step 4: Validate

Run the full test suite to ensure nothing is broken:
```bash
cd /Users/ralph/Projects/forward-check-ai && npx vitest run
```

All tests must pass before proceeding — both new WhatsApp tests AND all existing Telegram tests.

Also verify:
- `npx tsc --noEmit` passes (no type errors).

## Step 5: Update plan

In `IMPLEMENTATION_PLAN_WHATSAPP.md`, change the completed task from `- [ ]` to `- [x]`.

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
git add -A && git commit -m "WhatsApp Task X.Y: <short description>"
```
Do NOT push to remote. Local commits only.

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
