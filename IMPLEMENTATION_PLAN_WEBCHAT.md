# ForwardCheck-AI — Web Chat Implementation Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

---

## Phase 0: Chat Backend Foundation

### Task 0.1: Chat API route and input validation
- [x]
**Objective:** Create a POST `/api/chat/message` endpoint that accepts a claim from the web chat, validates input (10-5000 chars, HTML sanitized), creates an investigation, kicks off the pipeline in the background, and returns the investigation ID for SSE subscription.
**Details:**
- Create `src/server/routes/chat.ts` — exports `createChatRouter(repo, pipeline, eventBus)`
- `POST /api/chat/message` — body: `{ message: string }`
- Validate: `message` must be a string, trimmed length between 10 and 5000 characters
- Sanitize: strip all HTML tags from input (basic regex strip or entity encoding)
- Create investigation in DB via `repo.create(message)` with null telegram fields
- Trigger `pipeline.investigate(message, { onInvestigationCreated })` in background (do NOT await)
- Return `{ id, status: "pending", streamUrl: "/api/live/<id>/stream" }` with HTTP 201
- If validation fails, return 400 with descriptive error: `{ error: "Message must be between 10 and 5000 characters" }`
- Wire route into Express app via `app.use(createChatRouter(repo, pipeline, eventBus))`
**Validation:**
- Test file: `tests/unit/server/routes/chat.test.ts`
- Test: `"POST /api/chat/message should create investigation and return id with streamUrl"`
- Test: `"POST /api/chat/message should reject message shorter than 10 characters"`
- Test: `"POST /api/chat/message should reject message longer than 5000 characters"`
- Test: `"POST /api/chat/message should reject missing message field"`
- Test: `"POST /api/chat/message should strip HTML tags from input"`
- Cleanup: test database cleaned after each test

### Task 0.2: Per-IP rate limiting middleware
- [x]
**Objective:** Create rate limiting middleware that restricts each IP address to 10 investigation requests per 60-second sliding window.
**Details:**
- Create `src/server/middleware/rate-limit.ts` — exports `createRateLimiter(maxRequests, windowMs)`
- In-memory Map of `IP → { count, windowStart }` entries
- When request arrives: if within window and count < max, increment; if window expired, reset; if count >= max, reject with 429
- Return 429 with `{ error: "Too many requests. Please wait before checking another claim." }` and `Retry-After` header
- Clean stale entries every 60 seconds (setInterval) to prevent memory leak
- Export a cleanup function for test teardown
- Apply middleware to `POST /api/chat/message` route only
**Validation:**
- Test file: `tests/unit/server/middleware/rate-limit.test.ts`
- Test: `"should allow requests under the limit"`
- Test: `"should reject requests exceeding the limit with 429"`
- Test: `"should reset count after window expires"`
- Test: `"should track different IPs independently"`
- Test: `"should include Retry-After header on 429 response"`
- Cleanup: call cleanup function after tests

### Task 0.3: Mount chat routes in app.ts
- [x]
**Objective:** Wire the chat router and rate limiter into the Express app, ensuring it works alongside existing routes.
**Details:**
- Import `createChatRouter` in `src/server/app.ts`
- Mount chat routes when repo, pipeline, and eventBus are all provided
- Import and apply `createRateLimiter` to the chat route
- Ensure existing routes (`/health`, `/api/investigate`, `/v/:id`, `/live/:id`, `/api/live/:id/stream`) are unaffected
- Ensure the chat route is mounted BEFORE the 404 handler
**Validation:**
- Test file: `tests/unit/server/routes/chat-integration.test.ts`
- Test: `"POST /api/chat/message should return 201 when all dependencies provided"`
- Test: `"GET /health should still return 200 after chat routes mounted"`
- Test: `"existing API routes should remain functional"`
- Cleanup: test database cleaned after tests

---

## Phase 1: Chat Page Scaffold

