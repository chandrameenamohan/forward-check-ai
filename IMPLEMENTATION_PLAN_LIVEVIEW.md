# ForwardCheck-AI — Live Verdict Page Implementation Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

---

## Context

The "See Live Verdict" page shows users the 6-agent pipeline working on their claim in real-time. Instead of waiting ~60s for a result, users watch agents activate, search, reason, challenge, and deliver a verdict — like watching a courtroom drama unfold.

**Why this matters for the hackathon demo video (30% of judging):** This page IS the demo. It makes the invisible visible. Judges see not just "a bot that fact-checks" but the entire investigative process — Opus 4.6 thinking through strategy, three investigators searching in parallel, the Devil's Advocate attacking the consensus, and the Judge weighing evidence.

**Current state:** Pipeline emits 5 coarse stages via `onStatusUpdate` callback (planning, searching, analyzing, challenging, judging). No SSE/WebSocket. Verdict page at `/v/:id` is static (completed investigations only). `verdict-pending.ejs` exists but is a blank placeholder.

---

## Phase 0: Pipeline Event System

### Task 0.1: Create typed pipeline event emitter
- [x]
**Objective:** Build a typed EventEmitter that the pipeline uses to broadcast granular progress events to any number of listeners (SSE clients, Telegram status updater, etc.).
**Details:**
- Create `src/orchestrator/pipeline-events.ts`
- Define `PipelineEvent` discriminated union type with these event kinds:
  - `pipeline:start` — `{ investigationId, message, timestamp }`
  - `classifier:start` — `{ investigationId, timestamp }`
  - `classifier:complete` — `{ investigationId, result: ClassifierResult, costUsd, timestamp }`
  - `strategist:start` — `{ investigationId, claim, timestamp }`
  - `strategist:complete` — `{ investigationId, strategy: SearchStrategy, costUsd, thinkingExcerpt?, timestamp }`
  - `investigators:start` — `{ investigationId, roles: string[], timestamp }`
  - `investigator:searching` — `{ investigationId, role, query, timestamp }`
  - `investigator:complete` — `{ investigationId, role, report: AgentReport, costUsd, timestamp }`
  - `disagreement:detected` — `{ investigationId, spread, confidenceScores, timestamp }`
  - `da:start` — `{ investigationId, effortLevel, timestamp }`
  - `da:complete` — `{ investigationId, report: ChallengeReport, costUsd, thinkingExcerpt?, timestamp }`
  - `judge:start` — `{ investigationId, timestamp }`
  - `judge:complete` — `{ investigationId, verdict: FinalVerdict, costUsd, thinkingExcerpt?, timestamp }`
  - `pipeline:complete` — `{ investigationId, verdict: FinalVerdict, totalCostUsd, durationMs, timestamp }`
  - `pipeline:error` — `{ investigationId, error: string, stage, timestamp }`
- Class `PipelineEventBus` extends `EventEmitter`:
  - Method `emit(event: PipelineEvent)` — typed emit
  - Method `subscribe(investigationId, callback)` — filter events for one investigation
  - Method `getHistory(investigationId)` — returns all past events for catch-up
  - Stores event history per investigation in a `Map` (TTL: 30 min, auto-cleanup)
- Export singleton `pipelineEventBus` instance
**Validation:**
- Test file: `tests/unit/orchestrator/pipeline-events.test.ts`
- Test: `"should emit and receive typed pipeline events"`
- Test: `"should filter events by investigationId in subscribe"`
- Test: `"should store event history for catch-up"`
- Test: `"should auto-cleanup expired event history"`
- Test: `"should handle multiple subscribers for same investigation"`

