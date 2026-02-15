# Build Prompt — ForwardCheck-AI Web Chat

You are building the web chat interface for ForwardCheck-AI — a fact-checking tool that lets users paste a claim directly in the browser and watch six AI agents investigate it in real-time. Follow these instructions precisely.

## Step 0: MANDATORY — Internalize the Power Writing Playbook FIRST

**Before you read any code, before you open any template, before you write a single line of HTML — you MUST read `skill/POWER_WRITING_PLAYBOOK.md` from top to bottom.** This is your copywriting bible for every word on this chat page.

This playbook contains Shaan Puri's Power Writing Course frameworks. You are NOT just a developer on this task — you are a **writer + designer + marketer** building an interface that must convert visitors into active users.

**Internalize these frameworks and apply them to EVERY piece of copy you write:**

### The 7 Power Writing Hacks (apply to ALL text)
1. Write at 5th–8th grade reading level — no jargon, no fancy words
2. Kill adverbs — no words ending in "-ly"
3. Subject first, active voice — "Six agents investigate your message" not "Your message is investigated by six agents"
4. Visual language — make readers SEE it ("like a tiny newsroom in your pocket")
5. Rhymes and alliteration — make it sticky and memorable
6. Personal — "you" and "your" everywhere, never "we" or "our" or "one"
7. Spend 20%+ of your time on headlines and first lines

### Landing Page 5 Boosters (structure the page around these)
1. **Level-Up Booster** — Don't describe the product. Show how it levels up THEIR life. Frame: "Stop the Struggle" or "The Happy Ending"
2. **Trust Booster** — Prove it works. Show the investigation happening live. Six agents, visible reasoning.
3. **"But" Killer** — Anticipate objections and crush them inline ("Takes 60 seconds, not 60 minutes")
4. **Action Booster** — ONE clear CTA: "Investigate This." Point to value, don't push to action.
5. **Personal Booster** — Have an attitude. Show personality. Kill corporate tone.

### Chat Interface Copy Guidelines
All status messages, error messages, and UI copy MUST follow these approved patterns:
- **Page H1:** "Paste. Investigate. Share the verdict."
- **Subtitle:** "Six AI agents spend 60 seconds tearing your message apart. You get the truth, the tricks, and the confidence score — ready to share."
- **Submit button:** "Investigate This"
- **Input placeholder:** "Paste a message that seems off... or type a claim you want checked"
- **Pipeline stage messages:** Use active voice, visual language. Example: "Scanning your message against 47 known tricks..." not "Classifying message..."
- **Error messages:** Helpful, human, never blame the user. Example: "Give your claim a bit more detail. We need at least 10 characters to investigate." not "Error: Input too short."

**If the copy on any element feels generic, corporate, or like "AI slop" — STOP and rewrite it using the playbook frameworks above. The words matter as much as the design.**

---

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `skill/POWER_WRITING_PLAYBOOK.md` — **READ THIS FIRST, COMPLETELY.** This is the source of truth for all copy, headlines, and messaging. Every framework listed above comes from this file. If you skip this, every word you write will be wrong.
2. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly. Pay special attention to:
   - **Architecture Overview** — understand the module map and data flow before writing code.
   - **Coding Standards** — every line of code you write must comply.
   - **Conventions** — naming, file structure, testing patterns.
   - **Gotchas / Decisions Log** — learn from previous iterations' mistakes and settled decisions.
3. `IMPLEMENTATION_PLAN_WEBCHAT.md` — the task list. Find the first task marked `- [ ]` (not started).
4. `HACKATHON_PROD_SPEC_OPUS-4-6.md` — the full product and technical specification. Reference for architecture, agent design, pipeline flow, and demo strategy.
5. **Existing live stream pages (CRITICAL — study these for SSE patterns):**
   - `src/server/views/live.ejs` — the live investigation page. Study how it connects to SSE, handles events, and renders agent cards.
   - `src/server/views/_live-styles.ejs` — the live page CSS. Your chat page must use the same design language.
   - `src/server/views/_live-agent-script.ejs` — the live page JavaScript. Your SSE event handling must follow these exact patterns.
   - `src/server/views/_live-agent-cards.ejs` — the agent card HTML structure. Reuse this structure.
   - `src/server/views/_live-verdict-reveal.ejs` — the verdict reveal animation. Reuse this pattern.
