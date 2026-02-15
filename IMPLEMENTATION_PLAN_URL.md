# ForwardCheck-AI — URL Investigation Implementation Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

**Feature:** Allow users to submit URLs (news articles, blog posts) for fact-checking. The system fetches the article content, extracts claims, and runs the existing 6-agent pipeline.

**Architecture Decision:** Pre-processing URL extraction (Approach A). URL content is extracted BEFORE the pipeline runs and fed to the Classifier as enriched text. The rest of the pipeline (Strategist, Investigators, DA, Judge) operates on `extractedClaim` as before — zero changes to downstream agents.

**Test URL:** `https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/`

---

## Phase 0: URL Content Extraction Service

### Task 0.1: Create URL detection utility
- [x]
**Objective:** Build a pure synchronous function that detects URLs in user input and extracts the first URL.
**Details:**
- Create `src/services/url-extractor.ts`
- Function `detectUrl(input: string): string | null` — returns the first URL found or null
- Regex pattern: match `https?://[^\s<>"{}|\\^\`[\]]+` URLs
- Must handle:
  - Bare URL: `https://example.com/article` → returns the URL
  - URL with text: `Is this true? https://example.com/article` → returns the URL
  - No URL: `PM Modi announced Rs 5000` → returns null
  - Multiple URLs: returns the FIRST one only
  - Must NOT match email addresses (`user@example.com`)
  - Trailing punctuation cleanup: strip trailing `.`, `,`, `)`, `]` that aren't part of the URL
- Export the function and its types
**Validation:**
- Test file: `tests/unit/services/url-extractor.test.ts`
- Test: `"should return null for plain text without URLs"`
- Test: `"should detect https URL"`
- Test: `"should detect http URL"`
- Test: `"should extract URL from mixed text"`
- Test: `"should return first URL when multiple present"`
- Test: `"should not match email addresses"`
- Test: `"should strip trailing punctuation from URL"`

### Task 0.2: Create URL content fetcher
- [x]
**Objective:** Build an async function that fetches a URL and extracts readable article text using Mozilla Readability.
**Details:**
- Install dependencies: `npm install @mozilla/readability jsdom` and `npm install -D @types/jsdom`
- In `src/services/url-extractor.ts`, add:
- Interface `UrlExtractionResult`:
  ```typescript
  interface UrlExtractionResult {
    url: string;
    title: string;
    byline: string | null;
    excerpt: string | null;
    textContent: string;    // Plain text, no HTML
    wordCount: number;
    siteName: string | null;
  }
  ```
- Function `fetchUrlContent(url: string, timeoutMs?: number): Promise<UrlExtractionResult>`
  - HTTP fetch with 10-second timeout (configurable)
  - User-Agent header: `"ForwardCheck-AI/1.0 (fact-checking bot)"`
  - Follow redirects (up to 5)
  - Check Content-Type is `text/html` — reject PDFs, images, etc.
  - Parse HTML with JSDOM
  - Extract readable content with `@mozilla/readability` Readability
  - Truncate `textContent` to 4000 characters max (covers lede + key claims)
  - Handle errors gracefully: throw typed errors for timeout, non-HTML, fetch failure, extraction failure
- Function `enrichMessageWithUrl(message: string): Promise<{ enrichedMessage: string; sourceUrl: string } | null>`
  - Calls `detectUrl(message)` — if null, return null
  - Calls `fetchUrlContent(url)` — if fails, return null (log warning)
  - Composes enriched message:
    ```
    [Article from <domain>]
    Title: <title>
    <byline if present>

    Article content:
    <textContent truncated to 4000 chars>

    ---
    <user's original text minus the URL, if any>
    ```
  - Returns `{ enrichedMessage, sourceUrl }`