### Task 0.2: Integrate event bus into pipeline orchestrator
- [x]
**Objective:** Modify `InvestigationPipeline` to emit granular events via `PipelineEventBus` at every sub-step, in addition to the existing `onStatusUpdate` callback.
**Details:**
- Update `src/orchestrator/pipeline.ts`:
  - Accept `PipelineEventBus` in constructor (optional, for backward compat)
  - Emit `pipeline:start` at the beginning
  - Emit `classifier:start` before calling `runClassifier`, `classifier:complete` after
  - Emit `strategist:start` before, `strategist:complete` after (include thinking excerpt)
  - Emit `investigators:start` before `Promise.allSettled`, `investigator:complete` for each success
  - Emit `disagreement:detected` when spread > 30
  - Emit `da:start` before, `da:complete` after
  - Emit `judge:start` before, `judge:complete` after
  - Emit `pipeline:complete` at the end
  - Emit `pipeline:error` in catch blocks
- Existing `onStatusUpdate` callback continues to work (no breaking change)
- Each event includes `timestamp: Date.now()`
**Validation:**
- Test file: `tests/unit/orchestrator/pipeline-events-integration.test.ts`
- Test: `"should emit classifier:start and classifier:complete events"` (mock agents)
- Test: `"should emit all pipeline events in correct order for factual claim"` (mock agents)
- Test: `"should emit pipeline:error on agent failure"`
- Test: `"should still call onStatusUpdate callback"` (backward compat)
- Test: `"should work without event bus"` (optional param)
- Existing pipeline tests must still pass

---

## Phase 1: SSE Streaming Endpoint

### Task 1.1: Create SSE endpoint for live investigation streaming
- [x]
**Objective:** Build the Server-Sent Events endpoint that streams pipeline events to the browser in real-time.
**Details:**
- Create `src/server/routes/live-stream.ts`
- `GET /api/live/:id/stream` — SSE endpoint
  - Set headers: `Content-Type: text/event-stream`, `Cache-Control: no-cache`, `Connection: keep-alive`
  - Immediately flush all historical events for this investigation (catch-up)
  - Subscribe to `pipelineEventBus` for new events
  - Format events as SSE: `event: <kind>\ndata: <JSON>\n\n`
  - Send keepalive comment (`:\n\n`) every 15 seconds
  - Clean up subscription on client disconnect (`req.on('close')`)
  - Return 404 if investigation doesn't exist in DB
- Wire route into Express app in `src/server/app.ts`
**Validation:**
- Test file: `tests/unit/server/routes/live-stream.test.ts`
- Test: `"GET /api/live/:id/stream should return SSE content type"`
- Test: `"should flush historical events on connect"`
- Test: `"should stream new events as they arrive"`
- Test: `"should return 404 for non-existent investigation"`
- Test: `"should clean up subscription on disconnect"`

### Task 1.2: Wire event bus into application entry point
- [x]
**Objective:** Create and inject the `PipelineEventBus` singleton into the pipeline and SSE route.
**Details:**
- Update `src/index.ts`:
  - Import and create `PipelineEventBus` instance
  - Pass event bus to `InvestigationPipeline` constructor
  - Pass event bus to SSE route factory
- Update `src/server/app.ts`:
  - Accept optional `PipelineEventBus` in `createApp()` params
  - Mount live-stream route when event bus is provided
**Validation:**
- Test file: `tests/unit/server/routes/live-stream-integration.test.ts`
- Test: `"should stream events from pipeline through SSE endpoint"` — create investigation via API, run pipeline with mock agents, verify SSE client receives events
- Existing app startup tests must still pass

---

## Phase 2: Live Verdict Page — Foundation

### Task 2.1: Create live verdict route and page skeleton
- [x]
**Objective:** Add `GET /live/:id` route that renders a new `live.ejs` template with the established design system.
**Details:**
- Create `src/server/views/live.ejs` — full HTML page skeleton
- Create `src/server/views/_live-styles.ejs` — CSS for live page, includes `_design-tokens.ejs`
- Add `GET /live/:id` route in live-stream router:
  - Loads investigation from DB
  - Returns 404 if not found
  - If already completed, redirect to `/v/:id`
  - Renders `live` template with `{ id, originalMessage, status }`
