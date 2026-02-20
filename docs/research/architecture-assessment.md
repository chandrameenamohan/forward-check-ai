# ForwardCheck-AI Architecture Assessment: Multi-Platform Support

**Date:** 2026-02-19
**Author:** Software Architect Agent
**Scope:** Feasibility analysis for adding WhatsApp as a second messaging platform

---

## 1. Current Architecture Overview

ForwardCheck-AI is a TypeScript (strict ESM) application with three main subsystems:

```
                +------------------+
                |   Entry Point    |
                |   src/index.ts   |
                +--------+---------+
                         |
          +--------------+--------------+
          |              |              |
    +-----v-----+  +----v----+  +------v-------+
    | Telegram   |  | Express |  | Investigation|
    | Bot (Grammy)  | Server  |  | Pipeline     |
    | src/bot/   |  | src/    |  | src/         |
    |            |  | server/ |  | orchestrator/|
    +-----+------+  +----+----+  +------+-------+
          |              |              |
          |              |    +---------+---------+
          |              |    |                   |
          |              |    v                   v
          |              |  AI Agents           Tools
          |              |  src/agents/         src/tools/
          |              |    |                   |
          +------+-------+---+-------------------+
                 |
           +-----v-----+
           |  Database  |
           | better-    |
           | sqlite3    |
           | src/db/    |
           +------------+
```

### File Count by Module

| Module | Files | Telegram-coupled? |
|--------|-------|-------------------|
| `src/bot/` | 3 (bot.ts, message-handler.ts, status-updater.ts) | **YES** - 100% |
| `src/orchestrator/` | 3 (pipeline.ts, agent-runner.ts, pipeline-events.ts) | Minimal |
| `src/agents/` | 8 (classifier, strategist, DA, judge, 3 investigators, report-extractor) | **NO** |
| `src/schemas/` | 6 (Zod schemas) | **NO** |
| `src/tools/` | 3 (brave-search, google-factcheck, tool-registry) | **NO** |
| `src/services/` | 4 (claude-client, claim-cache, url-extractor, github-issues) | **NO** |
| `src/db/` | 4 (connection, migrations, investigation-repo, feedback-repo) | Minor |
| `src/server/` | 7 (app, routes, middleware, views) | Minor |
| `src/formatter/` | 2 (telegram-formatter, confidence-gates) | **YES** - 1 of 2 |
| `src/config/` | 2 (env, logger) | Minor |
| `src/index.ts` | 1 (entry point) | YES |

---

## 2. Message Flow: End-to-End

```
User sends message in Telegram
        |
        v
Grammy bot.on("message:text")          [src/bot/message-handler.ts:163]
        |
        v
Check: is forwarded? (message.forward_origin !== undefined)  [line 171]
        |
        v
Detect URL in text (url-extractor)      [line 179]
        |
        v
Create StatusUpdater (edits Telegram messages)  [line 186]
        |
        v
pipeline.investigate(text, { onStatusUpdate, onInvestigationCreated,
  telegramChatId, telegramMessageId })  [line 193-218]
        |
        v
  +-- InvestigationPipeline.investigate()  [src/orchestrator/pipeline.ts:75]
  |     |
  |     v
  |   repo.create(message, telegramChatId, telegramMessageId)  [line 93-94]
  |     |
  |     v
  |   URL pre-processing (enrichMessageWithUrl)
  |     |
  |     v
  |   runClassifier() -> Haiku        [src/agents/classifier-agent.ts]
  |     |
  |     +--- Non-factual? -> handleNonFactual() -> return early
  |     |
  |     v
  |   runStrategist() -> Opus          [src/agents/strategist-agent.ts]
  |     |
  |     v
  |   3x Investigators (parallel) -> Sonnet  [src/agents/investigators/]
  |     |
  |     v
  |   runDevilsAdvocate() -> Opus      [src/agents/devils-advocate-agent.ts]
  |     |
  |     v
  |   runJudge() -> Opus               [src/agents/judge-agent.ts]
  |     |
  |     v
  |   enforceConfidenceGates()         [src/formatter/confidence-gates.ts]
  |     |
  |     v
  |   Return InvestigateResult { verdict, investigationId, ... }
  |
  v
formatTelegramVerdict(verdict)         [src/formatter/telegram-formatter.ts]
        |
        v
ctx.api.sendMessage(chatId, verdictHtml, { parse_mode: "HTML" })
```

---

## 3. Telegram-Specific Code: Complete Inventory

### 3a. Fully Telegram-Coupled Files (must abstract or duplicate)

**`src/bot/bot.ts`** (20 lines)
- Imports `Bot` from `grammy`
- Creates Grammy bot instance with token
- Grammy-specific error handler

