# URL Investigation Feature — Research Analysis

> 6 specialist agents analyzed the feature request in parallel. This document captures their findings.
> Date: February 15, 2026

---

## The Question

Customer asks: "Can ForwardCheck analyze a URL instead of just text? For example, if I paste a news article URL — can it fact-check the article?"

Example URLs:
- `https://www.nytimes.com/2026/02/14/world/europe/russia-navalny-poison.html` (paywalled)
- `https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/` (open, clean HTML — chosen as test URL)

---

## Agent 1: Product Manager

### User Need Patterns

| Pattern | Example | Frequency |
|---------|---------|-----------|
| **Bare URL** | `https://nytimes.com/article` | ~15% |
| **URL + commentary** | `Is this true? https://example.com/article` | ~25% |
| **Forwarded message with URL** | `BREAKING: Scientists prove X! Read: https://...` | ~50% |
| **Social media URL** | `https://twitter.com/user/status/123` | ~10% |

### What "Fact-Checking a URL" Means

- **Level 1:** Source credibility assessment (domain reputation) — cheap, fast
- **Level 2:** Headline vs content verification (misleading headlines are #1 misinfo form) — requires reading article
- **Level 3:** Full claim extraction and pipeline — the gold standard

**Recommendation:** Target Level 2 for MVP with fallback to Level 1 when extraction fails.

### The Critical Gap

Nobody in the current pipeline can **fetch and read a URL's content**. Brave Search searches FOR information — it doesn't fetch a specific page. The pipeline needs one new capability: URL content extraction.

### Minimum Viable Approach

1. **One new utility** (`src/services/url-extractor.ts`) — detect URLs, fetch content, extract readable text
2. **URL detection + content enrichment** added to `pipeline.ts` before the Classifier
3. **One prompt addition** to the Classifier's system prompt
4. **No changes** to schemas, DB structure, Strategist, Investigators, DA, Judge, formatters, or UI

### Cost Impact

- One HTTP fetch: negligible cost, ~1-3 seconds latency
- Slightly longer Classifier input: adds ~$0.003 to Haiku cost
- **Net cost increase: < 1%**

---

## Agent 2: LLM Researcher

### Architecture Recommendation: Hybrid (Pre-Processing + Tool)

**Primary: Pre-Processing Step (MANDATORY)**
- Extract URL content BEFORE the Classifier
- The Classifier CANNOT work with a bare URL — it would classify as "other" and short-circuit
- Only the Classifier sees full article text; everything downstream uses `extractedClaim`
- Token-efficient: extract once, not 3x per investigator

**Secondary: `fetch_url_content` Tool (OPTIONAL, deferred)**
- Investigators could read URLs found during search
- Judge could verify specific source URLs
- Adds $0.02-0.08 per investigation
- NOT needed for MVP

### Agent-by-Agent Impact

| Agent | Changes | Scope |
|-------|---------|-------|
| Pre-Processing | NEW: URL detection + extraction before pipeline | New code in pipeline.ts |
| Classifier | NONE (receives enriched text, not raw URL) | Zero changes |
| Strategist | OPTIONAL prompt tweak | Minor |
| Investigators | Gain tool if registered (auto via registry) | Optional |
| Devil's Advocate | NONE | Zero changes |
| Judge | OPTIONAL gains tool | Minor |

### Token Cost Analysis

Only the Classifier sees full article text (~3000 tokens added to Haiku = $0.003). Strategist and everything downstream sees `extractedClaim` — a short string. **Cost increase is negligible.**

---

## Agent 3: Applied ML Researcher

### Approach Comparison

| Approach | Effort | Impact | Risk | Quality |
|----------|--------|--------|------|---------|
| **A: Pre-processing** | 2-3 hours | Minimal | Near zero | Good |
| **B: Agent tool only** | 3-4 hours | Moderate | Medium (Classifier breaks) | Higher |
| **C: Hybrid** | 4-5 hours | Moderate | Low | Best |

### Critical Problem with Approach B Alone

If user pastes ONLY a URL, the Classifier receives a URL string. Haiku classifies it as "other" → pipeline short-circuits → no investigation. **You cannot use B without at least part of A.**

### Library Evaluation

| Library | Verdict |
|---------|---------|
| `@mozilla/readability` + `jsdom` | **Recommended.** Firefox Reader View algorithm. Battle-tested. ~2MB. |
| `cheerio` | Not recommended. No readability algorithm. |
| Plain `fetch` + regex | Not recommended. Gets nav, footer, ads, everything. |
| `puppeteer`/`playwright` | Overkill. 100MB+ dependency. |

### Winner: Approach A for Hackathon

- 2-3 hours implementation
- Zero risk to existing flow
- `@mozilla/readability` + `jsdom` for extraction
- Truncate to 3000 chars (covers lede + key claims)

---

## Agent 4: Software Architect

### Complete File Change Manifest

**MUST CHANGE (6 files):**

| File | Change | Breaking? |
|------|--------|-----------|
| `src/services/url-extractor.ts` | **NEW FILE** — URL detection + content extraction | N/A |
| `src/orchestrator/pipeline.ts` | Add `sourceUrl`/`extractedContent` to options, route to classifier | No |
| `src/bot/message-handler.ts` | URL detection before pipeline call | No |
| `src/server/routes/chat.ts` | URL detection before pipeline call | No |
| `src/db/migrations.ts` | Add nullable `source_url` column | No |
| `src/db/investigation-repository.ts` | Add `source_url` to interfaces, `updateSourceUrl()` method | No |

**SHOULD CHANGE (4 files):**

| File | Change | Breaking? |
|------|--------|-----------|
| `src/server/routes/verdict.ts` | Pass `sourceUrl` to template | No |
| `src/server/routes/live-stream.ts` | Pass `sourceUrl` to live page | No |
| `src/orchestrator/pipeline-events.ts` | Add `sourceUrl?` to start event | No |
| `tests/fixtures/factories.ts` | Add `source_url: null` to makeInvestigation | No |

**NO CHANGE NEEDED (20+ files):**
- All Zod schemas (classifier, strategy, report, challenge, verdict)
- All agent implementations (classifier, strategist, investigators, DA, judge)
- Formatters (telegram, confidence gates)
- Services (claude-client, claim-cache)
- Tools (brave-search, google-factcheck, tool-registry)
- Agent runner

### Backward Compatibility Guarantees

- All 576 existing tests pass unchanged
- Pipeline signature unchanged: `investigate(message: string, options?)`
- All schema additions are optional fields
- DB migration uses nullable column (existing rows get NULL)
- Cache key is raw message string — works for URLs too

---

## Agent 5: UX Designer

### Core Decision: Same Input, Auto-Detect

**Single input field, automatic URL detection, no separate controls.**

### Telegram Bot Flow

```
USER sends: https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/
BOT: 🔗 Reading article...
[3-8 seconds]
BOT: 📰 Got it. Investigating the claims...
[Normal pipeline]
BOT: [Standard verdict card]
```

### Web Chat Flow

- Change placeholder: `"Paste a claim, a news article URL, or a suspicious message"`
- Add SSE event: "Reading article from nhk.or.jp..."
- No new UI components, no preview cards, no separate URL field

### Status Messages

| Phase | Text Input | URL Input |
|-------|------------|-----------|
| Pre-processing | *(none)* | Reading article from example.com... |
| Classification | Classifying claim... | Classifying claim... |
| Strategy | Building strategy... | Building strategy... |
| Investigation | Investigating... | Investigating... |
| Review | Reviewing evidence... | Reviewing evidence... |
| Verdict | Rendering verdict... | Rendering verdict... |

### What NOT to Build

- No URL preview cards
- No separate URL input field
- No URL validation UI
- No "confirm this URL" dialog

---

## Agent 6: Hackathon Winner

### VERDICT: Proceed with caution (originally recommended SKIP)

**The concern:** URL support adds 0% to Opus 4.6 score (25% weight), marginally improves Impact, and risks demo stability.

**Why it's mitigated in this case:**
- Ralph Loop builds autonomously — user works on demo video in parallel
- Time investment: ~15 minutes for plan review, loop handles the rest
- Approach A is scoped to 2-3 hours of autonomous build time
- All changes are backward-compatible with graceful fallback

### Score Impact Analysis

| Criteria | Weight | URL Impact |
|----------|--------|------------|
| Demo | 30% | Neutral (slightly richer, but risk of URL-related bugs) |
| Impact | 25% | Small positive ("check any article" feels more real-world) |
| Opus 4.6 Use | 25% | Zero (URL extraction is plumbing, not Opus showcase) |
| Depth & Execution | 20% | Small positive ("pushed past first idea") |

### Time Allocation Recommendation

| Activity | Time | Priority |
|----------|------|----------|
| Demo video (scripting, recording, editing) | 3-5 hours | **#1** |
| URL feature (via Ralph Loop, autonomous) | 3-4 hours | **Parallel** |
| Polish verdict page for demo claims | 1-2 hours | **#2** |
| Write 100-200 word summary | 30 min | **#3** |
| Clean GitHub repo | 30 min | **#4** |
| Test demo claims for consistency | 1 hour | **#5** |

---

## Consensus Decision

**Approach A: Pre-processing URL extraction. 13 tasks. ~3-4 hours via Ralph Loop.**

The enriched message flows through the existing pipeline unchanged:

```
URL → detectUrl() → fetchUrlContent() → enrichedMessage
  → Classifier (sees article text) → extractedClaim
  → Strategist → Investigators → DA → Judge (all unchanged)
```

All 6 agents agreed on this approach. The only disagreement was whether to build it at all (hackathon winner said skip), which is mitigated by the Ralph Loop's autonomous execution.