- Page structure:
  - Same dark theme, fonts, noise texture as landing/verdict pages
  - Top: ForwardCheck brand bar
  - Center: original message card + empty pipeline visualization area
  - SSE connection script at bottom
- Include `_design-tokens.ejs` for shared styling
**Validation:**
- Test file: `tests/unit/server/routes/live.test.ts`
- Test: `"GET /live/:id should return 200 for pending investigation"`
- Test: `"GET /live/:id should redirect to /v/:id for completed investigation"`
- Test: `"GET /live/:id should return 404 for non-existent id"`
- Test: `"GET /live/:id should contain SSE connection script"`

### Task 2.2: SSE client and event dispatcher
- [x]
**Objective:** Build the client-side JavaScript that connects to the SSE endpoint and dispatches events to the page UI.
**Details:**
- Add to `live.ejs` (inline `<script>`):
  - `const evtSource = new EventSource('/api/live/<%= id %>/stream')`
  - Listen for each event type: `classifier:start`, `classifier:complete`, `strategist:start`, etc.
  - Dispatch to UI update functions (stubbed for now): `updateClassifier(data)`, `updateStrategist(data)`, etc.
  - Handle `pipeline:complete` — show verdict, auto-redirect to `/v/:id` after 5 seconds
  - Handle `pipeline:error` — show error message
  - Handle connection errors — show "Reconnecting..." message
  - Close EventSource when done
- Visual: show "Connecting to investigation..." spinner on page load
**Validation:**
- Test: `"GET /live/:id should contain EventSource connection code"`
- Test: `"GET /live/:id should contain event handler for pipeline:complete"`
- Manual validation: start server, create investigation, open `/live/:id`, verify SSE connects

---

## Phase 3: Live Verdict Page — Agent Visualization

### Task 3.1: Original message card and pipeline progress header
- [x]
**Objective:** Display the forwarded message being investigated and an overall progress indicator at the top of the live page.
**Details:**
- Add to `live.ejs`:
  - **Message card:** Telegram-style forwarded message bubble (reuse styling from landing page demo card — blue left border, "Forwarded claim" label, message text)
  - **Progress header:** "Investigating your claim..." with elapsed time counter (JS `setInterval`)
  - **Progress bar:** 6 segments (one per agent step), fill as events arrive
  - **Cost tracker:** Small muted text showing running API cost (updates on each `:complete` event)
- CSS in `_live-styles.ejs`: glass-morphism cards, progress bar with gradient segments
- Use `frontend-design` skill for styling
**Validation:**
- Test: `"GET /live/:id should contain original message card"`
- Test: `"GET /live/:id should contain progress bar with 6 segments"`
- Manual: verify message displays, timer counts up

### Task 3.2: Classifier and Strategist agent cards
- [x]
**Objective:** Build the visual cards for Classifier and Strategist agents that activate and show results in real-time via SSE events.
**Details:**
- Add to `live.ejs`:
  - **Classifier card:**
    - Idle state: dimmed, gray border, brain icon, "Classifier" label, "Haiku" badge
    - Active state (`classifier:start`): pulsing border, spinner, "Classifying your message..."
    - Complete state (`classifier:complete`): green border, checkmark, shows category + extracted claim
  - **Strategist card:**
    - Idle → Active (`strategist:start`): "Planning investigation strategy..."
    - Complete (`strategist:complete`): shows falsification criteria summary, "Opus 4.6" badge glows
    - If thinking excerpt available, show truncated thinking text with "AI Reasoning" label
- Cards stacked vertically with connecting line between them
- CSS: transitions for state changes (opacity, border-color, transform)
- JS: `updateClassifier(data)` and `updateStrategist(data)` functions update DOM
- Use `frontend-design` skill
**Validation:**
- Test: `"GET /live/:id should contain classifier agent card"`
- Test: `"GET /live/:id should contain strategist agent card"`
- Test: `"GET /live/:id should contain model tier badges"`
- Manual: verify state transitions look smooth