### Task 1.1: Chat page route and EJS skeleton
- [x]
**Objective:** Add `GET /chat` route that renders a new `chat.ejs` template with the existing design system.
**Details:**
- Create `src/server/views/chat.ejs` — full HTML page skeleton
- Include `_design-tokens.ejs` for shared CSS variables
- Include `_chat-styles.ejs` for chat-specific styles (create empty placeholder)
- Include Bootstrap 5 CDN, Google Fonts CDN (Satoshi, DM Mono, Instrument Serif — same as live page)
- Favicon: same SVG shield/check as other pages
- Topbar: "ForwardCheck" brand left, "Home" link right (to `/`)
- Empty `<main class="fc-chat-wrapper">` ready for sections
- Add `GET /chat` route in `src/server/app.ts`
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts`
- Test: `"GET /chat should return 200"`
- Test: `"GET /chat should contain ForwardCheck in response body"`
- Test: `"GET /chat should include design token CSS variables"`

### Task 1.2: Chat design tokens and styles partial
- [x]
**Objective:** Create `_chat-styles.ejs` with the foundational layout styles for the chat page, following the live page's glass-morphism dark theme.
**Details:**
- Create `src/server/views/_chat-styles.ejs`
- `.fc-chat-wrapper` — max-width 900px, centered, min-height 100vh, padding
- Chat header area styles — centered headline, subtitle
- Glass-morphism card pattern: `background: rgba(18, 18, 26, 0.7)`, `backdrop-filter: blur(20px)`, `border: 1px solid var(--fc-border)`
- Base responsive breakpoints: 375px, 768px, 1440px
- `prefers-reduced-motion` media query skeleton
- Follow exact same naming convention as `_live-styles.ejs` (prefix all classes with `fc-chat-*`)
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend existing)
- Test: `"GET /chat should include fc-chat-wrapper class"`
- Test: `"GET /chat should include glass-morphism backdrop-filter styles"`
- Visually verify: page loads with dark theme, no console errors

---

## Phase 2: Chat Input Component

### Task 2.1: Message input with character counter, submit button, clear button
- [x]
**Objective:** Build the chat input area with a textarea, character counter (10-5000), submit button ("Investigate This"), and clear button.
**Details:**
- Add input section to `chat.ejs`:
  - `<textarea>` with placeholder: "Paste a message that seems off... or type a claim you want checked"
  - Character counter showing `X / 5,000` — turns red below 10 or above 5000
  - Submit button: "Investigate This" — disabled when input is invalid (< 10 or > 5000 chars)
  - Clear button (X icon) — visible only when textarea has content
- Input area container: sticky at bottom on mobile, inline on desktop
- Glass-morphism card styling for the input container
- Auto-resize textarea (grows with content, max 200px height)
- Add styles to `_chat-styles.ejs`
- Use `frontend-design` skill for the visual implementation
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain textarea with placeholder text"`
- Test: `"GET /chat should contain Investigate This submit button"`
- Test: `"GET /chat should contain character counter element"`
- Visually verify: input renders, counter updates, button enables/disables

### Task 2.2: Form submission handler — POST to API and handle response
- [x]
**Objective:** Add JavaScript to handle form submission: POST the message to `/api/chat/message`, handle success (start SSE), and handle errors (display inline).
**Details:**
- Create `src/server/views/_chat-script.ejs` — all chat JavaScript
- Include `_chat-script.ejs` at bottom of `chat.ejs`
- On submit: disable button, show "Sending..." state, POST to `/api/chat/message`
- On success (201): extract `id` and `streamUrl` from response, transition to investigation view
- On error (400): show validation error inline below textarea (red text, shake animation)
- On error (429): show rate limit message with countdown to retry
- On network error: show "Connection lost. Check your internet and try again."
- Prevent double-submit (debounce)
- Use `fetch()` API, no external libraries
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should include _chat-script.ejs JavaScript"`
- Test: `"GET /chat should contain fetch call to /api/chat/message"`
- Visually verify: submit flow works end-to-end with running server

---

## Phase 3: SSE Integration & Investigation Timeline

### Task 3.1: SSE client connection and event handling
- [x]
**Objective:** After a successful POST, connect to the SSE stream and handle all 15 pipeline event types, following the exact same patterns as `_live-agent-script.ejs`.
**Details:**
- In `_chat-script.ejs`: after POST success, create `new EventSource(streamUrl)`
- Handle all event types from the existing live page:
  - `pipeline:start`, `classifier:start`, `classifier:complete`
  - `strategist:start`, `strategist:complete`
  - `investigators:start`, `investigator:searching`, `investigator:complete`
  - `disagreement:detected`
  - `da:start`, `da:complete`
  - `judge:start`, `judge:complete`
  - `pipeline:complete`, `pipeline:error`
