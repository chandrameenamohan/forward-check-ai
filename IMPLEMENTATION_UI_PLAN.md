# ForwardCheck-AI — UI Landing Page Implementation Plan

> Each task is atomic, single-objective, and follows the same philosophy as the core build plan. A task is complete when: code written, page renders correctly, validated, committed and pushed.

---

## Phase 0: Landing Page Foundation

### Task 0.1: Create landing page route and EJS skeleton
- [x]
**Objective:** Add `GET /` route that renders a new `landing.ejs` template with the existing design system.
**Details:**
- Create `src/server/views/landing.ejs` — full HTML page skeleton
- Create `src/server/views/_landing-styles.ejs` — shared CSS variables from `_verdict-styles.ejs` (same dark theme: `--fc-bg: #0a0a0f`, Satoshi/DM Mono/Instrument Serif fonts, noise texture background)
- Add `GET /` route in `src/server/app.ts` — renders `landing` template
- Include Bootstrap 5 CDN, Google Fonts CDN (same fonts as verdict page)
- Topbar with "ForwardCheck" brand left, "GitHub" link right
- Empty `<main>` ready for sections
**Validation:**
- Start server: `npx tsx src/index.ts` or test via supertest
- Test file: `tests/unit/server/routes/landing.test.ts`
- Test: `"GET / should return 200"`
- Test: `"GET / should contain ForwardCheck in response body"`
- Verify page loads in browser without errors

### Task 0.2: Create shared CSS design tokens partial
- [x]
**Objective:** Extract the common design tokens (colors, fonts, spacing) into a reusable `_design-tokens.ejs` partial so both landing and verdict pages share the same visual language.
**Details:**
- Create `src/server/views/_design-tokens.ejs` — CSS variables only (no component styles)
- Variables: `--fc-bg`, `--fc-surface`, `--fc-surface-raised`, `--fc-border`, `--fc-text`, `--fc-text-muted`, `--fc-text-dim`, accent colors, font stacks
- Include base reset (`* { box-sizing }`, body styles, noise texture)
- Update `_verdict-styles.ejs` to include `_design-tokens.ejs` instead of duplicating
- Update `_landing-styles.ejs` to include `_design-tokens.ejs`
**Validation:**
- Verdict page still renders identically (no visual regression)
- Landing page picks up same dark theme
- Test: `"GET /v/:id should still return 200 with styled content"` (existing tests pass)
- Test: `"GET / should include design token CSS variables"`

---

## Phase 1: Hero Section

### Task 1.1: Landing page hero — headline, subheadline, CTA
- [ ]
**Objective:** Build the hero section using StoryBrand formula: problem statement, solution pitch, and primary CTA.
**Details:**
- Add hero section to `landing.ejs`
- **Headline (problem):** "Viral messages spread faster than the truth." (or similar — punchy, visual, 5th grade level)
- **Subheadline (solution):** "Forward any suspicious message. Six AI agents investigate it in under 60 seconds." (the happy ending)
- **Primary CTA button:** "Try it on Telegram" → links to bot `https://t.me/ForwardCheckBot` (configurable)
- **Secondary CTA:** "See a live verdict →" → links to `/v/<demo-id>` (configurable)
- Hero visual: animated gradient mesh or subtle particle effect behind text (CSS only, no JS libraries)
- Typography: Instrument Serif for headline, Satoshi for body
- Mobile responsive (stack vertically on small screens)
- Use `frontend-design` skill for the implementation
**Validation:**
- Page renders hero section with headline, subheadline, both CTAs
- Mobile viewport (375px) renders correctly
- No JS errors in console
- Test: `"GET / should contain primary CTA link"`
- Test: `"GET / should contain hero headline text"`

### Task 1.2: Animated "investigation in progress" demo mockup
- [ ]
**Objective:** Add a visual demo element in the hero area showing a mock message being fact-checked in real-time — the "scroll-stopping" moment.
**Details:**
- Create a CSS-animated card that shows:
  1. A fake forwarded message appearing (e.g. "PM Modi announces Rs 5000 transfer to all citizens")
  2. Sequential status updates: "Classifying..." → "Planning investigation..." → "Searching sources..." → "Challenging findings..." → "Rendering verdict..."
  3. Final verdict badge appearing: "LIKELY FALSE — 92% confidence"