**`src/bot/message-handler.ts`** (274 lines) -- **CRITICAL FILE**
- Imports: `Bot`, `CommandContext`, `Context`, `InlineKeyboard` from `grammy`
- Uses `ctx.message.forward_origin` for forwarded message detection (line 171)
- Uses `ctx.api.sendMessage()` for all responses
- Uses `InlineKeyboard` for URL buttons
- Uses `ctx.match` for command argument parsing
- Passes `telegramChatId` and `telegramMessageId` to pipeline
- `handleFeedbackCommand()` reads `ctx.from?.username`, `ctx.from.id`
- `parse_mode: "HTML"` for Telegram HTML formatting

**`src/bot/status-updater.ts`** (91 lines)
- Imports `Api`, `RawApi` from `grammy`
- Uses `api.sendMessage()` to send initial status
- Uses `api.editMessageText()` to update in-place (Telegram-specific feature)
- Stores `statusMessageId` for edit tracking

**`src/formatter/telegram-formatter.ts`** (155 lines)
- `formatTelegramVerdict()` produces Telegram-specific HTML
- Uses `<b>`, `<i>`, `<blockquote expandable>` (Telegram-specific tags)
- Truncates to 4096 chars (Telegram message limit)
- `escapeHtml()` for Telegram HTML entities

### 3b. Lightly Telegram-Coupled (minor references, easily abstracted)

**`src/config/env.ts`** (lines 6-7)
```typescript
TELEGRAM_BOT_TOKEN: z.string().min(1, "TELEGRAM_BOT_TOKEN is required"),
TELEGRAM_BOT_USERNAME: z.string().default("forward_check_beta_bot"),
```
These are required fields. WhatsApp config would be additive.

**`src/index.ts`** (lines 100-143)
```typescript
const bot = createBot(config.TELEGRAM_BOT_TOKEN);
createMessageHandler(bot, pipeline, baseUrl, repo, feedbackRepo, githubService);
// ...
startBotWithRetry();   // bot.start() with 409 retry
shutdown() { bot.stop(); }
```
Entry point wires Telegram bot. WhatsApp webhook would be wired here too.

**`src/orchestrator/pipeline.ts`** (lines 32-33, 93-94)
```typescript
export interface InvestigateOptions {
  telegramChatId?: string;
  telegramMessageId?: string;
  // ...
}
// ...
const investigationId = options?.investigationId
  ?? this.repo.create(message, options?.telegramChatId, options?.telegramMessageId);
```
Pipeline has optional `telegramChatId`/`telegramMessageId` in its interface. These are passed through to the DB.

**`src/db/migrations.ts`** (lines 18-19)
```sql
telegram_chat_id TEXT,
telegram_message_id TEXT,
```
Schema columns named `telegram_*`.

**`src/db/investigation-repository.ts`** (lines 10-11, 81-100)
```typescript
interface InvestigationRow {
  telegram_chat_id: string | null;
  telegram_message_id: string | null;
}
// create() accepts telegramChatId, telegramMessageId
```

**`src/db/feedback-repository.ts`** (lines 7-8)
```typescript
interface FeedbackRow {
  telegram_username: string | null;
  telegram_user_id: string | null;
}
```

**`src/server/app.ts`** (line 58, 98)
- References `telegramBotUsername` for landing page and live stream view

### 3c. Telegram-Free Code (reusable as-is)

The following require **zero changes** for WhatsApp:

- **All 6 AI agents** (`src/agents/` -- 8 files): Classifier, Strategist, 3 Investigators, DA, Judge
- **All Zod schemas** (`src/schemas/` -- 6 files): ClassifierResult, SearchStrategy, AgentReport, ChallengeReport, FinalVerdict
- **Tool registry + search tools** (`src/tools/` -- 3 files): Brave Search, Google FactCheck
- **Core services** (`src/services/` -- 4 files): ClaudeClient, ClaimCache, URL extractor, GitHub issues
- **Agent runner** (`src/orchestrator/agent-runner.ts`)
- **Pipeline event bus** (`src/orchestrator/pipeline-events.ts`)
- **Confidence gates** (`src/formatter/confidence-gates.ts`)
- **Express server routes** (`src/server/` -- mostly): investigate, chat, verdict, live-stream, feedback
- **Rate limiter** (`src/server/middleware/rate-limit.ts`)
- **All EJS views** (`src/server/views/`)
- **Logger** (`src/config/logger.ts`)

---

## 4. Forwarded Message Detection (Critical Feature)

### Current Telegram Implementation