**Validation:**
- Test file: `tests/unit/services/url-extractor.test.ts` (extend)
- Test: `"fetchUrlContent should return extracted article content"` (mock fetch with sample HTML)
- Test: `"fetchUrlContent should throw on timeout"` (mock slow response)
- Test: `"fetchUrlContent should throw on non-HTML content type"` (mock PDF response)
- Test: `"fetchUrlContent should truncate long articles to 4000 chars"`
- Test: `"fetchUrlContent should handle fetch errors gracefully"`
- Test: `"enrichMessageWithUrl should return null for plain text"`
- Test: `"enrichMessageWithUrl should return enriched message for URL input"`
- Test: `"enrichMessageWithUrl should include user commentary alongside article"`
- All existing tests pass. `npx tsc --noEmit` passes.

---

## Phase 1: Database & Pipeline Integration

### Task 1.1: Add source_url column to investigations table
- [x]
**Objective:** Add a nullable `source_url` column to the investigations table and update the repository.
**Details:**
- Edit `src/db/migrations.ts` — add a safe `ALTER TABLE` migration:
  ```typescript
  try {
    db.exec(`ALTER TABLE investigations ADD COLUMN source_url TEXT`);
  } catch { /* column already exists */ }
  ```
- Edit `src/db/investigation-repository.ts`:
  - Add `source_url: string | null` to `InvestigationRow` and `Investigation` interfaces
  - Add `source_url: row.source_url ?? null` to `toInvestigation()` mapping
  - Add new method: `updateSourceUrl(id: string, sourceUrl: string): void`
  - Update `create()` to accept optional `sourceUrl?: string` parameter (default null)
- Do NOT change any other repository methods
**Validation:**
- Test file: `tests/unit/db/investigation-repository.test.ts` (extend)
- Test: `"should store and retrieve source_url"`
- Test: `"should default source_url to null"`
- Test: `"should update source_url via updateSourceUrl method"`
- All existing DB tests pass. `npx tsc --noEmit` passes.

### Task 1.2: Add URL pre-processing to pipeline
- [x]
**Objective:** Add URL detection and content extraction as a pre-processing step in the pipeline, before the Classifier runs.
**Details:**
- Edit `src/orchestrator/pipeline.ts`:
  - Add to `InvestigateOptions` interface:
    ```typescript
    sourceUrl?: string;
    extractedUrlContent?: string;
    ```
  - In the `investigate()` method, BEFORE the classifier call:
    ```typescript
    // URL pre-processing: detect and extract URL content
    let effectiveMessage = message;
    let sourceUrl = options?.sourceUrl;

    if (!sourceUrl) {
      // Auto-detect URL in message
      const urlResult = await enrichMessageWithUrl(message);
      if (urlResult) {
        effectiveMessage = urlResult.enrichedMessage;
        sourceUrl = urlResult.sourceUrl;
      }
    } else if (options?.extractedUrlContent) {
      effectiveMessage = options.extractedUrlContent;
    }

    // Store source URL in DB if present
    if (sourceUrl) {
      this.repo.updateSourceUrl(investigationId, sourceUrl);
    }
    ```
  - Pass `effectiveMessage` to `runClassifier()` instead of `message`
  - The original `message` (the raw URL or text) is still stored as `original_message` in DB
  - Add `sourceUrl` to `pipeline:start` event payload (optional field)
- Edit `src/orchestrator/pipeline-events.ts`:
  - Add `sourceUrl?: string` to `PipelineStartEvent` interface (optional, non-breaking)
- The rest of the pipeline (Strategist, Investigators, DA, Judge) is UNCHANGED — they all operate on `classifierResult.extractedClaim` which the Classifier produces from the enriched message
**Validation:**
- Test file: `tests/unit/orchestrator/pipeline-url.test.ts` (new file)
- Test: `"pipeline should detect URL and enrich message before classification"` (mock URL extractor + mock agents)
- Test: `"pipeline should pass enriched message to classifier when URL present"` (verify classifier receives article text, not raw URL)
- Test: `"pipeline should work unchanged for plain text messages"` (regression)
- Test: `"pipeline should store source_url in database when URL detected"`
- Test: `"pipeline should handle URL extraction failure gracefully and fall back to raw message"`
- All existing pipeline tests pass. `npx tsc --noEmit` passes.