- Pure CSS animations with `@keyframes` and `animation-delay` for staggered reveals
- Card styled like a Telegram message bubble (dark, rounded)
- Loops continuously with a pause between cycles
- Use `frontend-design` skill
**Validation:**
- Animation plays smoothly on page load
- No layout shift during animation
- Works on mobile
- Test: `"GET / should contain investigation demo element"`

---

## Phase 2: How It Works Section

### Task 2.1: Six-agent pipeline visualization
- [ ]
**Objective:** Create a visual representation of the 6-agent investigation pipeline, showing the flow from message to verdict.
**Details:**
- Section title: "How It Works" or "Your Personal Newsroom"
- 6 steps displayed as a horizontal flow (desktop) / vertical timeline (mobile):
  1. **Classifier** (Haiku) — "Routes your message" — brain icon
  2. **Strategist** (Opus 4.6) — "Plans the investigation" — chess icon
  3. **Investigators** (Sonnet ×3) — "Search for evidence" — magnifying glass icon
  4. **Devil's Advocate** (Opus 4.6) — "Challenges the findings" — flame icon
  5. **Judge** (Opus 4.6) — "Renders the verdict" — gavel icon
- Each step shows: icon, agent name, model tier badge (Haiku/Sonnet/Opus), one-line description
- Connecting lines/arrows between steps
- Subtle CSS animation: steps light up sequentially on scroll (use `IntersectionObserver`)
- Use `frontend-design` skill
**Validation:**
- All 6 agents displayed with correct model tier badges
- Responsive: horizontal on desktop, vertical on mobile
- Test: `"GET / should contain all 6 agent pipeline steps"`

---

## Phase 3: Key Features Section

### Task 3.1: Feature cards — manipulation detection, visible reasoning, confidence decomposition
- [ ]
**Objective:** Showcase the 3 differentiated features that make ForwardCheck unique.
**Details:**
- Section title: "Not Just True or False"
- 3 feature cards in a grid:
  1. **Manipulation Detection** — "See HOW you're being manipulated. Emotional framing, missing context, cherry-picked data — we show the techniques." — shield icon
  2. **Visible AI Reasoning** — "Read the AI's actual thinking. The Devil's Advocate tries to tear the verdict apart. If it fails, you know the verdict is solid." — eye icon
  3. **Confidence Decomposition** — "One number isn't enough. We break confidence into 4 components: evidence strength, source reliability, claim complexity, counter-argument resilience." — chart icon
- Cards have: icon, title, description, subtle hover effect (lift + glow)
- Visual style: glass-morphism cards on dark background
- Use `frontend-design` skill
**Validation:**
- All 3 feature cards render with correct content
- Hover effects work
- Mobile: single column stack
- Test: `"GET / should contain feature cards section"`

---

## Phase 4: Live Example Section

### Task 4.1: Embedded verdict preview
- [ ]
**Objective:** Show a real verdict inline on the landing page as proof the system works — the "trust builder."
**Details:**
- Section title: "See It In Action"
- Display a condensed version of a real verdict (from seeded demo data):
  - Verdict badge (LIKELY FALSE) with color
  - Confidence ring (small)
  - 3-line summary
  - "View Full Analysis →" link to `/v/<id>`
- If no demo data available, show a static placeholder with realistic content
- Template reads a `demoVerdictId` variable passed from the route (optional)
- Style as a "card within a card" — darker inset on the dark background
- Use `frontend-design` skill
**Validation:**
- Verdict preview renders with badge, confidence, summary
- Link to full verdict page works
- Test: `"GET / should contain verdict preview section"`

---

## Phase 5: Tech Showcase Section

### Task 5.1: Opus 4.6 showcase and tech stack display
- [ ]
**Objective:** Highlight the creative use of Opus 4.6 (25% of judging criteria) and the tech stack.
**Details:**
- Section title: "Built with Opus 4.6"
- **3-tier model strategy visual:**
  - Haiku (fast/cheap) → routing decisions
  - Sonnet (balanced) → investigation & tool use
  - Opus 4.6 (powerful) → strategic planning, adversarial reasoning, final judgment
  - Show as layered/tiered visual with model names and what each does