```typescript
// src/bot/message-handler.ts:171
const isForwarded = message.forward_origin !== undefined;
```

Telegram provides `forward_origin` metadata on the Message object. The bot currently:
1. Logs whether the message is forwarded (line 173)
2. Passes the raw `text` to the pipeline regardless (line 193)

**Key finding:** The forwarded status is **logged but not used** by the AI pipeline. The pipeline treats forwarded and direct messages identically -- it receives the text and runs the same 6-agent investigation.

### WhatsApp Implications

WhatsApp marks forwarded messages with a "Forwarded" label and a `forwarded` boolean field (and `frequently_forwarded` for viral messages). This is structurally equivalent to Telegram's `forward_origin`.

**Recommendation:** Abstract forwarded detection into the platform adapter:
```typescript
interface IncomingMessage {
  text: string;
  isForwarded: boolean;
  isFrequentlyForwarded?: boolean; // WhatsApp-specific, useful for urgency
  // ...
}
```

---

## 5. Database Schema Assessment

### `investigations` table
```sql
CREATE TABLE investigations (
  id TEXT PRIMARY KEY,
  original_message TEXT NOT NULL,
  extracted_claim TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  classifier_result JSON,
  search_strategy JSON,
  agent_reports JSON,
  challenge_report JSON,
  final_verdict JSON,
  telegram_chat_id TEXT,        -- Telegram-specific
  telegram_message_id TEXT,     -- Telegram-specific
  source_url TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  total_cost_usd REAL DEFAULT 0,
  pipeline_duration_ms INTEGER
)
```

**Issues:**
- `telegram_chat_id` and `telegram_message_id` are Telegram-specific column names
- No concept of "platform" or "channel" -- every investigation is implicitly Telegram

**Recommendation:** Generalize to platform-agnostic columns:
```sql
-- Migration strategy: ADD new columns, keep old ones for backward compatibility
ALTER TABLE investigations ADD COLUMN source_platform TEXT DEFAULT 'telegram';
ALTER TABLE investigations ADD COLUMN platform_chat_id TEXT;
ALTER TABLE investigations ADD COLUMN platform_message_id TEXT;
-- Backfill: UPDATE investigations SET platform_chat_id = telegram_chat_id, ...
-- Old columns can be dropped in a later migration
```

### `feedback` table
```sql
telegram_username TEXT,
telegram_user_id TEXT,
```
Same issue. Should be generalized to `platform_username`, `platform_user_id` with a `source_channel` column (which already exists and is set to `"telegram"` or `"web"`).

---

## 6. Proposed Adapter Architecture

### 6a. Platform Adapter Interface

Create a `src/platforms/` directory with a common interface:

```typescript
// src/platforms/types.ts

/** Normalized incoming message from any platform */
export interface PlatformMessage {
  /** Platform identifier: "telegram" | "whatsapp" | "web" */
  platform: "telegram" | "whatsapp" | "web";

  /** Platform-specific chat/conversation ID */
  chatId: string;

  /** Platform-specific message ID */
  messageId: string;

  /** Message text content */
  text: string;

  /** Whether the message was forwarded from another user/chat */
  isForwarded: boolean;

  /** Whether the message has been forwarded many times (WhatsApp-specific) */
  isFrequentlyForwarded?: boolean;

  /** Sender info */
  sender: {
    id: string;
    username?: string;
    displayName?: string;
  };

  /** Raw platform-specific data (for platform-specific features) */
  raw?: unknown;
}

/** Platform-specific response actions */
export interface PlatformResponder {
  /** Send a text message */
  sendText(chatId: string, text: string): Promise<void>;

  /** Send a formatted verdict (platform handles its own formatting) */
  sendVerdict(chatId: string, verdict: FinalVerdict, analysisUrl: string): Promise<void>;

  /** Send a status update (edit existing message if platform supports it) */
  sendStatusUpdate(chatId: string, stage: PipelineStage): Promise<void>;

  /** Send initial "investigating..." message */
  sendInitial(chatId: string): Promise<void>;

  /** Send a URL button/link */
  sendLink(chatId: string, text: string, url: string): Promise<void>;
}

/** Platform adapter that bridges a messaging platform to the pipeline */
export interface PlatformAdapter {
  /** Platform name */
  readonly platform: string;

  /** Start listening for messages */
  start(): Promise<void>;

  /** Stop listening */
  stop(): Promise<void>;
}
```

### 6b. Directory Structure