### Task 3.3: Investigator cards — parallel visualization
- [x]
**Objective:** Build 3 investigator cards that activate simultaneously and show parallel progress — the "three detectives on the case" moment.
**Details:**
- Add to `live.ejs`:
  - **3 investigator cards** in a horizontal row (desktop) / vertical stack (mobile):
    1. Source Verification — magnifying glass icon, "Sonnet" badge
    2. Domain Expertise — book icon, "Sonnet" badge
    3. Pattern Matching — puzzle icon, "Sonnet" badge
  - `investigators:start` event: all 3 cards pulse simultaneously
  - `investigator:searching` event: show "Searching: [query]" text under the active card
  - `investigator:complete` event: card shows green checkmark, confidence score, brief summary
  - If one fails, show amber "Failed" state (pipeline continues with remaining)
- **Disagreement detection:**
  - `disagreement:detected` event: flash amber warning, show "Investigators disagree — escalating to Deep Reasoning"
- CSS: cards have staggered entrance animation, parallel pulse effect
- Use `frontend-design` skill
**Validation:**
- Test: `"GET /live/:id should contain 3 investigator cards"`
- Test: `"GET /live/:id should contain investigator role labels"`
- Manual: verify parallel activation looks compelling

### Task 3.4: Devil's Advocate card with thinking visualization
- [x]
**Objective:** Build the DA card that shows adversarial reasoning in action — the "courtroom cross-examination" moment.
**Details:**
- Add to `live.ejs`:
  - **DA card:** flame/sword icon, "Devil's Advocate" label, "Opus 4.6" badge
  - `da:start` event: dramatic entrance — card slides in with red/amber glow, "Challenging the consensus..."
  - If `deepReasoningActivated`: show "Deep Reasoning Mode" badge with brain icon
  - `da:complete` event:
    - Counter-argument **succeeded**: red flash, "Counter-argument held up!" — amber/red verdict badge
    - Counter-argument **failed**: green flash, "Counter-argument defeated" — green confidence badge
    - Show thinking excerpt in a "monologue" style text box (DM Mono font, dim background)
- CSS: dramatic transitions, glow effects, typing-style text reveal for thinking excerpt
- Use `frontend-design` skill
**Validation:**
- Test: `"GET /live/:id should contain devils advocate card"`
- Test: `"GET /live/:id should contain deep reasoning indicator placeholder"`
- Manual: verify dramatic entrance effect

### Task 3.5: Verdict reveal moment
- [ ]
**Objective:** Build the climactic verdict reveal — the last 5 seconds of the demo video that makes judges remember your project.
**Details:**
- Add to `live.ejs`:
  - `judge:start` event: "Weighing all evidence..." with gavel icon
  - `judge:complete` / `pipeline:complete` event — THE REVEAL:
    1. Brief dramatic pause (1s black overlay with subtle pulse)
    2. Verdict badge slides in from bottom (large, color-coded: green/amber/red)
    3. Confidence ring animates from 0% to final value (SVG `stroke-dashoffset` animation)
    4. Summary text fades in
    5. Confidence decomposition bars animate left-to-right
    6. "View Full Analysis" button appears with glow
  - Auto-redirect to `/v/:id` after 8 seconds (with countdown text)
  - "Stay on this page" link to cancel redirect
- CSS: reveal keyframes, staggered animations, dramatic color
- Use `frontend-design` skill
**Validation:**
- Test: `"GET /live/:id should contain verdict reveal container"`
- Test: `"GET /live/:id should contain redirect countdown"`
- Manual: verify reveal sequence timing and visual impact

---

## Phase 4: Copy & Narrative