- On `pipeline:complete`: close EventSource, show verdict inline
- On `pipeline:error`: close EventSource, show error message
- On connection error (`onerror`): show "Connection dropped. Reconnecting..." message
- Reuse the same event parsing pattern as `live.ejs` (JSON.parse on e.data)
- Add elapsed time counter (same pattern as live page)
- Add API cost tracker (same pattern as live page)
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain EventSource connection code"`
- Test: `"GET /chat should handle all pipeline event types"`
- Test: `"GET /chat should include elapsed time counter"`

### Task 3.2: Investigation timeline component — 6 stages with status indicators
- [x]
**Objective:** Build the investigation timeline that appears after submission, showing 6 pipeline stages with real-time status updates (idle, active, complete).
**Details:**
- Add timeline section to `chat.ejs` (hidden by default, shown after POST success)
- Display the original message in a quote card (same style as live page `.fc-live-message`)
- 6 timeline stages displayed as a vertical list:
  1. **Classifier** — "Scanning your message against 47 known tricks..."
  2. **Strategist** — "Deciding what to search, where to look, and what would prove it wrong..."
  3. **Investigators** (x3) — "Three agents hit the web at once. Searching for evidence..."
  4. **Devil's Advocate** — "The Devil's Advocate just entered the room..."
  5. **Judge** — "All evidence weighed. The Judge is deciding your verdict..."
  6. **Verdict** — "The gavel drops."
- Each stage: icon, name, model badge (Haiku/Sonnet/Opus), status text, progress indicator
- Stage states: idle (dimmed), active (amber glow + pulse), complete (green check)
- Use same agent card HTML/CSS patterns as `_live-agent-cards.ejs` and `_live-styles.ejs`
- Segmented progress bar at top (same as live page)
- Add styles to `_chat-styles.ejs`
- Use `frontend-design` skill
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain timeline stage elements"`
- Test: `"GET /chat should contain progress bar segments"`
- Test: `"GET /chat should contain model tier badges"`
- Visually verify: timeline renders with correct stage names and icons

### Task 3.3: Real-time agent cards — show findings as investigators complete
- [x]
**Objective:** Update timeline cards in real-time as SSE events arrive: show classifier result, strategist falsification criteria, investigator confidence scores, DA outcome, and Judge thinking excerpts.
**Details:**
- In `_chat-script.ejs`: wire SSE events to timeline DOM updates
- On `classifier:complete`: show extracted claim and category tag
- On `strategist:complete`: show falsification criteria snippet, thinking excerpt
- On `investigator:complete`: show confidence score badge and summary for each role
- On `disagreement:detected`: show amber alert ("Investigators disagree. Escalating to deep reasoning...")
- On `da:complete`: show counter-argument outcome badge (held/defeated), thinking excerpt
- On `judge:complete`: show "The gavel drops" with thinking excerpt
- Status text cycling during long waits (same `startStatusCycle`/`stopStatusCycle` pattern as live page)
- Entrance animations when cards activate (same `fc-card-entering` pattern)
- Use exact same JavaScript helper functions as `_live-agent-script.ejs` (setCardState, escapeHtml, etc.)
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain setCardState helper function"`
- Test: `"GET /chat should contain escapeHtml helper function"`
- Test: `"GET /chat should contain status cycling functions"`
- Visually verify with running server: cards update as events flow

---

## Phase 4: Inline Verdict Display

### Task 4.1: Verdict reveal animation and badge display
- [x]
**Objective:** When `pipeline:complete` fires, reveal the verdict inline with a dramatic animation sequence: pause, badge, confidence ring.
**Details:**
- Add verdict reveal section to `chat.ejs` (hidden by default)
- On `pipeline:complete`:
  1. Brief dramatic pause (dark overlay flash — same as live page `.fc-verdict-reveal-pause`)
  2. Verdict badge appears with category + color (scale + fade animation)
  3. Confidence ring draws in (SVG circle animation)
  4. Summary text fades up