6. **Existing routes and infrastructure:**
   - `src/server/app.ts` — how routes are mounted. Follow this pattern.
   - `src/server/routes/live-stream.ts` — how SSE streaming works. Your chat page reuses this endpoint.
   - `src/server/routes/investigate.ts` — existing API patterns. Follow the same router factory pattern.
   - `src/server/views/_design-tokens.ejs` — the shared design token system. Include this in your page.

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_PLAN_WEBCHAT.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Implement

### For backend tasks (Phase 0), follow TDD:

1. **Write the test first** — create the test file specified in the task's validation section. Write tests that assert the expected behavior.
2. **Run the tests** — confirm they fail (red). Command: `npx vitest run`
3. **Write the implementation** — minimum code to make tests pass.
4. **Run the tests** — confirm they pass (green).
5. **Refactor if needed** — clean up without changing behavior. Tests must still pass.

### For UI tasks (Phase 1+), follow this process:

1. **Re-read `skill/POWER_WRITING_PLAYBOOK.md`** — specifically the section relevant to your current task. Do NOT skip this. Every iteration must start with the playbook fresh in mind.
2. **Read existing code** — check the live page templates (`live.ejs`, `_live-styles.ejs`, `_live-agent-script.ejs`) to understand the established SSE and real-time update patterns. Check `_design-tokens.ejs` for the design system.
3. **Draft the copy FIRST, before any HTML** — write the actual words (status messages, error messages, CTAs, microcopy) as plain text. Apply the 7 Power Writing Hacks. Read it out loud. Does it sound like a human talking? Does it create a reaction? Only then move to code.
4. **Write the test** — create the test file specified in the task's validation section.
5. **Use the `frontend-design` skill** — invoke it for every visual component. This ensures production-grade, distinctive UI that avoids generic AI aesthetics.
6. **Write the implementation** — build the EJS template, styles partial, and route code. Embed the copy you drafted in step 3.
7. **Run the tests** — confirm they pass.
8. **Visual verification** — start the server and check the page renders correctly in browser.
9. **Copy quality check** — re-read every word on the page and ask:
   - Is this 5th–8th grade reading level? (No jargon?)
   - Does it use "you"/"your"? (Not "we"/"our"?)
   - Is the language visual? (Can I picture it?)
   - Does the headline create a curiosity gap?
   - Does this section answer "What's in it for me?"
   - Would I forward this page to a friend?

### Design System Rules (MUST follow):

- **Theme:** Dark (`--fc-bg: #0a0a0f`). Same as verdict and live pages.
- **Fonts:** Satoshi (body), DM Mono (monospace/labels), Instrument Serif (display headlines)
- **CSS Variables:** Use the `--fc-*` token system from `_design-tokens.ejs`. Do NOT introduce new color variables outside this system.
- **No external JS libraries.** Pure CSS animations + vanilla JS only. Bootstrap 5 for grid/utilities only.
- **Responsive:** Mobile-first. Test at 375px, 768px, 1440px.
- **Noise texture background:** Same SVG filter as other pages (included in `_design-tokens.ejs`).
- **Glass-morphism cards:** `backdrop-filter: blur()` with semi-transparent backgrounds.
- **Agent card patterns:** Reuse the exact same card HTML/CSS structure from `_live-agent-cards.ejs` and `_live-styles.ejs`.

### Copy Rules (from `skill/POWER_WRITING_PLAYBOOK.md` — violations will be caught in review):

