# Build Prompt — ForwardCheck-AI Live Verdict Page

You are building the "See Live Verdict" page for ForwardCheck-AI — a real-time visualization that shows users how 6 AI agents investigate their forwarded message. This is the hackathon demo video centerpiece. Follow these instructions precisely.

## Step 0: MANDATORY — Internalize the Power Writing Playbook FIRST

**Before you read any code, before you open any template, before you write a single line of HTML — you MUST read `skill/POWER_WRITING_PLAYBOOK.md` from top to bottom.** This is your copywriting bible for every word on this page.

**Internalize these frameworks and apply them to EVERY piece of copy you write:**

### The 7 Power Writing Hacks (apply to ALL text)
1. Write at 5th–8th grade reading level — no jargon, no fancy words
2. Kill adverbs — no words ending in "-ly"
3. Subject first, active voice — "The Classifier scans your message" not "Your message is being scanned by the Classifier"
4. Visual language — make readers SEE it ("like watching a courtroom trial unfold")
5. Rhymes and alliteration — make it sticky and memorable
6. Personal — "you" and "your" everywhere, never "we" or "our" or "one"
7. Spend 20%+ of your time on the status messages and verdict reveal text

### StoryBrand Formula (the page's narrative arc)
1. **Open with tension:** User sees their claim — "Is this true or not?"
2. **Build the investigation:** Agents activate one by one — suspense builds
3. **The challenge:** Devil's Advocate attacks — will the verdict hold?
4. **The reveal:** Verdict drops — resolution, clarity, truth

### Key Principle for Live Page Copy
Every status message is a micro-story. "Classifying message..." is boring. "Scanning for 47 known manipulation patterns..." is a story. The user should feel like they're watching a detective team at work, not a loading bar.

**If any status text feels generic or like a loading screen — STOP and rewrite it as a story beat.**

---

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `skill/POWER_WRITING_PLAYBOOK.md` — **READ THIS FIRST, COMPLETELY.** Source of truth for all copy.
2. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly. Pay special attention to:
   - **Architecture Overview** — understand the module map and data flow before writing code.
   - **Coding Standards** — every line of code you write must comply.
   - **Conventions** — naming, file structure, testing patterns.
   - **Gotchas / Decisions Log** — learn from previous iterations' mistakes and settled decisions.
3. `IMPLEMENTATION_PLAN_LIVEVIEW.md` — the task list. Find the first task marked `- [ ]` (not started).
4. `HACKATHON_PROD_SPEC_OPUS-4-6.md` — the full product and technical specification. Reference for pipeline flow, agent design, and schemas.
5. Study the existing pages for design patterns:
   - `src/server/views/verdict.ejs` + `_verdict-styles.ejs` — the static verdict page
   - `src/server/views/landing.ejs` + `_landing-styles.ejs` — the landing page
   - `src/server/views/_design-tokens.ejs` — shared CSS variables

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_PLAN_LIVEVIEW.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Implement

### For backend tasks (Phase 0-1), follow TDD:

1. **Write the test first** — create the test file specified in the task's validation section.
2. **Run the tests** — confirm they fail (red). Command: `npx vitest run`
3. **Write the implementation** — minimum code to make tests pass.
4. **Run the tests** — confirm they pass (green).
5. **Refactor if needed** — clean up without changing behavior.

### For UI tasks (Phase 2+), follow this process:

1. **Re-read `skill/POWER_WRITING_PLAYBOOK.md`** — specifically the section relevant to your current task.
2. **Read existing code** — check `src/server/views/verdict.ejs`, `landing.ejs`, and `_design-tokens.ejs` to understand the established design system.
3. **Draft the copy FIRST, before any HTML** — write the actual words as plain text. Apply the 7 Power Writing Hacks. Read it out loud.
4. **Write the test** — create the test file specified in the task's validation section.
5. **Use the `frontend-design` skill** — invoke it for every visual component.
6. **Write the implementation** — build the EJS template, styles partial, and route code.
7. **Run the tests** — confirm they pass.
8. **Visual verification** — start the server and check the page renders correctly.
9. **Copy quality check** — re-read every word and ask:
   - Is this 5th–8th grade reading level?
   - Does it use "you"/"your"?
   - Is the language visual? Can I picture it?
   - Does every status message tell a micro-story?
   - Would this look good in a demo video?

### Design System Rules (MUST follow):

- **Theme:** Dark (`--fc-bg: #0a0a0f`). Same as verdict and landing pages.
- **Fonts:** Satoshi (body), DM Mono (monospace/labels/status), Instrument Serif (display headlines)
- **CSS Variables:** Use the `--fc-*` token system. Do NOT introduce new color variables outside this system.
- **No external JS libraries.** Pure CSS animations + vanilla JS only. Bootstrap 5 for grid/utilities only.
- **Responsive:** Mobile-first. Test at 375px, 768px, 1440px.
- **Noise texture background:** Same SVG filter as verdict page.
- **Glass-morphism cards:** `backdrop-filter: blur()` with semi-transparent backgrounds.
- **Agent state colors:** Use existing accents — green (`--fc-accent-green`) for complete, amber for active, red for failed, dim for idle.

### Live Page Specific Patterns:

- **SSE events drive all UI updates.** No polling. `EventSource` connects to `/api/live/:id/stream`.
- **State machine per card.** Each agent card has states: `idle` → `active` → `complete` (or `failed`). CSS classes: `.fc-agent--idle`, `.fc-agent--active`, `.fc-agent--complete`.
- **Progressive reveal.** Cards start hidden/dimmed and appear as events arrive.
- **Catch-up on connect.** Late-joining clients receive all historical events first, then live updates.

### Code quality gates (MUST pass before proceeding):

- [ ] **No file exceeds 400 lines.** If it does, extract into separate partials or modules.
- [ ] **No `any` type.** Every variable, parameter, and return value is typed.
- [ ] **No `console.log`.** Use Pino logger.
- [ ] **Test isolation.** Each test is independent.
- [ ] **Responsive.** Page looks good at 375px, 768px, and 1440px.
- [ ] **SSE events are typed.** Event names and data shapes match `PipelineEvent` union type.

## Step 4: Validate

Run the full test suite to ensure nothing is broken:
```bash
cd /Users/ralph/Projects/forward-check-ai && npx vitest run
```

All tests must pass before proceeding.

Also verify:
- `npx tsc --noEmit` passes (no type errors).
- For UI tasks: start server and visually check the page renders.

## Step 5: Update plan

In `IMPLEMENTATION_PLAN_LIVEVIEW.md`, change the completed task from `- [ ]` to `- [x]`.

## Step 6: Update AGENTS.md

If you discovered any of these during implementation, append them to the appropriate section in `AGENTS.md`:

- **Gotchas:** Surprises, things that didn't work as expected
- **Conventions:** New patterns established (e.g., SSE event naming, agent card state classes)
- **Decisions Log:** Design decisions made and WHY

## Step 7: Commit and push

Commit all changes with a descriptive message referencing the task number:
```bash
git add -A && git commit -m "Live Task X.Y: <short description>"
git push origin $(git branch --show-current)
```

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