- **4 Opus 4.6 reasoning modes:** Strategic planning, Adversarial challenge, Tool-augmented verification, Confidence decomposition
- **Tech stack pills:** TypeScript, Grammy, Express, SQLite, Zod, Anthropic SDK
- Use `frontend-design` skill
**Validation:**
- 3-tier model visual renders correctly
- All 4 reasoning modes displayed
- Tech stack pills are visible
- Test: `"GET / should contain Opus 4.6 showcase section"`

---

## Phase 6: CTA Footer Section

### Task 6.1: Final CTA and footer
- [ ]
**Objective:** Close with a strong call-to-action (the "happy ending" from StoryBrand) and project footer.
**Details:**
- **CTA section:**
  - Headline: "Stop forwarding lies." (or similar power line)
  - Subheadline: "Try ForwardCheck-AI on Telegram. It takes 60 seconds."
  - Large CTA button: "Open in Telegram →"
  - Secondary: "View on GitHub →"
- **Footer:**
  - "Built for Cerebral Valley × Anthropic Hackathon — Feb 2026"
  - "Powered by Claude Opus 4.6"
  - GitHub link, MIT License badge
- Subtle gradient/glow behind CTA section to draw the eye
- Use `frontend-design` skill
**Validation:**
- CTA buttons link correctly
- Footer displays hackathon attribution
- Test: `"GET / should contain footer with hackathon attribution"`
- Test: `"GET / should contain Telegram CTA button"`

---

## Phase 7: Animations & Polish

### Task 7.1: Scroll animations and micro-interactions
- [ ]
**Objective:** Add entrance animations triggered by scroll and hover micro-interactions for a polished demo experience.
**Details:**
- `IntersectionObserver` based fade-in/slide-up for each section
- Staggered animation delays for card grids (Shaan's "slippery slope" — each element draws you to the next)
- Smooth scroll for any anchor links
- Pipeline steps light up sequentially on scroll
- CTA button has subtle pulse/glow animation
- All animations respect `prefers-reduced-motion`
- Pure CSS + minimal vanilla JS (no libraries)
**Validation:**
- Animations trigger correctly on scroll
- No janky layout shifts
- `prefers-reduced-motion` disables animations
- Page loads in < 2 seconds (no heavy assets)
- Test: `"GET / should include IntersectionObserver script"`

### Task 7.2: Meta tags, OG image, and SEO
- [ ]
**Objective:** Add Open Graph meta tags and a favicon so the page looks professional when shared.
**Details:**
- `<title>`: "ForwardCheck-AI — Fact-check any message in 60 seconds"
- `<meta name="description">`: Use the 200-word summary (first sentence)
- OG tags: `og:title`, `og:description`, `og:image` (static SVG or inline data URI hero image), `og:url`
- Twitter card meta tags
- Favicon: inline SVG data URI (shield/check icon in accent green)
- Canonical URL
**Validation:**
- View page source, confirm all meta tags present
- Test: `"GET / should contain og:title meta tag"`
- Test: `"GET / should contain favicon link"`

---

## Dependency Graph

```
Phase 0 (Foundation)
  ├─→ Task 0.1 (Route + skeleton)
  └─→ Task 0.2 (Design tokens) ← depends on 0.1
        └─→ Phase 1 (Hero)
              ├─→ Task 1.1 (Headline + CTA)
              └─→ Task 1.2 (Animated demo) ← depends on 1.1
                    └─→ Phase 2 (How It Works)
                          └─→ Task 2.1 (Pipeline visual)
                                └─→ Phase 3 (Features)
                                      └─→ Task 3.1 (Feature cards)
                                            └─→ Phase 4 (Live Example)
                                                  └─→ Task 4.1 (Verdict preview)
                                                        └─→ Phase 5 (Tech Showcase)
                                                              └─→ Task 5.1 (Opus showcase)
                                                                    └─→ Phase 6 (CTA Footer)
                                                                          └─→ Task 6.1 (CTA + footer)
                                                                                └─→ Phase 7 (Polish)
                                                                                      ├─→ Task 7.1 (Animations)
                                                                                      └─→ Task 7.2 (Meta tags)
```