### Task 1.3: Update Classifier prompt for article content
- [x]
**Objective:** Add guidance to the Classifier system prompt so it handles URL-enriched messages correctly.
**Details:**
- Edit `src/agents/classifier-agent.ts` — add to `CLASSIFIER_SYSTEM_PROMPT` (in the classification rules section):
  ```
  - If the message contains article content extracted from a URL (indicated by "[Article from ...]" header), classify based on the ARTICLE'S factual claims, not the URL itself. Extract the primary factual claim from the article content.
  - Articles from news sources are typically "factual_claim" unless the article is clearly an opinion piece or satire.
  ```
- Do NOT change the Classifier's Zod schema, function signature, or model
- Do NOT change how the Classifier parses responses
**Validation:**
- All existing classifier tests pass (they use plain text, unaffected by prompt addition)
- `npx tsc --noEmit` passes

---

## Phase 2: Entry Point Integration

### Task 2.1: Add URL detection to Telegram bot message handler
- [x]
**Objective:** Detect URLs in Telegram messages and send a "Reading article..." status before the pipeline runs.
**Details:**
- Edit `src/bot/message-handler.ts`:
  - After extracting `text` from message, call `detectUrl(text)`
  - If URL detected:
    1. Send status message: `"🔗 Reading article..."` (before "Investigating your claim...")
    2. The pipeline's auto-detection will handle the rest (since we added it in Task 1.2)
  - If URL detection returns null, flow is identical to today (no changes)
- Edit `src/bot/status-updater.ts`:
  - Add `"fetching"` to `PipelineStage` type
  - Add stage message: `fetching: "📄 Reading article content..."`
- The message handler does NOT do URL extraction itself — it delegates to the pipeline's pre-processing. It only detects the URL to show the status message.
**Validation:**
- Test file: `tests/unit/bot/message-handler.test.ts` (extend)
- Test: `"should detect URL in message and send reading status"` (mock Grammy context)
- Test: `"should not send reading status for plain text messages"` (regression)
- All existing bot tests pass. `npx tsc --noEmit` passes.

### Task 2.2: Add URL detection to web chat route
- [x]
**Objective:** Handle URL submissions through the web chat API endpoint.
**Details:**
- Edit `src/server/routes/chat.ts`:
  - After validation/sanitization, call `detectUrl(trimmed)`
  - If URL detected, log it: `logger.info({ url }, "URL detected in chat message")`
  - Pass the message to pipeline as-is — the pipeline's pre-processing (Task 1.2) handles extraction
  - No changes to validation rules (URLs are 20-200 chars, well within 10-5000 limit)
  - Make sure the async handler properly awaits any URL-related operations
- This is a minimal change — the pipeline does the heavy lifting
**Validation:**
- Test file: `tests/unit/server/routes/chat.test.ts` (extend)
- Test: `"POST /api/chat/message should accept URL input and return 201"`
- Test: `"POST /api/chat/message should still work with plain text"` (regression)
- All existing chat tests pass. `npx tsc --noEmit` passes.

### Task 2.3: Add URL extraction SSE events
- [x]
**Objective:** Add SSE events for URL extraction status so the web chat and live page show "Reading article..." during extraction.
**Details:**
- Edit `src/orchestrator/pipeline-events.ts`:
  - Add two new event types:
    ```typescript
    interface UrlFetchStartEvent extends BaseEvent {
      kind: "url-fetch:start";
      url: string;
    }
    interface UrlFetchCompleteEvent extends BaseEvent {
      kind: "url-fetch:complete";
      url: string;
      title: string;
      wordCount: number;
    }
    ```
  - Add them to the `PipelineEvent` union type