- Verdict badge colors: likely-true (green), partially-true (amber), unverified (gray), likely-false (red), satire (purple), opinion (blue)
- Reuse exact same verdict reveal CSS from `_live-styles.ejs` (`.fc-verdict-reveal-*` classes)
- Add styles to `_chat-styles.ejs`
- Use `frontend-design` skill
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain verdict reveal section"`
- Test: `"GET /chat should contain confidence ring SVG"`
- Test: `"GET /chat should contain verdict badge color classes"`

### Task 4.2: Confidence decomposition bars and verdict summary
- [x]
**Objective:** Display the 4-component confidence decomposition as horizontal bar charts inline, plus the 3-line verdict summary and manipulation techniques.
**Details:**
- After the confidence ring reveals, show:
  - 4 decomposition bars: Evidence Strength, Source Reliability, Claim Complexity, Counter-Argument Resilience
  - Each bar: label, track, animated fill (width transitions from 0 to score%)
  - Bar colors: gradient from amber to green (same as live page `.fc-reveal-bar-fill`)
- Verdict summary: 3-line text below the ring (Instrument Serif, muted color)
- Manipulation techniques: if present, show as small tag pills (technique name + severity)
- "Deep Reasoning Mode" badge if `deepReasoningActivated` is true
- Reuse bar chart CSS from live page verdict reveal styles
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain decomposition bar elements"`
- Test: `"GET /chat should contain manipulation techniques section"`

### Task 4.3: Action buttons — View Full Analysis, Check Another Claim, Share
- [x]
**Objective:** After verdict reveals, show action buttons that let the user dig deeper, check another claim, or share the result.
**Details:**
- 3 action buttons below the verdict:
  1. **"See the Full Breakdown"** — links to `/v/<investigationId>` (primary green button)
  2. **"Check Another Claim"** — resets the chat to input state (secondary outline button)
  3. **"Share This Verdict"** — copies verdict URL to clipboard with "Copied!" feedback (ghost button)
- "Check Another Claim" resets: hides verdict, hides timeline, clears textarea, shows input area
- "Share This Verdict" uses `navigator.clipboard.writeText()` with fallback
- Button styles: follow existing CTA patterns from live page (`.fc-verdict-reveal-cta`)
- Pipeline metadata line: "Investigated in X seconds | API cost: $X.XX"
- Add styles to `_chat-styles.ejs`
- Use `frontend-design` skill
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain View Full Analysis link"`
- Test: `"GET /chat should contain Check Another Claim button"`
- Test: `"GET /chat should contain Share This Verdict button"`

---

## Phase 5: Error Handling & Edge Cases

### Task 5.1: Error states — empty input, timeout, rate limit, network drop
- [x]
**Objective:** Handle all error states with clear, helpful messages following Power Writing copy guidelines.
**Details:**
- **Empty/short input** (< 10 chars): "Give your claim a bit more detail. We need at least 10 characters to investigate."
- **Too long** (> 5000 chars): "That message is too long. Trim it to 5,000 characters or paste just the claim."
- **Rate limit** (429): "You've checked 10 claims in the last minute. Take a breath — try again in X seconds."
- **Network error**: "Lost connection. Check your internet and try again." with retry button
- **Pipeline timeout** (> 120s no events): "This investigation is taking longer than expected. You can wait or check back at /v/<id>."
- **SSE connection drop**: Auto-reconnect (EventSource default), show reconnecting message
- All error messages: inline below the input area, red border accent, dismiss on new input
- Shake animation on input area for validation errors
- Add error state styles to `_chat-styles.ejs`
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain error display elements"`
- Test: `"GET /chat should contain rate limit error message template"`
- Test: `"GET /chat should contain network error message template"`

### Task 5.2: Non-factual message handling — opinion, satire, greeting
- [x]
**Objective:** When the classifier returns a non-factual category, display a friendly inline response instead of running the full pipeline.
**Details:**
- Listen for `classifier:complete` event where `result.category` is not `factual_claim`
- Display category-specific messages inline (without running investigators):
  - **opinion**: "That looks like an opinion, not a fact. ForwardCheck investigates claims that can be verified — try pasting something specific."
  - **satire**: "This reads like satire. Good news — you probably don't need to fact-check a joke."
  - **greeting**: "Hey! Paste a suspicious message and hit 'Investigate This' to get started."
  - **other**: "Not sure what to do with this one. Try pasting a specific claim — something like 'WHO says green tea cures cancer.'"