- Write at 5th–8th grade reading level (Playbook: Section I, Hack #1)
- Use "you" and "your" — never "we" or "our" (except in footer attribution) (Playbook: Section I, Hack #6)
- Visual language: make the reader SEE the benefit — "Six agents tear your claim apart" not "multi-agent pipeline processes input" (Playbook: Section I, Hack #4)
- Active voice, subject first — "Six agents investigate" not "Investigation is performed" (Playbook: Section I, Hack #3)
- Kill adverbs — no "-ly" words anywhere in copy (Playbook: Section I, Hack #2)
- Every heading must create a curiosity gap or provoke a reaction (Playbook: Session 4, Headlines)
- Every section must answer "What's in it for me?" — if a section talks about the tech without connecting to user benefit, rewrite it (Playbook: Session 5, Landing Pages)
- Write the CTA from the user's perspective — "Investigate This" not "Submit" (Playbook: Session 5, Boost #4)
- Anticipate the reader's "but..." and kill it inline (Playbook: Session 5, Boost #3)
- **The acid test:** Read every sentence out loud. If it sounds like a press release, a corporate About page, or an AI-generated summary — DELETE IT and write like you're texting a smart friend (Playbook: Section I, BONUS)

### Chat-Specific Implementation Rules:

- **Reuse existing SSE infrastructure.** The PipelineEventBus and `/api/live/:id/stream` endpoint already exist. Do NOT create new SSE endpoints. The chat page connects to the same stream as the live page.
- **Follow the live.ejs patterns for SSE client code.** Study `_live-agent-script.ejs` and replicate the same event handling, card state management, and status cycling patterns.
- **EventSource with polling fallback.** Primary path: `new EventSource('/api/live/' + id + '/stream')`. Fallback: poll `GET /api/investigation/:id` every 3 seconds if EventSource is unavailable.
- **Input validation: 10-5000 chars.** Enforce on both client (textarea counter + disabled submit) and server (POST handler returns 400).
- **HTML sanitization.** Strip HTML tags from input on the server side before storing.
- **Rate limiting: 10 requests per IP per 60 seconds.** Apply to `POST /api/chat/message` only.
- **Chat route creates investigations via the pipeline.** The chat POST handler triggers `pipeline.investigate()` in the background and returns the ID immediately, just like the dev trigger endpoint.
- **All status messages use approved copy.** Reference the Copy Guidelines section above for every pipeline stage message, error message, and CTA label.

### Code quality gates (MUST pass before proceeding)

- [ ] **No file exceeds 400 lines.** If it does, extract into separate partials (follow the `_live-agent-script.ejs` / `_live-agent-cards.ejs` / `_live-verdict-reveal.ejs` pattern).
- [ ] **No `any` type.** Every variable, parameter, and return value is typed.
- [ ] **No `console.log`.** Use Pino logger.
- [ ] **Test isolation.** Each test is independent.
- [ ] **Responsive.** Page looks good at 375px, 768px, and 1440px.

## Step 4: Validate

Run the full test suite to ensure nothing is broken:
```bash
cd /Users/ralph/Projects/forward-check-ai && npx vitest run
```

All tests must pass before proceeding.

Also verify:
- `npx tsc --noEmit` passes (no type errors).
- Start server and visually check the page renders.

## Step 5: Update plan

In `IMPLEMENTATION_PLAN_WEBCHAT.md`, change the completed task from `- [ ]` to `- [x]`.

## Step 6: Update AGENTS.md

If you discovered any of these during implementation, append them to the appropriate section in `AGENTS.md`:

- **Gotchas:** Surprises, things that didn't work as expected
- **Conventions:** New patterns established (e.g., chat partial naming, SSE reuse patterns)
- **Decisions Log:** Design decisions made and WHY

## Step 7: Commit and push

Commit all changes with a descriptive message referencing the task number:
```bash
git add -A && git commit -m "Chat Task X.Y: <short description>"
git push origin $(git branch --show-current)
```

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