```
src/
  platforms/
    types.ts                    # PlatformMessage, PlatformResponder, PlatformAdapter
    telegram/
      adapter.ts                # TelegramAdapter implements PlatformAdapter
      responder.ts              # TelegramResponder implements PlatformResponder
      formatter.ts              # Moved from src/formatter/telegram-formatter.ts
    whatsapp/
      adapter.ts                # WhatsAppAdapter implements PlatformAdapter
      responder.ts              # WhatsAppResponder implements PlatformResponder
      formatter.ts              # WhatsApp-specific verdict formatting
      webhook.ts                # Express route for /webhook/whatsapp
    message-router.ts           # Routes PlatformMessage -> pipeline, handles responses
  orchestrator/
    pipeline.ts                 # Updated: accepts PlatformMessage instead of telegramChatId
  db/
    migrations.ts               # Updated: platform-agnostic columns
    investigation-repository.ts # Updated: platform-agnostic create()
```

### 6c. Refactored Pipeline Interface

```typescript
// Updated InvestigateOptions
export interface InvestigateOptions {
  onStatusUpdate?: (stage: PipelineStage) => void | Promise<void>;
  onInvestigationCreated?: (investigationId: string) => void | Promise<void>;

  // Replace telegram-specific fields with platform-agnostic ones
  platform?: string;            // "telegram" | "whatsapp" | "web"
  platformChatId?: string;
  platformMessageId?: string;

  investigationId?: string;
  sourceUrl?: string;
  extractedUrlContent?: string;
}
```

### 6d. WhatsApp Webhook Integration

WhatsApp Business API uses webhooks (not long-polling like Telegram/Grammy):

```typescript
// src/platforms/whatsapp/webhook.ts
export function createWhatsAppWebhookRouter(
  adapter: WhatsAppAdapter,
): Router {
  const router = Router();

  // Verification endpoint (required by Meta)
  router.get("/webhook/whatsapp", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];
    if (mode === "subscribe" && token === config.WHATSAPP_VERIFY_TOKEN) {
      res.status(200).send(challenge);
    } else {
      res.sendStatus(403);
    }
  });

  // Incoming message webhook
  router.post("/webhook/whatsapp", (req, res) => {
    adapter.handleWebhook(req.body);
    res.sendStatus(200); // Must respond 200 quickly
  });

  return router;
}
```

---

## 7. WhatsApp-Specific Formatting Considerations

### Message Limits
- WhatsApp: **4096 characters** (same as Telegram for text messages)
- WhatsApp Business API supports **interactive messages** (buttons, lists) -- analogous to Telegram's InlineKeyboard
- WhatsApp uses **WhatsApp markdown** (`*bold*`, `_italic_`, `~strikethrough~`), NOT HTML

### WhatsApp Verdict Formatter

A new `formatWhatsAppVerdict()` function is needed:

```typescript
// Key differences from Telegram:
// - *bold* instead of <b>bold</b>
// - _italic_ instead of <i>italic</i>
// - No <blockquote expandable> (use indentation or sections)
// - No parse_mode -- WhatsApp auto-renders markdown
// - Interactive message buttons instead of InlineKeyboard
```

### Status Updates

Telegram supports editing previous messages (`editMessageText`). WhatsApp Business API does **not** support editing sent messages. Options:
1. Send a single initial message, then send the verdict as a new message (simplest)
2. Use WhatsApp "reaction" emojis on the initial message to indicate progress
3. Send status as a typing indicator + single verdict message

**Recommendation:** Option 1 for MVP. WhatsApp users expect a response, not a series of edits.

---

## 8. Effort Estimate

### Files to Create (new)

| File | Purpose | Estimated LOC |
|------|---------|---------------|
| `src/platforms/types.ts` | Platform interfaces | ~80 |
| `src/platforms/telegram/adapter.ts` | Telegram adapter (refactored from bot/) | ~60 |
| `src/platforms/telegram/responder.ts` | Telegram response handling | ~100 |
| `src/platforms/telegram/formatter.ts` | Moved from src/formatter/ | ~155 (move) |
| `src/platforms/whatsapp/adapter.ts` | WhatsApp adapter | ~120 |
| `src/platforms/whatsapp/responder.ts` | WhatsApp response handling | ~100 |
| `src/platforms/whatsapp/formatter.ts` | WhatsApp verdict formatting | ~120 |
| `src/platforms/whatsapp/webhook.ts` | Webhook route + signature verification | ~80 |
| `src/platforms/whatsapp/client.ts` | WhatsApp Cloud API HTTP client | ~150 |
| `src/platforms/message-router.ts` | Routes messages to pipeline | ~100 |
| **Total new** | | **~1065** |

### Files to Modify (existing)