- Show the non-factual response in a styled card (blue accent border, lighter tone)
- Include "Check Another Claim" button
- Close the EventSource (no need to keep listening)
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain non-factual response templates"`
- Test: `"GET /chat should contain opinion category handler"`
- Test: `"GET /chat should contain greeting category handler"`

### Task 5.3: SSE fallback — polling for browsers without EventSource
- [x]
**Objective:** Add a polling fallback for the rare case where `EventSource` is not available (e.g., old browsers, corporate proxies).
**Details:**
- In `_chat-script.ejs`: check `typeof EventSource !== 'undefined'`
- If EventSource unavailable: fall back to polling `GET /api/investigation/:id` every 3 seconds
- Poll response statuses: `pending` → keep polling, `investigating` → update timeline, `completed` → fetch final result and display verdict
- Show a subtle banner: "Real-time updates unavailable. Checking for updates every few seconds."
- Stop polling when investigation completes or after 3 minutes (timeout)
- Same visual result as SSE path — just without real-time stage updates
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain EventSource availability check"`
- Test: `"GET /chat should contain polling fallback code"`
- Test: `"GET /chat should contain polling interval of 3000ms"`

---

## Phase 6: Responsive Design & Cross-Browser

### Task 6.1: Mobile layout (375px) — sticky input, vertical timeline
- [x]
**Objective:** Optimize the chat page for mobile devices (375px width) with a sticky bottom input and vertical timeline.
**Details:**
- Input area: sticky at bottom of viewport on mobile (position: sticky, bottom: 0)
- Add safe area padding for iOS (env(safe-area-inset-bottom))
- Timeline: full-width vertical stack (no horizontal layouts)
- Agent cards: compact padding, smaller icons and fonts
- Progress bar: hide text labels on small screens (same as live page)
- Verdict reveal: smaller confidence ring (110px), compact bars
- Touch-friendly: minimum 44px tap targets on all buttons
- Test at 375px viewport in Chrome DevTools
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should include mobile responsive styles"`
- Test: `"GET /chat should include sticky input position for mobile"`
- Visually verify: page renders correctly at 375px

### Task 6.2: Tablet and desktop optimization (768px, 1440px)
- [x]
**Objective:** Optimize layout for tablet (768px) and large desktop (1440px) viewports.
**Details:**
- Tablet (768px): input area inline (not sticky), timeline cards with more breathing room
- Desktop (1440px): max-width 900px centered, larger fonts and spacing
- Investigator cards: 3-up horizontal grid on desktop (same as live page `.fc-investigator-row`), stack on mobile
- Input textarea: wider on desktop, auto-height with max 200px
- Verdict reveal: full-size confidence ring (160px) on desktop
- Ensure no horizontal scroll at any breakpoint
- Test at 768px and 1440px viewports
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should include tablet breakpoint styles at 768px"`
- Test: `"GET /chat should include desktop max-width of 900px"`
- Visually verify: page renders correctly at 768px and 1440px

### Task 6.3: Accessibility — prefers-reduced-motion, ARIA labels, keyboard navigation
- [x]
**Objective:** Ensure the chat page meets accessibility standards: reduced motion support, ARIA labels, and full keyboard navigation.
**Details:**
- `prefers-reduced-motion`: disable all animations (pulse, shake, slide-in, verdict reveal sequence)
- ARIA labels on all interactive elements:
  - Textarea: `aria-label="Enter a claim to fact-check"`
  - Submit button: `aria-label="Submit claim for investigation"`
  - Clear button: `aria-label="Clear input"`
  - Character counter: `aria-live="polite"` for screen reader updates
  - Timeline stages: `role="status"`, `aria-live="polite"`
  - Verdict badge: `role="alert"`
- Keyboard navigation: Tab through input → submit → clear → action buttons
- Focus visible styles (outline on focus for all interactive elements)
- Skip to main content link (hidden, visible on focus)
- Color contrast: all text meets WCAG 2.1 AA (4.5:1 ratio minimum)
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should include prefers-reduced-motion media query"`
- Test: `"GET /chat should include ARIA labels on interactive elements"`
- Test: `"GET /chat should include aria-live regions for dynamic content"`

---

## Phase 7: Polish & Integration