### Task 4.1: Power Writing copy for all live page elements
- [ ]
**Objective:** Apply Power Writing Playbook to every text string on the live page — turn technical status updates into a compelling narrative.
**Details:**
- Read `skill/POWER_WRITING_PLAYBOOK.md` completely before starting
- Replace all placeholder/generic copy with Power Writing compliant text:
  - **Page title:** Not "Investigation in Progress" — something like "Your Claim, Under the Microscope"
  - **Classifier stage:** Not "Classifying message" — "Scanning for 47 known manipulation patterns"
  - **Strategist stage:** Not "Planning strategy" — "Building your investigation playbook"
  - **Investigators:** Not "Searching sources" — "Three investigators hit the internet simultaneously"
  - **DA stage:** Not "Challenging findings" — "The Devil's Advocate just entered the room"
  - **Judge stage:** Not "Rendering verdict" — "All evidence weighed. Verdict incoming."
  - **Verdict reveal headline:** Apply 25 Headline Exercise — write 10 variations, pick the best
  - **Redirect text:** "Full analysis ready in 8... 7... 6..." (countdown builds anticipation)
- Copy rules (from Playbook):
  - 5th-8th grade reading level
  - Active voice, subject first
  - "You"/"your" everywhere
  - Visual language — make them see it
  - Kill adverbs
**Validation:**
- Read every text string out loud — if it sounds like a press release, rewrite
- Test: all existing tests still pass (no structural changes, only text content)
- Manual: read through the page flow and verify it tells a story

---

## Phase 5: Integration

### Task 5.1: Telegram bot sends live verdict URL
- [ ]
**Objective:** When a user sends a message to the bot, send them a `/live/:id` URL immediately so they can watch the investigation unfold in real-time.
**Details:**
- Update `src/bot/message-handler.ts`:
  - After creating the investigation and starting the pipeline, send a "Watch Live" link: `${baseUrl}/live/${investigationId}`
  - Keep the existing status updater (Telegram message edits) as fallback
  - After pipeline completes, still send the verdict + "View Full Analysis" link to `/v/:id`
- The live page handles the transition: shows real-time progress → verdict reveal → redirect to static page
**Validation:**
- Test file: update `tests/unit/bot/message-handler.test.ts`
- Test: `"should send live verdict URL before starting pipeline"`
- Test: `"should still send final verdict after pipeline completes"`
- Existing message-handler tests must still pass

### Task 5.2: Landing page "Watch a Live Investigation" link
- [ ]
**Objective:** Add a dynamic element on the landing page that links to an active investigation (if one is running) or the most recent completed live view.
**Details:**
- Update `src/server/app.ts` landing route:
  - Pass `recentInvestigationId` to landing template (most recent investigation from DB)
- Update `landing.ejs` hero section:
  - Change "See a live verdict" secondary CTA to link to `/live/<recentId>` if available
  - Fallback to `/v/demo` if no recent investigation
**Validation:**
- Test: `"GET / should contain live verdict link when recent investigation exists"`
- Existing landing page tests must still pass

### Task 5.3: QR code and Telegram bot link integration
- [ ]
**Objective:** Add the Telegram bot QR code and direct link to the live verdict page footer, so demo video viewers can try it themselves.
**Details:**
- Add to `live.ejs` footer area:
  - "Try it yourself" section with QR code image (`/public/telegram-bot-qr-code.jpg`)
  - Direct link to `https://t.me/forward_check_beta_bot`
  - "Forward any suspicious message. Watch this page come alive."
- Serve `public/` directory as static files in Express (if not already)
- Use `frontend-design` skill for the QR code section styling
**Validation:**
- Test: `"GET /live/:id should contain Telegram bot link"`
- Test: `"GET /live/:id should contain QR code reference"`
- Manual: verify QR code renders and link works

---

## Phase 6: Polish & Demo Optimization