- Edit `src/orchestrator/pipeline.ts`:
  - Emit `url-fetch:start` before calling `enrichMessageWithUrl()`
  - Emit `url-fetch:complete` after successful extraction (with title and word count)
  - If extraction fails, just skip the events (no error event needed — pipeline falls back)
- Edit `src/server/views/_chat-script.ejs`:
  - Add handlers for `url-fetch:start` and `url-fetch:complete` events
  - On `url-fetch:start`: show status "Reading article from [domain]..."
  - On `url-fetch:complete`: show "Article loaded ([wordCount] words). Investigating..."
- Edit `src/server/views/_live-agent-script.ejs`:
  - Same handlers as chat script
**Validation:**
- Test file: `tests/unit/orchestrator/pipeline-url.test.ts` (extend)
- Test: `"pipeline should emit url-fetch:start and url-fetch:complete events for URL input"`
- Test: `"pipeline should not emit url-fetch events for plain text input"`
- All existing tests pass. `npx tsc --noEmit` passes.

---

## Phase 3: UI Updates

### Task 3.1: Update chat page placeholder and add URL support hint
- [x]
**Objective:** Update the web chat textarea placeholder to mention URL support.
**Details:**
- Edit `src/server/views/chat.ejs`:
  - Change textarea placeholder from:
    `"Paste a message that seems off... or type a claim you want checked"`
  - To:
    `"Paste a claim, a news article URL, or a suspicious message"`
- That is the ONLY UI change. Same input field, same button, same layout.
**Validation:**
- Test file: `tests/unit/server/routes/chat-page.test.ts` (extend)
- Test: `"GET /chat should contain updated placeholder mentioning URL"`
- All existing chat page tests pass.

### Task 3.2: Show source URL on verdict page
- [x]
**Objective:** When an investigation originated from a URL, display the source URL on the verdict page.
**Details:**
- Edit `src/server/routes/verdict.ts`:
  - Pass `sourceUrl: investigation.source_url` to the EJS template
- Edit `src/server/views/verdict.ejs`:
  - After the "Original Message" section, add a conditional block:
    ```ejs
    <% if (sourceUrl) { %>
    <div class="fc-source-url">
      <span class="fc-source-label">Source:</span>
      <a href="<%= sourceUrl %>" target="_blank" rel="noopener noreferrer"><%= sourceUrl %></a>
    </div>
    <% } %>
    ```
  - Style: small text, muted color, linked, opens in new tab
- Do NOT change the verdict page layout or any other sections
**Validation:**
- Test file: `tests/unit/server/views/verdict-render.test.ts` (extend)
- Test: `"should render source URL when present"`
- Test: `"should not render source URL section when absent"` (regression)
- All existing verdict tests pass.

### Task 3.3: Show source URL on live investigation page
- [x]
**Objective:** When a live investigation originated from a URL, show the source on the live page.
**Details:**
- Edit `src/server/routes/live-stream.ts`:
  - Pass `sourceUrl: investigation.source_url` to the live EJS template
- Edit `src/server/views/live.ejs`:
  - In the message quote section, add conditional source URL display:
    ```ejs
    <% if (sourceUrl) { %>
    <div class="fc-live-source">
      <a href="<%= sourceUrl %>" target="_blank" rel="noopener noreferrer">
        📰 <%= new URL(sourceUrl).hostname %>
      </a>
    </div>
    <% } %>
    ```
**Validation:**
- All existing live page tests pass.
- Visually verify: source URL appears on live page for URL investigations.

---

## Phase 4: End-to-End Testing