### Task 7.1: Scroll animations and micro-interactions
- [x]
**Objective:** Add subtle entrance animations and micro-interactions for a polished demo experience.
**Details:**
- Verdict reveal: staggered animation sequence (badge → ring → bars → summary → buttons) with delays
- Input area: subtle glow effect on focus (green border glow)
- Submit button: loading spinner inside button during API call
- Character counter: smooth color transition as count approaches limits
- Timeline stage transitions: slide-up entrance when stage activates
- All animations respect `prefers-reduced-motion`
- Pure CSS + minimal vanilla JS (no animation libraries)
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should include animation keyframes"`
- Test: `"GET /chat should respect prefers-reduced-motion for all animations"`
- Visually verify: animations are smooth, no layout shifts

### Task 7.2: Landing page CTA update — add "Check in Browser" button linking to /chat
- [ ]
**Objective:** Add a secondary CTA on the landing page that links to the web chat, giving users a browser-based option alongside Telegram.
**Details:**
- In `landing.ejs` hero section: add "Check in Your Browser" secondary CTA button next to the Telegram CTA
- Button style: outline/ghost style (not competing with primary Telegram CTA)
- Link to `/chat`
- In the CTA footer section: add same "Check in Browser" option
- Copy: "No app needed. Check a claim right here in your browser."
**Validation:**
- Test file: `tests/unit/server/routes/landing.test.ts` (extend existing)
- Test: `"GET / should contain link to /chat"`
- Test: `"GET / should contain Check in Your Browser CTA text"`

### Task 7.3: Meta tags and OG tags for /chat page
- [ ]
**Objective:** Add proper meta tags, Open Graph tags, and Twitter card tags to the chat page for professional sharing.
**Details:**
- `<title>`: "Check Any Claim — ForwardCheck-AI"
- `<meta name="description">`: "Paste a suspicious message. Six AI agents investigate it in 60 seconds. Get the truth, the tricks, and the confidence score."
- OG tags: `og:title`, `og:description`, `og:type` (website), `og:url`
- Twitter card: `twitter:card` (summary_large_image), `twitter:title`, `twitter:description`
- Canonical URL: `/chat`
- Favicon: same SVG shield/check as other pages
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain og:title meta tag"`
- Test: `"GET /chat should contain meta description"`
- Test: `"GET /chat should contain twitter:card meta tag"`

---

## Dependency Graph

```
Phase 0 (Chat Backend Foundation)
  ├─→ Task 0.1 (Chat API route + validation)
  ├─→ Task 0.2 (Rate limiting middleware) ← independent of 0.1
  └─→ Task 0.3 (Mount in app.ts) ← depends on 0.1 + 0.2
        └─→ Phase 1 (Chat Page Scaffold)
              ├─→ Task 1.1 (Route + EJS skeleton)
              └─→ Task 1.2 (Styles partial) ← depends on 1.1
                    └─→ Phase 2 (Chat Input)
                          ├─→ Task 2.1 (Input component)
                          └─→ Task 2.2 (Form submission handler) ← depends on 2.1
                                └─→ Phase 3 (SSE + Timeline)
                                      ├─→ Task 3.1 (SSE client)
                                      ├─→ Task 3.2 (Timeline component) ← depends on 3.1
                                      └─→ Task 3.3 (Real-time cards) ← depends on 3.1 + 3.2
                                            └─→ Phase 4 (Verdict Display)
                                                  ├─→ Task 4.1 (Verdict reveal)
                                                  ├─→ Task 4.2 (Decomposition bars) ← depends on 4.1
                                                  └─→ Task 4.3 (Action buttons) ← depends on 4.1
                                                        └─→ Phase 5 (Error Handling)
                                                              ├─→ Task 5.1 (Error states)
                                                              ├─→ Task 5.2 (Non-factual handling)
                                                              └─→ Task 5.3 (SSE fallback)
                                                                    └─→ Phase 6 (Responsive + A11y)
                                                                          ├─→ Task 6.1 (Mobile 375px)
                                                                          ├─→ Task 6.2 (Tablet + Desktop)
                                                                          └─→ Task 6.3 (Accessibility)
                                                                                └─→ Phase 7 (Polish)
                                                                                      ├─→ Task 7.1 (Animations)
                                                                                      ├─→ Task 7.2 (Landing page CTA)
                                                                                      └─→ Task 7.3 (Meta tags)
```
