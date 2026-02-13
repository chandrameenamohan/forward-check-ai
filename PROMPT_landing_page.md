# Build Prompt — ForwardCheck-AI Landing Page

You are building the landing page for ForwardCheck-AI — a Telegram bot that fact-checks forwarded messages using multi-agent AI pipeline with Claude. Follow these instructions precisely.

## Step 0: MANDATORY — Internalize the Power Writing Playbook FIRST

**Before you read any code, before you open any template, before you write a single line of HTML — you MUST read `skill/POWER_WRITING_PLAYBOOK.md` from top to bottom.** This is your copywriting bible for every word on this landing page.

This playbook contains Shaan Puri's Power Writing Course frameworks. You are NOT just a developer on this task — you are a **writer + designer + marketer** building a page that must convert visitors.

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
2. **Trust Booster** — Prove it works. Live verdict preview, tech stack credibility, Opus 4.6 badge
3. **"But" Killer** — Anticipate objections and crush them inline ("Takes 60 seconds, not 60 minutes")
4. **Action Booster** — ONE clear CTA per section. Point to value, don't push to action
5. **Personal Booster** — Have an attitude. Show personality. Kill corporate tone

### StoryBrand Formula (the page's narrative arc)
1. **Open with the problem:** "Viral messages spread faster than the truth"
2. **Introduce the solution:** "Forward it. Six AI agents investigate in 60 seconds."
3. **Paint the happy ending:** "You'll know the truth before you hit share."

### Landing Page Health Check (ask yourself after EVERY section)
- [ ] Do I GET IT? (Is it immediately clear what this does?)
- [ ] Do I BELIEVE IT? (Is there proof/credibility?)
- [ ] Do I WANNA DO IT? (Is the CTA compelling?)

### Headlines & Hooks
- 80% of visitors won't read past the headline — spend serious time on it
- Use the **Curiosity Gap** — not too vague, not too specific
- Write 5+ variations of every headline, then pick the best
- Ask for engagement instead of pushing ("See what happens when 6 AI agents fact-check a viral lie")

**If the copy on any section feels generic, corporate, or like "AI slop" — STOP and rewrite it using the playbook frameworks above. The words matter as much as the design.**

---

## Step 1: Study context

Read these files thoroughly before doing anything:

1. `skill/POWER_WRITING_PLAYBOOK.md` — **READ THIS FIRST, COMPLETELY.** This is the source of truth for all copy, headlines, and messaging on the landing page. Every framework listed above comes from this file. If you skip this, every word you write will be wrong.
2. `AGENTS.md` — operational learnings, architecture overview, coding standards, and project conventions. Follow these strictly. Pay special attention to:
   - **Architecture Overview** — understand the module map and data flow before writing code.
   - **Coding Standards** — every line of code you write must comply.
   - **Conventions** — naming, file structure, testing patterns.
   - **Gotchas / Decisions Log** — learn from previous iterations' mistakes and settled decisions.
3. `IMPLEMENTATION_UI_PLAN.md` — the task list. Find the first task marked `- [ ]` (not started).
4. `HACKATHON_PROD_SPEC_OPUS-4-6.md` — the full product and technical specification. Reference for architecture, agent design, pipeline flow, and demo strategy. Use Section 1 (Executive Summary) for the 30-second pitch and key selling points.
5. `demo/SUMMARY_V0.md` — the 200-word hackathon submission summary. The landing page messaging should align with this summary.

## Step 2: Select one task

Pick the **first** `- [ ]` task in `IMPLEMENTATION_UI_PLAN.md`. Do NOT skip ahead. Do NOT pick multiple tasks.

## Step 3: Implement

### For UI tasks, follow this process:

1. **Re-read `skill/POWER_WRITING_PLAYBOOK.md`** — specifically the section relevant to your current task (Landing Page 5 Boosters, Headlines, StoryBrand, etc.). Do NOT skip this. Every iteration must start with the playbook fresh in mind.
2. **Read existing code** — check `src/server/views/verdict.ejs` and `src/server/views/_verdict-styles.ejs` to understand the established design system (dark theme, Satoshi/DM Mono/Instrument Serif fonts, noise texture, `--fc-*` CSS variables).
3. **Draft the copy FIRST, before any HTML** — write the actual words (headlines, body text, CTAs, microcopy) as plain text. Apply the 7 Power Writing Hacks. Read it out loud. Does it sound like a human talking? Does it create a reaction? Only then move to code.
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

- **Theme:** Dark (`--fc-bg: #0a0a0f`). Same as verdict page.
- **Fonts:** Satoshi (body), DM Mono (monospace/labels), Instrument Serif (display headlines)
- **CSS Variables:** Use the `--fc-*` token system. Do NOT introduce new color variables outside this system.
- **No external JS libraries.** Pure CSS animations + vanilla JS only. Bootstrap 5 for grid/utilities only.
- **Responsive:** Mobile-first. Test at 375px, 768px, 1440px.
- **Noise texture background:** Same SVG filter as verdict page.
- **Glass-morphism cards:** `backdrop-filter: blur()` with semi-transparent backgrounds.

### Copy Rules (from `skill/POWER_WRITING_PLAYBOOK.md` — violations will be caught in review):

- Write at 5th–8th grade reading level (Playbook: Section I, Hack #1)
- Use "you" and "your" — never "we" or "our" (except in footer attribution) (Playbook: Section I, Hack #6)
- Visual language: make the reader SEE the benefit — "like a newsroom in your pocket" not "multi-agent pipeline" (Playbook: Section I, Hack #4)
- Active voice, subject first — "Six agents investigate" not "Investigation is performed" (Playbook: Section I, Hack #3)
- Kill adverbs — no "-ly" words anywhere in copy (Playbook: Section I, Hack #2)
- Every heading must create a curiosity gap or provoke a reaction (Playbook: Session 4, Headlines)
- Every section must answer "What's in it for me?" — if a section talks about the tech without connecting to user benefit, rewrite it (Playbook: Session 5, Landing Pages)
- Write the CTA from the user's perspective — "See my verdict" not "Submit" (Playbook: Session 5, Boost #4)
- Anticipate the reader's "but..." and kill it inline (Playbook: Session 5, Boost #3)
- **The acid test:** Read every sentence out loud. If it sounds like a press release, a corporate About page, or an AI-generated summary — DELETE IT and write like you're texting a smart friend (Playbook: Section I, BONUS)

### Code quality gates (MUST pass before proceeding)

- [ ] **No file exceeds 400 lines.** If it does, extract into separate partials.
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

In `IMPLEMENTATION_UI_PLAN.md`, change the completed task from `- [ ]` to `- [x]`.

## Step 6: Update AGENTS.md

If you discovered any of these during implementation, append them to the appropriate section in `AGENTS.md`:

- **Gotchas:** Surprises, things that didn't work as expected
- **Conventions:** New patterns established (e.g., partial naming, animation patterns)
- **Decisions Log:** Design decisions made and WHY

## Step 7: Commit and push

Commit all changes with a descriptive message referencing the task number:
```bash
git add -A && git commit -m "UI Task X.Y: <short description>"
git push origin $(git branch --show-current)
```

## Step 8: Exit

You are done. Do NOT start another task. Exit immediately after committing.