### Task 4.1: Integration test with real URL
- [x]
**Objective:** Validate the complete pipeline works end-to-end with a real URL input using real Anthropic API calls.
**Details:**
- Create `tests/integration/url-pipeline-e2e.test.ts`
- Uses real Anthropic API (ANTHROPIC_API_KEY from .env)
- Uses real URL fetching (actual HTTP request to a test URL)
- Uses mock search tools (returns canned results)
- Test URL: `https://www3.nhk.or.jp/nhkworld/en/news/20260215_03/` (NHK World — no paywall, clean HTML)
- Validates:
  - URL is detected in the input
  - Article content is fetched and extracted
  - Classifier receives enriched message and identifies factual claims
  - Strategist produces SearchStrategy
  - Investigators return AgentReports
  - DA produces ChallengeReport
  - Judge produces FinalVerdict
  - Source URL is stored in database
  - All Zod schemas validate
  - Pipeline completes in < 180 seconds
- Logs total API cost
**Validation:**
- This IS the test — `tests/integration/url-pipeline-e2e.test.ts`
- Test: `"should produce a verdict for a URL-sourced claim"` — end-to-end
- Test timeout: 240 seconds

### Task 4.2: Regression test — text-only flow unchanged
- [x]
**Objective:** Verify that the existing text-only pipeline is completely unaffected by URL support changes.
**Details:**
- Create `tests/integration/text-regression-e2e.test.ts`
- Run the same test claim from the original pipeline E2E test: `"PM Modi announced Rs 5000 direct transfer to all citizens in March 2024"`
- Verify:
  - No URL detection triggered
  - No URL extraction attempted
  - Classifier receives raw text (not enriched)
  - Pipeline completes successfully with correct verdict
  - `source_url` is null in database
  - All costs and timings are within expected ranges
**Validation:**
- This IS the test — `tests/integration/text-regression-e2e.test.ts`
- Test: `"text-only pipeline should work identically after URL support changes"`
- Test timeout: 180 seconds

---

## Dependency Graph

```
Phase 0 (URL Extraction Service)
  ├── Task 0.1 (URL detection utility)
  └── Task 0.2 (URL content fetcher) ← depends on 0.1
        └── Phase 1 (Pipeline Integration)
              ├── Task 1.1 (DB migration + repo update)
              ├── Task 1.2 (Pipeline pre-processing) ← depends on 0.2 + 1.1
              └── Task 1.3 (Classifier prompt update)
                    └── Phase 2 (Entry Points)
                          ├── Task 2.1 (Telegram bot) ← depends on 1.2
                          ├── Task 2.2 (Web chat) ← depends on 1.2
                          └── Task 2.3 (SSE events) ← depends on 1.2
                                └── Phase 3 (UI Updates)
                                      ├── Task 3.1 (Chat placeholder)
                                      ├── Task 3.2 (Verdict page source URL) ← depends on 1.1
                                      └── Task 3.3 (Live page source URL) ← depends on 1.1
                                            └── Phase 4 (Testing)
                                                  ├── Task 4.1 (URL E2E test)
                                                  └── Task 4.2 (Text regression test)
```

**Estimated implementation time:** 3-4 hours (13 tasks, ~15-20 min each)

---

## Risk Assessment

| Risk | Severity | Mitigation |
|------|----------|------------|
| URL extraction fails for some sites | Medium | Graceful fallback — pipeline processes raw message text if extraction fails |
| Paywalled content (NYTimes, WSJ) | Low | Readability extracts whatever is visible; investigators can still search via Brave |
| Long articles blow up token count | Low | Hard cap at 4000 chars in extractor; only Classifier (Haiku, cheapest) sees full text |
| JSDOM/Readability dependency issues | Low | Well-maintained libraries; used by Firefox; minimal attack surface |
| Existing tests break | Very Low | All changes are additive (optional params, nullable columns, new events); zero signature changes to existing functions |

## What We Are NOT Building

- `fetch_url_content` tool for investigators (Approach B/C — deferred)
- Social media URL handling (Twitter, Facebook — too fragile)
- PDF extraction
- Image/video URL analysis
- URL history or bookmarking
- Article preview cards in the UI
