# Web Chat UI — Build Summary

> Give this file to Claude to resume from where we left off. **Next step: Manual QA.**

---

## What Was Built

A browser-based chat UI (`/chat`) that lets users paste a suspicious message and watch 6 AI agents investigate it in real-time — the same pipeline that powers the Telegram bot, now accessible from any browser.

### Architecture Decision

The chat page reuses **100% of the existing backend infrastructure**. Zero new real-time code. Only a thin `POST /api/chat/message` endpoint was added. The SSE streaming, pipeline, database, and event bus were already built for the `/live/:id` page.

### New Files Created

| File | Purpose |
|------|---------|
| `src/server/routes/chat.ts` | POST /api/chat/message endpoint (validation, rate limiting, pipeline trigger) |
| `src/server/middleware/rate-limit.ts` | Per-IP rate limiter (10 req/60s, in-memory) |
| `src/server/views/chat.ejs` | Chat page template (input, timeline, verdict reveal) |
| `src/server/views/_chat-styles.ejs` | Chat-specific CSS (glass-morphism, responsive, animations) |
| `src/server/views/_chat-script.ejs` | Chat JavaScript (form handler, SSE client, verdict reveal, polling fallback) |
| `tests/unit/server/routes/chat.test.ts` | API endpoint tests |
| `tests/unit/server/routes/chat-page.test.ts` | Chat page rendering tests |
| `tests/unit/server/routes/chat-integration.test.ts` | Route mounting integration tests |
| `tests/unit/server/middleware/rate-limit.test.ts` | Rate limiter tests |

### Modified Files

| File | Change |
|------|--------|
| `src/server/app.ts` | Mounted chat router + GET /chat route |
| `src/server/views/landing.ejs` | Added "Check in Your Browser" CTA linking to /chat |

### Features Implemented (22 tasks, 8 phases)

- **Phase 0**: Chat API route, input validation (10-5000 chars, HTML sanitization), per-IP rate limiting, route mounting
- **Phase 1**: GET /chat page scaffold, design tokens integration, glass-morphism dark theme
- **Phase 2**: Textarea with character counter, "Investigate This" submit button, form submission handler with fetch()
- **Phase 3**: SSE client (EventSource) handling all 15 pipeline event types, 6-stage investigation timeline with real-time status, agent cards showing findings as they arrive
- **Phase 4**: Verdict reveal animation (badge, confidence ring, decomposition bars, manipulation techniques), action buttons (See Full Breakdown, Check Another Claim, Share)
- **Phase 5**: Error states (validation, timeout, rate limit, network drop), non-factual message handling (opinion, satire, greeting), SSE polling fallback
- **Phase 6**: Mobile layout (375px sticky input, safe area), tablet/desktop optimization, accessibility (ARIA, reduced motion, keyboard nav)
- **Phase 7**: Scroll animations, landing page CTA update, meta/OG tags

### User Flow

```
Landing Page (/)
  → Click "Check in Your Browser"
    → Chat Page (/chat)
      → Paste claim, click "Investigate This"
        → POST /api/chat/message → returns { id, streamUrl }
        → EventSource connects to /api/live/{id}/stream
        → 6-stage timeline animates in real-time
        → Verdict reveals inline (badge, ring, bars, summary)
        → "See Full Breakdown" → /v/{id} (existing verdict page)
        → "Check Another Claim" → resets chat
        → "Share This Verdict" → copies link to clipboard
```

### Copy Guidelines Applied

All UI text follows Power Writing Playbook (skill/POWER_WRITING_PLAYBOOK.md):
- H1: "Paste. Investigate. Share the verdict."
- Subtitle: "Six AI agents spend 60 seconds tearing your message apart."
- Submit: "Investigate This" (not "Submit")
- Pipeline stages use visual, active voice copy
- Error messages are human-friendly, never blame the user

---

## Build Health (at completion)

| Check | Result |
|-------|--------|
| Tests | 576 passed, 8 skipped, 0 failed (58 test files) |
| TypeScript | Clean — npx tsc --noEmit passes |
| Commits | 22 commits (Chat Task 0.1 → Chat Task 7.3) |
| Branch | cm/feature/uiforprompt |
| Plan file | IMPLEMENTATION_PLAN_WEBCHAT.md (all 22 tasks checked off) |

---

## How It Was Built

### Process: 5-Agent Research → Consolidation → Ralph Loop

1. **Agent 1 (Architect)** — Explored existing backend: Express routes, SSE infrastructure, database schema, pipeline integration points
2. **Agent 2 (Copy Strategist)** — Drafted all UI copy using Power Writing Playbook + ProblemScopeV1.md user personas
3. **Agent 3 (Frontend Designer)** — Inventoried existing design system (CSS tokens, components, animations), proposed chat UI component hierarchy
4. **Agent 4 (Integration Engineer)** — Mapped pipeline flow, SSE event types, proposed API contracts, security/rate limiting strategy
5. **Agent 5 (Consolidator)** — Produced 3 Ralph Loop files from research outputs:
   - `IMPLEMENTATION_PLAN_WEBCHAT.md` (22 atomic tasks)
   - `PROMPT_webchat.md` (build prompt with Power Writing + SSE reuse rules)
   - `loop_webchat.sh` (loop script)

Then `./loop_webchat.sh` ran autonomously, executing one task per iteration with TDD.

---

## Next Step: Manual QA

### 1. Start the server
```bash
npx tsx src/index.ts
```

### 2. Browser testing checklist

**Happy path (desktop):**
- [ ] Open `http://localhost:3000/chat`
- [ ] Page loads with dark theme, no console errors
- [ ] Paste a test claim: "PM Modi announced Rs 5000 direct transfer to all citizens"
- [ ] Click "Investigate This"
- [ ] Watch 6 stages animate through the timeline
- [ ] Verify verdict reveals with badge, confidence ring, decomposition bars
- [ ] Click "See the Full Breakdown" — navigates to /v/{id}
- [ ] Click "Check Another Claim" — resets to input state
- [ ] Click "Share This Verdict" — copies URL to clipboard

**Error states:**
- [ ] Submit with < 10 characters — inline error message
- [ ] Submit empty — button should be disabled
- [ ] Submit 11 times rapidly — rate limit message on 11th

**Non-factual messages:**
- [ ] Submit "Hello, how are you?" — greeting response inline
- [ ] Submit "I think the economy is bad" — opinion response inline

**Mobile (375px in Chrome DevTools):**
- [ ] Input sticks to bottom
- [ ] Timeline scrolls vertically
- [ ] Touch targets are 44px+
- [ ] No horizontal overflow

**Cross-browser:**
- [ ] Safari — SSE works, animations play
- [ ] Firefox — SSE works, animations play

**Landing page:**
- [ ] Open `http://localhost:3000/`
- [ ] "Check in Your Browser" CTA visible
- [ ] Links to `/chat`

### 3. After QA

If issues found, fix them directly or create a follow-up task list. If QA passes, the web chat is demo-ready.