| File | Changes | Complexity |
|------|---------|------------|
| `src/index.ts` | Wire WhatsApp adapter + webhook | Low |
| `src/config/env.ts` | Add WhatsApp env vars | Low |
| `src/orchestrator/pipeline.ts` | Replace `telegramChatId/MessageId` with platform-agnostic fields | Low |
| `src/db/migrations.ts` | Add platform-agnostic columns | Low |
| `src/db/investigation-repository.ts` | Update `create()` to accept platform fields | Low |
| `src/db/feedback-repository.ts` | Generalize telegram_username -> platform_username | Low |
| `src/bot/message-handler.ts` | Refactor into platform adapter pattern (or deprecate) | Medium |
| `src/bot/status-updater.ts` | Refactor into TelegramResponder | Medium |
| `src/server/app.ts` | Mount WhatsApp webhook route | Low |
| **Total modified** | **9 files** | |

### Files Unchanged (no modifications needed)

- All 8 agent files (`src/agents/`)
- All 6 schema files (`src/schemas/`)
- All 3 tool files (`src/tools/`)
- All 4 service files (`src/services/`)
- Agent runner (`src/orchestrator/agent-runner.ts`)
- Pipeline event bus (`src/orchestrator/pipeline-events.ts`)
- Confidence gates (`src/formatter/confidence-gates.ts`)
- All EJS views (`src/server/views/`)
- Logger, rate limiter

**25+ files remain completely untouched.**

---

## 9. Risk Assessment

### Low Risk
- **AI pipeline reuse:** The entire 6-agent pipeline is platform-agnostic. Zero changes needed.
- **Database migration:** Adding columns is non-destructive. Old columns can coexist.
- **Express server:** Already serves web chat via `/api/chat/message` with no Telegram coupling.

### Medium Risk
- **WhatsApp API complexity:** Meta's Cloud API requires webhook verification, message signature validation, and handling of various message types (text, image, document). The API client needs robust error handling.
- **Formatting parity:** WhatsApp and Telegram have different rich text capabilities. The verdict formatter needs thorough testing to ensure readability.
- **Status updates:** Telegram's message-edit pattern doesn't translate to WhatsApp. Need a different UX approach.

### High Risk
- **WhatsApp Business API approval:** Getting a WhatsApp Business API account approved by Meta takes time (days to weeks) and requires business verification.
- **Rate limits:** WhatsApp Business API has stricter rate limits than Telegram Bot API. High-volume usage requires a "Business Tier" upgrade.
- **Message templates:** WhatsApp requires pre-approved templates for business-initiated messages. User-initiated conversations (24h window) don't need templates, but re-engagement does.

---

## 10. Recommended Implementation Order

### Phase 1: Abstract Platform Layer (No WhatsApp yet)
1. Create `src/platforms/types.ts` with interfaces
2. Create `src/platforms/telegram/` by refactoring `src/bot/` into the adapter pattern
3. Create `src/platforms/message-router.ts`
4. Update `src/orchestrator/pipeline.ts` to use platform-agnostic fields
5. Run migrations for new DB columns
6. **Verify Telegram still works identically** -- this is a pure refactor

### Phase 2: WhatsApp Integration
1. Create `src/platforms/whatsapp/client.ts` (Cloud API HTTP wrapper)
2. Create `src/platforms/whatsapp/webhook.ts` (Express route)
3. Create `src/platforms/whatsapp/adapter.ts` + `responder.ts`
4. Create `src/platforms/whatsapp/formatter.ts`
5. Wire into `src/index.ts` and `src/server/app.ts`
6. Add WhatsApp env vars to `src/config/env.ts`

### Phase 3: Polish & Testing
1. End-to-end testing with WhatsApp Business API sandbox
2. Handle edge cases (media messages, group chats, reactions)
3. Monitoring and alerting for both platforms

---

## 11. Key Architectural Insight

**The codebase is already ~80% platform-agnostic by design.** The AI pipeline (`src/orchestrator/pipeline.ts`), all agents, schemas, tools, and services have zero knowledge of Telegram. The only coupling is in:

1. **Message ingestion** (`src/bot/`) -- ~385 lines of Telegram-specific code
2. **Response formatting** (`src/formatter/telegram-formatter.ts`) -- ~155 lines
3. **Pipeline options** -- 2 optional fields (`telegramChatId`, `telegramMessageId`)
4. **Database columns** -- 4 Telegram-named columns across 2 tables

The existing web chat route (`/api/chat/message` in `src/server/routes/chat.ts`) is proof that the pipeline already works without any Telegram dependency. It creates an investigation with null telegram fields and triggers the pipeline identically.

**Bottom line:** Adding WhatsApp is architecturally straightforward. The heaviest work is building the WhatsApp API client and formatter, not restructuring the core system.