### Task 6.1: Entrance animations and transitions
- [ ]
**Objective:** Add smooth entrance animations for agent cards and transitions between states for a polished demo experience.
**Details:**
- Agent card entrance: staggered slide-up with fade (CSS `@keyframes` + JS class toggle on SSE events)
- State transitions: smooth border-color, background-color, opacity transitions (0.5s ease)
- Investigator parallel pulse: synchronized animation on `investigators:start`
- DA dramatic entrance: slide from right with glow trail
- Verdict reveal: choreographed sequence with precise timing
- All animations respect `prefers-reduced-motion`
- No external animation libraries — pure CSS + minimal vanilla JS
**Validation:**
- Manual: watch full investigation flow and verify animations are smooth
- Test: `"GET /live/:id should include animation keyframes"`
- Test: `"GET /live/:id should respect prefers-reduced-motion"`

### Task 6.2: Mobile responsive layout
- [ ]
**Objective:** Ensure the live verdict page works well on mobile (375px) for users clicking the Telegram bot link on their phones.
**Details:**
- Investigator cards: stack vertically on mobile (≤768px)
- Agent cards: full width with reduced padding
- Verdict reveal: adapted sizing for small screens
- Progress bar: simplified on mobile
- QR code section: hidden on mobile (they're already on mobile)
- Test at 375px, 768px, and 1440px
**Validation:**
- Manual: test on mobile viewport
- Test: `"GET /live/:id should have responsive meta tag"`

### Task 6.3: Demo video timing optimization
- [ ]
**Objective:** Fine-tune animation timing so the full live verdict flow looks cinematic in a 60-90 second screen recording.
**Details:**
- Ensure each agent step has enough "screen time" for viewer comprehension:
  - Classifier: ~3s (quick, establishes the claim)
  - Strategist: ~8s (show thinking, build anticipation)
  - Investigators: ~15s (parallel activity is visually rich)
  - DA: ~10s (dramatic entrance, thinking reveal)
  - Judge: ~5s (brief, authoritative)
  - Verdict reveal: ~8s (the climax)
- Add subtle "heartbeat" pulse to active agent card so screen recording shows motion
- Ensure text is large enough to read in a compressed video
- Test with a screen recording to verify pacing
**Validation:**
- Manual: record screen, watch playback, verify readability and pacing
- No code tests — this is visual tuning

---

## Dependency Graph

```
Phase 0 (Pipeline Event System)
  ├─→ Task 0.1 (Event emitter + types)
  └─→ Task 0.2 (Integrate into pipeline) ← depends on 0.1
        └─→ Phase 1 (SSE Streaming)
              ├─→ Task 1.1 (SSE endpoint) ← depends on 0.1
              └─→ Task 1.2 (Wire into app) ← depends on 0.2, 1.1
                    └─→ Phase 2 (Live Page Foundation)
                          ├─→ Task 2.1 (Route + skeleton) ← depends on 1.1
                          └─→ Task 2.2 (SSE client JS) ← depends on 2.1
                                └─→ Phase 3 (Agent Visualization)
                                      ├─→ Task 3.1 (Message card + progress)
                                      ├─→ Task 3.2 (Classifier + Strategist cards) ← depends on 3.1
                                      ├─→ Task 3.3 (Investigator cards) ← depends on 3.2
                                      ├─→ Task 3.4 (DA card) ← depends on 3.3
                                      └─→ Task 3.5 (Verdict reveal) ← depends on 3.4
                                            └─→ Phase 4 (Copy)
                                                  └─→ Task 4.1 (Power Writing) ← depends on 3.5
                                                        └─→ Phase 5 (Integration)
                                                              ├─→ Task 5.1 (Bot sends live URL)
                                                              ├─→ Task 5.2 (Landing page link)
                                                              └─→ Task 5.3 (QR code)
                                                                    └─→ Phase 6 (Polish)
                                                                          ├─→ Task 6.1 (Animations)
                                                                          ├─→ Task 6.2 (Mobile responsive)
                                                                          └─→ Task 6.3 (Demo timing)
```
