# ForwardCheck-AI: WhatsApp Integration — Implementation Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

---

## Phase 1: Platform Abstraction Layer

### Task 1.1: Create platform type definitions
- [x]
**Objective:** Define the core interfaces (`PlatformMessage`, `PlatformResponder`, `PlatformAdapter`) that abstract messaging platform differences.
**Details:**
- Create `src/platforms/types.ts`
- `PlatformMessage` interface: `platform` (`"telegram" | "whatsapp" | "web"`), `chatId` (string), `messageId` (string), `text` (string), `isForwarded` (boolean), `isFrequentlyForwarded?` (boolean), `sender` (`{ id: string; username?: string; displayName?: string }`), `raw?` (unknown)
- `PlatformResponder` interface: `sendText(chatId, text)`, `sendVerdict(chatId, verdict, analysisUrl)`, `sendStatusUpdate(chatId, stage)`, `sendInitial(chatId)`, `sendLink(chatId, text, url)`
- `PlatformAdapter` interface: `readonly platform: string`, `start()`, `stop()`
- Export `PipelineStage` type from this file (move definition from `src/bot/status-updater.ts`): `"fetching" | "planning" | "searching" | "analyzing" | "challenging" | "judging"`
- Export `PIPELINE_STAGES` record with human-readable stage messages (moved from `src/bot/status-updater.ts`)
**Validation:**
- Test file: `tests/unit/platforms/types.test.ts`
- Test: `"PlatformMessage should be importable and usable as a type"`
- Test: `"PlatformResponder should be importable and usable as a type"`
- Test: `"PlatformAdapter should be importable and usable as a type"`
- Test: `"PIPELINE_STAGES should export all 6 stages"`
- `npx tsc --noEmit` passes

### Task 1.2: Generalize pipeline to platform-agnostic fields
- [x]
**Objective:** Replace `telegramChatId`/`telegramMessageId` in `InvestigateOptions` with platform-agnostic `platform`, `platformChatId`, `platformMessageId` fields.
**Details:**
- Update `src/orchestrator/pipeline.ts` `InvestigateOptions`:
  - Remove `telegramChatId?: string` and `telegramMessageId?: string`
  - Add `platform?: "telegram" | "whatsapp" | "web"`, `platformChatId?: string`, `platformMessageId?: string`
- Update `this.repo.create()` call at line 94 to pass `platformChatId` and `platformMessageId` instead of telegram-specific fields
- Import `PipelineStage` from `src/platforms/types.ts` instead of `src/bot/status-updater.ts`
- Update `src/bot/message-handler.ts` to pass `platform: "telegram"`, `platformChatId`, `platformMessageId` instead of `telegramChatId`/`telegramMessageId`
- Update `src/server/routes/chat.ts` (if it passes telegram fields) to use platform-agnostic fields
**Validation:**
- Test file: `tests/unit/orchestrator/pipeline-platform.test.ts`
- Test: `"InvestigateOptions should accept platform-agnostic fields"`
- Test: `"pipeline.investigate should pass platformChatId to repo.create"`
- Test: `"pipeline.investigate should still work with no platform fields"`
- All existing pipeline tests still pass: `npx vitest run tests/unit/orchestrator/pipeline.test.ts`

### Task 1.3: Database migration for platform-agnostic columns
- [x]
**Objective:** Add `source_platform`, `platform_chat_id`, `platform_message_id` columns to `investigations` table and `platform_user_id_hash` to `feedback` table. Backfill from existing telegram columns.
**Details:**
- Update `src/db/migrations.ts`:
  - `ALTER TABLE investigations ADD COLUMN source_platform TEXT DEFAULT 'telegram'`
  - `ALTER TABLE investigations ADD COLUMN platform_chat_id TEXT`
  - `ALTER TABLE investigations ADD COLUMN platform_message_id TEXT`
  - `ALTER TABLE feedback ADD COLUMN platform_user_id_hash TEXT`
  - Backfill: `UPDATE investigations SET platform_chat_id = telegram_chat_id, platform_message_id = telegram_message_id WHERE platform_chat_id IS NULL AND telegram_chat_id IS NOT NULL`
  - Each ALTER wrapped in try/catch for idempotency (column may already exist)
- Keep existing `telegram_chat_id` and `telegram_message_id` columns for backward compatibility — do NOT drop them
**Validation:**
- Test file: `tests/unit/db/migrations-platform.test.ts`
- Test: `"should add source_platform column with default 'telegram'"`
- Test: `"should add platform_chat_id and platform_message_id columns"`
- Test: `"should add platform_user_id_hash column to feedback table"`
- Test: `"should be idempotent — running twice doesn't error"`
- Test: `"should backfill platform columns from telegram columns"`
- Cleanup: delete test database after each test

### Task 1.4: Update InvestigationRepository for platform-agnostic fields
- [x]
**Objective:** Update `InvestigationRepository.create()` to accept platform-agnostic parameters and write to both old and new columns.
**Details:**
- Update `src/db/investigation-repository.ts`:
  - Change `create(originalMessage, telegramChatId?, telegramMessageId?, sourceUrl?)` signature to `create(originalMessage, options?)` where options is `{ platform?: string; platformChatId?: string; platformMessageId?: string; sourceUrl?: string }`
  - INSERT writes to both old columns (`telegram_chat_id`, `telegram_message_id`) when `platform === "telegram"` AND new columns (`source_platform`, `platform_chat_id`, `platform_message_id`) always
  - Update `InvestigationRow` and `Investigation` interfaces to include `source_platform`, `platform_chat_id`, `platform_message_id`
  - Update `toInvestigation()` to map new columns
- Update all callers of `repo.create()`:
  - `src/orchestrator/pipeline.ts` line 94
  - `src/server/routes/investigate.ts` (if applicable)
  - `src/server/routes/chat.ts` (if applicable)
**Validation:**
- Test file: `tests/unit/db/investigation-repository-platform.test.ts`
- Test: `"create() should write platform-agnostic fields"`
- Test: `"create() should write telegram columns for backward compat when platform is telegram"`
- Test: `"create() should write whatsapp platform correctly"`
- Test: `"getById() should return platform fields"`
- All existing repo tests still pass: `npx vitest run tests/unit/db/investigation-repository.test.ts`
- Cleanup: delete test database after each test

### Task 1.5: Update FeedbackRepository for platform-agnostic fields
- [x]
**Objective:** Generalize `CreateFeedbackParams` to support platform-agnostic user identifiers alongside existing telegram-specific fields.
**Details:**
- Update `src/db/feedback-repository.ts`:
  - Add `platformUserIdHash?: string` to `CreateFeedbackParams`
  - Update `create()` INSERT to include `platform_user_id_hash` column
  - Update `FeedbackRow` and `Feedback` interfaces to include `platform_user_id_hash`
  - Update `toFeedback()` to map new column
- Keep existing `telegramUsername`/`telegramUserId` fields — no breaking changes
**Validation:**
- Test file: `tests/unit/db/feedback-repository-platform.test.ts`
- Test: `"create() should write platform_user_id_hash"`
- Test: `"create() should still work with telegramUsername and telegramUserId"`
- Test: `"getById() should return platformUserIdHash"`
- All existing feedback repo tests still pass: `npx vitest run tests/unit/db/feedback-repository.test.ts`
- Cleanup: delete test database after each test

---

## Phase 2: Refactor Telegram into Adapter Pattern

### Task 2.1: Create TelegramResponder
- [x]
**Objective:** Extract Telegram-specific response logic (send messages, edit messages, send verdicts with InlineKeyboard) into a `TelegramResponder` that implements `PlatformResponder`.
**Details:**
- Create `src/platforms/telegram/responder.ts`
- Class `TelegramResponder implements PlatformResponder`
- Constructor takes Grammy `Api<RawApi>` instance
- `sendText(chatId, text)` — calls `api.sendMessage(Number(chatId), text)`
- `sendVerdict(chatId, verdict, analysisUrl)` — formats with `formatTelegramVerdict()`, sends with `parse_mode: "HTML"`, adds InlineKeyboard URL button "View Full Analysis" if URL is HTTPS
- `sendStatusUpdate(chatId, stage)` — edits the initial message in-place (stores message ID internally via a `Map<string, number>` keyed by chatId)
- `sendInitial(chatId)` — sends "Investigating your claim..." message, stores message ID for later edits
- `sendLink(chatId, text, url)` — sends text with InlineKeyboard URL button
- Graceful error handling on all methods (log + continue, never throw)
**Validation:**
- Test file: `tests/unit/platforms/telegram/responder.test.ts`
- Test: `"sendText should call api.sendMessage with numeric chatId"`
- Test: `"sendVerdict should format with Telegram HTML and include InlineKeyboard"`
- Test: `"sendInitial should store message ID for later edits"`
- Test: `"sendStatusUpdate should edit the stored message"`
- Test: `"should handle API errors gracefully without throwing"`

### Task 2.2: Create TelegramAdapter
- [x]
**Objective:** Create a `TelegramAdapter` that implements `PlatformAdapter`, encapsulating Grammy bot setup, message handler registration, and the start/stop lifecycle.
**Details:**
- Create `src/platforms/telegram/adapter.ts`
- Class `TelegramAdapter implements PlatformAdapter`
- Constructor takes: `token: string`, `pipeline: InvestigationPipeline`, `baseUrl: string`, `repo: InvestigationRepository`, `feedbackRepo?: FeedbackRepository`, `githubService?: GitHubIssueService`
- `readonly platform = "telegram"`
- `start()` — creates Grammy Bot, registers message handlers (reuse logic from `src/bot/message-handler.ts`), starts long polling with 409 retry
- `stop()` — calls `bot.stop()`
- Internally creates `TelegramResponder` from the bot's API instance
- Message handler converts Grammy `ctx.message` into a `PlatformMessage`, then routes through the pipeline using the responder for status updates and verdict delivery
- Move `/start`, `/bug`, `/feedback` command handlers into this adapter
**Validation:**
- Test file: `tests/unit/platforms/telegram/adapter.test.ts`
- Test: `"should create adapter with platform 'telegram'"`
- Test: `"should convert Grammy message to PlatformMessage"`
- Test: `"should detect forwarded messages via forward_origin"`
- Test: `"should handle /start command"`
- All existing bot tests still conceptually pass (may need path updates)

### Task 2.3: Move Telegram formatter into platform directory
- [x]
**Objective:** Move `src/formatter/telegram-formatter.ts` to `src/platforms/telegram/formatter.ts` and update all imports.
**Details:**
- Move file: `src/formatter/telegram-formatter.ts` → `src/platforms/telegram/formatter.ts`
- Update imports in:
  - `src/bot/message-handler.ts` (if still exists as a thin wrapper)
  - `src/platforms/telegram/responder.ts`
  - Any test files that reference the old path
- Keep `src/formatter/confidence-gates.ts` in place — it's platform-agnostic
- Create `src/platforms/telegram/index.ts` barrel export: `TelegramAdapter`, `TelegramResponder`, `formatTelegramVerdict`
**Validation:**
- Test: `"import { formatTelegramVerdict } from '../platforms/telegram/formatter.js'"` resolves
- All existing telegram formatter tests pass with updated import paths
- `npx tsc --noEmit` passes

### Task 2.4: Create message router
- [x]
**Objective:** Create a `MessageRouter` that receives a `PlatformMessage` + `PlatformResponder` pair, runs the pipeline, and sends responses back through the responder.
**Details:**
- Create `src/platforms/message-router.ts`
- Function `createMessageRouter(pipeline, repo, baseUrl)` returns an object with method `route(message: PlatformMessage, responder: PlatformResponder): Promise<void>`
- Route logic:
  1. Call `responder.sendInitial(message.chatId)`
  2. Detect URL in `message.text` — if found, send "Reading article..." via `responder.sendText()`
  3. Call `pipeline.investigate(message.text, { platform: message.platform, platformChatId: message.chatId, platformMessageId: message.messageId, onStatusUpdate: (stage) => responder.sendStatusUpdate(message.chatId, stage), onInvestigationCreated: (id) => responder.sendLink(message.chatId, "Watch Live Investigation", baseUrl + "/live/" + id) })`
  4. If non-factual: `responder.sendText(message.chatId, result.nonFactualResponse)`
  5. If verdict: `responder.sendVerdict(message.chatId, result.verdict, baseUrl + "/v/" + result.investigationId)`
  6. On error: `responder.sendText(message.chatId, errorMessage)` + mark investigation failed in repo
- Wraps pipeline call in timeout (300s)
**Validation:**
- Test file: `tests/unit/platforms/message-router.test.ts`
- Test: `"should send initial status via responder"`
- Test: `"should call pipeline.investigate with platform-agnostic fields"`
- Test: `"should send verdict via responder on success"`
- Test: `"should send non-factual response for greeting messages"`
- Test: `"should send error message on pipeline failure"`
- Test: `"should mark investigation as failed on timeout"`

### Task 2.5: Wire TelegramAdapter into index.ts and verify Telegram still works
- [x]
**Objective:** Replace the direct Grammy bot + message handler wiring in `src/index.ts` with the new `TelegramAdapter`, verifying zero behavior change.
**Details:**
- Update `src/index.ts`:
  - Remove imports of `createBot` and `createMessageHandler` from `src/bot/`
  - Import `TelegramAdapter` from `src/platforms/telegram/adapter.js`
  - Create `const telegramAdapter = new TelegramAdapter(config.TELEGRAM_BOT_TOKEN, pipeline, baseUrl, repo, feedbackRepo, githubService)`
  - Call `telegramAdapter.start()` instead of `createBot()` + `createMessageHandler()` + `startBotWithRetry()`
  - Update shutdown to call `telegramAdapter.stop()` instead of `bot.stop()`
- Update `src/server/app.ts` to receive `telegramBotUsername` as before (no change needed if passed as string)
- The old `src/bot/` files (`bot.ts`, `message-handler.ts`, `status-updater.ts`) should now be unused — mark as deprecated or delete
**Validation:**
- Test file: `tests/integration/telegram-adapter.test.ts`
- Test: `"TelegramAdapter should start without errors"` (mock Grammy)
- Test: `"TelegramAdapter should stop cleanly"`
- All existing integration tests pass: `npx vitest run tests/integration/`
- Manual: run the app locally and verify Telegram bot responds to forwarded messages identically

---

## Phase 3: WhatsApp Cloud API Client

### Task 3.1: Create WhatsApp Cloud API HTTP client
- [x]
**Objective:** Build a typed HTTP client for the Meta WhatsApp Cloud API that handles sending text messages, interactive messages, and media.
**Details:**
- Create `src/platforms/whatsapp/client.ts`
- Class `WhatsAppCloudClient`
- Constructor takes: `phoneNumberId: string`, `accessToken: string`, `apiVersion?: string` (default `"v21.0"`)
- Base URL: `https://graph.facebook.com/{apiVersion}/{phoneNumberId}/messages`
- Method `sendTextMessage(to: string, text: string)` → `POST /messages` with `{ messaging_product: "whatsapp", to, type: "text", text: { body } }`
- Method `sendInteractiveMessage(to: string, body: string, buttons: { id: string; title: string }[])` → interactive button message
- Method `sendCtaUrlMessage(to: string, body: string, buttonText: string, url: string)` → CTA URL button message
- Method `markAsRead(messageId: string)` → mark incoming message as read
- All methods use native `fetch()` with `Authorization: Bearer {accessToken}` header
- Return typed response `{ messageId: string; success: boolean }`
- Graceful error handling: log errors, return `{ success: false }` — never throw
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/client.test.ts`
- Test: `"sendTextMessage should POST to correct Cloud API URL"` (mock fetch)
- Test: `"sendTextMessage should include Bearer token in Authorization header"` (mock fetch)
- Test: `"sendInteractiveMessage should send button payload"` (mock fetch)
- Test: `"sendCtaUrlMessage should send CTA URL payload"` (mock fetch)
- Test: `"markAsRead should POST read status"` (mock fetch)
- Test: `"should handle API errors gracefully without throwing"` (mock fetch returning 400)

### Task 3.2: WhatsApp webhook signature verification
- [x]
**Objective:** Implement Meta's webhook signature verification to validate that incoming webhook payloads are genuinely from Meta.
**Details:**
- Create `src/platforms/whatsapp/webhook-signature.ts`
- Function `verifyWebhookSignature(payload: string, signature: string, appSecret: string): boolean`
- Uses HMAC-SHA256: `crypto.createHmac('sha256', appSecret).update(payload).digest('hex')`
- Signature header format: `sha256=<hex_digest>`
- Returns `true` if computed HMAC matches the signature header value
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/webhook-signature.test.ts`
- Test: `"should verify a valid signature"` — compute known HMAC, check returns true
- Test: `"should reject an invalid signature"` — tampered payload returns false
- Test: `"should handle missing sha256= prefix gracefully"`
- Test: `"should reject empty signature"`

### Task 3.3: WhatsApp webhook payload parser
- [x]
**Objective:** Parse incoming WhatsApp webhook POST payloads into `PlatformMessage` objects, handling text messages, forwarded detection, and status updates.
**Details:**
- Create `src/platforms/whatsapp/webhook-parser.ts`
- Function `parseWebhookPayload(body: unknown): ParsedWebhookEvent[]`
- `ParsedWebhookEvent` = `{ type: "message"; message: PlatformMessage }` | `{ type: "status"; messageId: string; status: string }` | `{ type: "unknown" }`
- Extract from Cloud API payload structure: `body.entry[].changes[].value.messages[]`
- Map text messages: `message.text.body` → `PlatformMessage.text`, `message.context?.forwarded` → `isForwarded`, `message.context?.frequently_forwarded` → `isFrequentlyForwarded`, `message.from` → `sender.id`
- Extract metadata: `body.entry[].changes[].value.metadata.phone_number_id`
- Handle status updates: `body.entry[].changes[].value.statuses[]` → status events
- Use Zod schema for validation of the incoming payload shape
- Ignore non-text message types (image, audio, etc.) for MVP — log and skip
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/webhook-parser.test.ts`
- Test: `"should parse a text message into PlatformMessage"`
- Test: `"should detect forwarded messages via context.forwarded"`
- Test: `"should detect frequently forwarded messages"`
- Test: `"should parse status update events"`
- Test: `"should return 'unknown' for non-text message types"`
- Test: `"should handle malformed payloads gracefully"`

---

## Phase 4: WhatsApp Formatter

### Task 4.1: WhatsApp verdict formatter
- [x]
**Objective:** Build a verdict formatter that converts `FinalVerdict` into WhatsApp-compatible markdown text.
**Details:**
- Create `src/platforms/whatsapp/formatter.ts`
- Function `formatWhatsAppVerdict(verdict: FinalVerdict): string`
- Uses WhatsApp markdown: `*bold*`, `_italic_`, `~strikethrough~`, ``` for code, `>` for blockquote
- Layout:
  - Header: emoji + `*VERDICT CATEGORY*` + confidence percentage + nuance tag
  - Deep reasoning indicator (if activated)
  - Summary paragraph
  - Confidence breakdown: plain text with emoji bar (no HTML bars)
  - Key findings (top 3 bullet points)
  - Manipulation techniques (top 2, with severity)
  - Devil's Advocate outcome
  - Source count
- Max ~4000 chars (WhatsApp limit is 4096)
- No HTML tags — pure WhatsApp markdown
- Reuse `CATEGORY_DISPLAY` emoji mapping from telegram-formatter (extract to shared constant or duplicate)
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/formatter.test.ts`
- Test: `"should format likely-false verdict with red emoji"`
- Test: `"should use WhatsApp markdown (*bold*, _italic_) instead of HTML"`
- Test: `"should include nuanceTag when present"`
- Test: `"should include confidence breakdown"`
- Test: `"should include manipulation techniques"`
- Test: `"should not exceed 4000 characters"`
- Test: `"should include Devil's Advocate outcome"`

---

## Phase 5: WhatsApp Adapter and Webhook

### Task 5.1: Create WhatsAppResponder
- [x]
**Objective:** Implement `PlatformResponder` for WhatsApp that sends messages via the Cloud API client, including sequential status updates (no message editing).
**Details:**
- Create `src/platforms/whatsapp/responder.ts`
- Class `WhatsAppResponder implements PlatformResponder`
- Constructor takes `WhatsAppCloudClient` instance
- `sendText(chatId, text)` — calls `client.sendTextMessage(chatId, text)`
- `sendVerdict(chatId, verdict, analysisUrl)` — formats with `formatWhatsAppVerdict()`, sends text message, then sends CTA URL button "View Full Analysis" with `analysisUrl`
- `sendStatusUpdate(chatId, stage)` — sends a NEW text message with the stage text (no editing — WhatsApp has no edit API). Limit to key stages only: `planning`, `searching`, `judging` (skip intermediate stages to avoid spamming)
- `sendInitial(chatId)` — sends "Investigating your claim... This may take 2-4 minutes."
- `sendLink(chatId, text, url)` — sends CTA URL button message
- All methods handle errors gracefully (log + continue)
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/responder.test.ts`
- Test: `"sendText should call WhatsAppCloudClient.sendTextMessage"`
- Test: `"sendVerdict should format with WhatsApp markdown and send CTA button"`
- Test: `"sendStatusUpdate should send new message (not edit)"`
- Test: `"sendStatusUpdate should skip non-key stages to avoid spamming"`
- Test: `"sendInitial should send investigating message"`
- Test: `"should handle API errors gracefully without throwing"`

### Task 5.2: Create WhatsApp webhook routes
- [x]
**Objective:** Create Express routes for WhatsApp webhook verification (GET) and incoming message handling (POST).
**Details:**
- Create `src/platforms/whatsapp/webhook.ts`
- Function `createWhatsAppWebhookRouter(adapter: WhatsAppAdapter, verifyToken: string, appSecret?: string): Router`
- `GET /webhook/whatsapp` — verification challenge endpoint:
  - Check `req.query["hub.mode"] === "subscribe"` and `req.query["hub.verify_token"] === verifyToken`
  - Return `res.status(200).send(req.query["hub.challenge"])`
  - Return `res.sendStatus(403)` on mismatch
- `POST /webhook/whatsapp` — incoming messages:
  - Respond `200 OK` immediately (Meta requires fast acknowledgment)
  - If `appSecret` provided, verify webhook signature from `x-hub-signature-256` header
  - Parse payload with `parseWebhookPayload(req.body)`
  - For each `type: "message"` event, call `adapter.handleMessage(event.message)`
  - Process asynchronously (don't block the response)
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/webhook.test.ts`
- Test: `"GET /webhook/whatsapp should return challenge on valid verify_token"`
- Test: `"GET /webhook/whatsapp should return 403 on invalid verify_token"`
- Test: `"POST /webhook/whatsapp should return 200 immediately"`
- Test: `"POST /webhook/whatsapp should reject invalid signature when appSecret is set"`
- Test: `"POST /webhook/whatsapp should parse and route text messages to adapter"`
- Test: `"POST /webhook/whatsapp should ignore non-text message types"`

### Task 5.3: Create WhatsAppAdapter
- [x]
**Objective:** Create a `WhatsAppAdapter` that implements `PlatformAdapter`, wiring the Cloud API client, webhook parser, responder, and message router together.
**Details:**
- Create `src/platforms/whatsapp/adapter.ts`
- Class `WhatsAppAdapter implements PlatformAdapter`
- Constructor takes: `phoneNumberId: string`, `accessToken: string`, `verifyToken: string`, `appSecret?: string`, `messageRouter: MessageRouter`
- `readonly platform = "whatsapp"`
- Creates `WhatsAppCloudClient` and `WhatsAppResponder` internally
- Method `handleMessage(message: PlatformMessage): Promise<void>` — routes through `messageRouter.route(message, this.responder)`
- Method `getWebhookRouter(): Router` — returns the Express router from `createWhatsAppWebhookRouter()`
- `start()` — no-op for webhook-based adapter (webhooks are mounted via Express)
- `stop()` — no-op (nothing to disconnect)
- First-message welcome detection: if user has never messaged before (check DB), send welcome message before routing to pipeline
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/adapter.test.ts`
- Test: `"should create adapter with platform 'whatsapp'"`
- Test: `"handleMessage should route PlatformMessage through message router"`
- Test: `"getWebhookRouter should return an Express Router"`
- Test: `"start should succeed (no-op)"`
- Test: `"stop should succeed (no-op)"`

### Task 5.4: Create WhatsApp platform barrel export
- [x]
**Objective:** Create barrel export for all WhatsApp platform modules.
**Details:**
- Create `src/platforms/whatsapp/index.ts` — re-exports: `WhatsAppAdapter`, `WhatsAppResponder`, `WhatsAppCloudClient`, `formatWhatsAppVerdict`, `createWhatsAppWebhookRouter`, `parseWebhookPayload`, `verifyWebhookSignature`
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/index.test.ts`
- Test: `"should export all WhatsApp platform modules"`
- `npx tsc --noEmit` passes

---

## Phase 6: Phone Number Privacy

### Task 6.1: Phone number hashing utility
- [x]
**Objective:** Create a utility that hashes phone numbers before they are stored or logged, since WhatsApp identifies users by phone number (PII).
**Details:**
- Create `src/platforms/whatsapp/phone-hash.ts`
- Function `hashPhoneNumber(phoneNumber: string, salt?: string): string` — returns SHA-256 hash of `salt + phoneNumber` as hex string
- Default salt from env var `PHONE_HASH_SALT` or a static fallback
- Function `normalizePhoneNumber(raw: string): string` — strips non-digit characters, ensures starts with country code
- The adapter should call `hashPhoneNumber()` on `sender.id` before passing to `PlatformMessage` or storing in DB
- Never log raw phone numbers — always hash first
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/phone-hash.test.ts`
- Test: `"should produce consistent hash for same phone number"`
- Test: `"should produce different hashes for different phone numbers"`
- Test: `"should normalize phone numbers by stripping non-digits"`
- Test: `"should use salt in hash computation"`
- Test: `"different salts should produce different hashes"`

---

## Phase 7: Environment Configuration

### Task 7.1: Add WhatsApp environment variables
- [x]
**Objective:** Add WhatsApp-specific configuration to the Zod env schema, making them optional so the app can run with Telegram only.
**Details:**
- Update `src/config/env.ts`:
  - Add `WHATSAPP_PHONE_NUMBER_ID: z.string().optional()` — the phone number ID from Meta Business Manager
  - Add `WHATSAPP_ACCESS_TOKEN: z.string().optional()` — the permanent access token
  - Add `WHATSAPP_VERIFY_TOKEN: z.string().optional()` — webhook verification token (chosen by us)
  - Add `WHATSAPP_APP_SECRET: z.string().optional()` — Meta app secret for webhook signature verification
  - Add `PHONE_HASH_SALT: z.string().default("forwardcheck-ai-v1")` — salt for phone number hashing
  - Add `WHATSAPP_ENABLED: z.string().default("false").transform(v => v === "true")` — feature flag
- Update `.env.example` with all new variables documented
- All WhatsApp vars are optional — app starts fine with Telegram only
**Validation:**
- Test file: `tests/unit/config/env-whatsapp.test.ts`
- Test: `"should load env without WhatsApp vars (all optional)"`
- Test: `"should load env with WhatsApp vars present"`
- Test: `"should default WHATSAPP_ENABLED to false"`
- Test: `"should default PHONE_HASH_SALT"`
- All existing env tests still pass: `npx vitest run tests/unit/config/env.test.ts`

---

## Phase 8: Wire WhatsApp into Application

### Task 8.1: Mount WhatsApp webhook routes in Express
- [x]
**Objective:** Conditionally mount WhatsApp webhook routes in the Express server when WhatsApp is enabled.
**Details:**
- Update `src/server/app.ts`:
  - Accept optional `whatsAppAdapter?: WhatsAppAdapter` parameter in `createApp()`
  - If `whatsAppAdapter` is provided, mount `whatsAppAdapter.getWebhookRouter()` on the Express app
  - Mount BEFORE the 404 handler
- This is conditional — when WhatsApp is not configured, no routes are mounted
**Validation:**
- Test file: `tests/unit/server/app-whatsapp.test.ts`
- Test: `"GET /webhook/whatsapp should return 404 when WhatsApp not configured"`
- Test: `"GET /webhook/whatsapp should handle verification when WhatsApp configured"`
- All existing server tests still pass

### Task 8.2: Wire WhatsApp adapter into index.ts
- [x]
**Objective:** Conditionally create and start the `WhatsAppAdapter` in the application entry point when WhatsApp env vars are present.
**Details:**
- Update `src/index.ts`:
  - Import `WhatsAppAdapter` from `src/platforms/whatsapp/adapter.js`
  - Import `createMessageRouter` from `src/platforms/message-router.js`
  - Create `messageRouter = createMessageRouter(pipeline, repo, baseUrl)`
  - If `config.WHATSAPP_ENABLED && config.WHATSAPP_PHONE_NUMBER_ID && config.WHATSAPP_ACCESS_TOKEN && config.WHATSAPP_VERIFY_TOKEN`:
    - Create `whatsAppAdapter = new WhatsAppAdapter(config.WHATSAPP_PHONE_NUMBER_ID, config.WHATSAPP_ACCESS_TOKEN, config.WHATSAPP_VERIFY_TOKEN, config.WHATSAPP_APP_SECRET, messageRouter)`
    - Pass `whatsAppAdapter` to `createApp()`
    - Call `whatsAppAdapter.start()`
    - Log: `"WhatsApp adapter initialized"`
  - Update shutdown: call `whatsAppAdapter?.stop()`
  - Log warning if WHATSAPP_ENABLED but credentials missing
**Validation:**
- Test file: `tests/integration/app-whatsapp-startup.test.ts`
- Test: `"should start without WhatsApp when env vars not set"`
- Test: `"should initialize WhatsApp adapter when env vars are present"` (mock Cloud API)
- Test: `"should log warning when WHATSAPP_ENABLED but credentials missing"`
- All existing app startup tests still pass

### Task 8.3: Update landing page with WhatsApp info
- [x]
**Objective:** Conditionally show WhatsApp contact info on the landing page when WhatsApp is enabled.
**Details:**
- Update `src/server/app.ts` to pass `whatsappEnabled: boolean` to the landing page template
- Update `src/server/views/landing.ejs`:
  - Add a WhatsApp section next to the Telegram section (if `whatsappEnabled`)
  - Include `wa.me/<phone_number>` deep link for one-tap WhatsApp messaging
  - Use WhatsApp brand color (#25D366) for the button
  - Render conditionally based on `whatsappEnabled` flag
**Validation:**
- Test file: `tests/unit/server/views/landing-whatsapp.test.ts`
- Test: `"should render landing page without WhatsApp section when disabled"`
- Test: `"should render landing page with WhatsApp section when enabled"`
- Test: `"should include wa.me deep link"`

---

## Phase 9: Integration Testing

### Task 9.1: WhatsApp webhook end-to-end test
- [ ]
**Objective:** Test the complete WhatsApp webhook flow from incoming POST payload to pipeline invocation with mock responses.
**Details:**
- Create `tests/integration/whatsapp-webhook-e2e.test.ts`
- Set up Express app with WhatsApp webhook routes
- Simulate Meta webhook POST with a text message payload
- Mock the pipeline to return a canned verdict
- Verify:
  - Webhook returns 200 immediately
  - Pipeline `investigate()` is called with correct text
  - `platform` field is `"whatsapp"`
  - WhatsApp Cloud API `sendTextMessage` is called with the verdict (mock HTTP)
  - Investigation is created in the database with `source_platform: "whatsapp"`
**Validation:**
- This IS the test — `tests/integration/whatsapp-webhook-e2e.test.ts`
- Test: `"should process a WhatsApp text message end-to-end"` — full webhook → pipeline → response flow
- Test: `"should handle forwarded WhatsApp message with context.forwarded"`
- Test: `"should reject webhook with invalid verify token"`
- Test timeout: 30 seconds

### Task 9.2: Cross-platform pipeline test
- [ ]
**Objective:** Verify that the same pipeline produces identical verdicts regardless of whether the claim came from Telegram, WhatsApp, or web.
**Details:**
- Create `tests/integration/cross-platform-pipeline.test.ts`
- Run the same claim through the pipeline three times with different `platform` values: `"telegram"`, `"whatsapp"`, `"web"`
- Mock all AI agents to return deterministic results
- Verify:
  - All three produce the same verdict category and confidence
  - Database records have correct `source_platform` values
  - Platform-specific fields (`platform_chat_id`, `platform_message_id`) are stored correctly
**Validation:**
- This IS the test — `tests/integration/cross-platform-pipeline.test.ts`
- Test: `"should produce identical verdicts across telegram, whatsapp, and web platforms"`
- Test: `"should store correct source_platform in database for each channel"`
- Test timeout: 30 seconds

### Task 9.3: WhatsApp formatter snapshot tests
- [ ]
**Objective:** Create snapshot tests for the WhatsApp verdict formatter to catch formatting regressions.
**Details:**
- Create `tests/unit/platforms/whatsapp/formatter-snapshots.test.ts`
- Test with 5 verdict fixtures:
  1. Likely-true with high confidence
  2. Likely-false with manipulation techniques
  3. Partially-true with nuance tag
  4. Unverified with deep reasoning activated
  5. Satire category
- Use Vitest snapshot matching to lock down the format
- Verify no HTML tags leak into WhatsApp output
**Validation:**
- Test file: `tests/unit/platforms/whatsapp/formatter-snapshots.test.ts`
- Test: `"should format likely-true verdict"` — snapshot
- Test: `"should format likely-false verdict with manipulation"` — snapshot
- Test: `"should format partially-true verdict with nuance tag"` — snapshot
- Test: `"should format unverified verdict with deep reasoning"` — snapshot
- Test: `"should format satire verdict"` — snapshot
- Test: `"should contain zero HTML tags in any output"`

---

## Phase 10: Documentation and Demo

### Task 10.1: Update .env.example with WhatsApp configuration
- [ ]
**Objective:** Document all new WhatsApp environment variables in `.env.example`.
**Details:**
- Update `.env.example`:
  - Add section header `# WhatsApp Configuration (optional — set WHATSAPP_ENABLED=true to activate)`
  - Add: `WHATSAPP_ENABLED=false`, `WHATSAPP_PHONE_NUMBER_ID=`, `WHATSAPP_ACCESS_TOKEN=`, `WHATSAPP_VERIFY_TOKEN=`, `WHATSAPP_APP_SECRET=`, `PHONE_HASH_SALT=forwardcheck-ai-v1`
  - Add inline comments explaining each variable and where to find the values (Meta Business Manager)
**Validation:**
- Test: `.env.example` contains all WhatsApp variables
- Test: App starts with only Telegram vars set (WhatsApp disabled)

### Task 10.2: WhatsApp webhook test script
- [ ]
**Objective:** Create a script that simulates WhatsApp webhook payloads for local development testing.
**Details:**
- Create `scripts/test-whatsapp-webhook.ts`
- Sends POST requests to `http://localhost:3000/webhook/whatsapp` with:
  - A text message payload
  - A forwarded message payload (with `context.forwarded: true`)
  - A frequently forwarded payload (with `context.frequently_forwarded: true`)
  - A verification GET request
- Uses native `fetch()` — no dependencies
- Logs responses for each request
**Validation:**
- Run: `npx tsx scripts/test-whatsapp-webhook.ts`
- Verify all 4 requests complete without errors
- Verify forwarded message detection works
- Verify verification challenge response

---

## Dependency Graph

```
Phase 1 (Platform Abstraction)
  Task 1.1 (types.ts)
    └─→ Task 1.2 (pipeline generalization) ← depends on 1.1
    └─→ Task 1.3 (DB migration)
    └─→ Task 1.4 (investigation repo) ← depends on 1.3
    └─→ Task 1.5 (feedback repo) ← depends on 1.3

Phase 2 (Telegram Refactor) ← depends on Phase 1
  Task 2.1 (TelegramResponder) ← depends on 1.1
    └─→ Task 2.2 (TelegramAdapter) ← depends on 2.1
  Task 2.3 (move formatter)
    └─→ Task 2.4 (message router) ← depends on 1.1, 1.2
          └─→ Task 2.5 (wire into index.ts) ← depends on 2.2, 2.4

Phase 3 (WhatsApp Client) ← depends on Phase 1
  Task 3.1 (Cloud API client)
  Task 3.2 (webhook signature)
  Task 3.3 (webhook parser) ← depends on 1.1

Phase 4 (WhatsApp Formatter)
  Task 4.1 (verdict formatter) — independent

Phase 5 (WhatsApp Adapter) ← depends on Phase 3, Phase 4
  Task 5.1 (WhatsAppResponder) ← depends on 3.1, 4.1
  Task 5.2 (webhook routes) ← depends on 3.2, 3.3, 5.3
  Task 5.3 (WhatsAppAdapter) ← depends on 5.1, 2.4
  Task 5.4 (barrel export) ← depends on 5.1, 5.2, 5.3

Phase 6 (Phone Privacy) — independent
  Task 6.1 (phone hashing)

Phase 7 (Environment Config) — independent
  Task 7.1 (env vars)

Phase 8 (Wire WhatsApp) ← depends on Phase 5, Phase 6, Phase 7
  Task 8.1 (mount webhook routes) ← depends on 5.2, 5.3
  Task 8.2 (wire into index.ts) ← depends on 8.1, 7.1
  Task 8.3 (landing page) ← depends on 8.1

Phase 9 (Integration Testing) ← depends on Phase 8
  Task 9.1 (webhook e2e) ← depends on 8.2
  Task 9.2 (cross-platform) ← depends on 8.2
  Task 9.3 (formatter snapshots) ← depends on 4.1

Phase 10 (Docs & Demo) ← depends on Phase 7
  Task 10.1 (.env.example) ← depends on 7.1
  Task 10.2 (test script) ← depends on 8.2
```

### Parallelization Opportunities

```
Parallel Track A: Phase 1 → Phase 2 → Task 8.2 (Telegram refactor path)
Parallel Track B: Phase 3 + Phase 4 + Phase 6 + Phase 7 (all independent)
                  └─→ Phase 5 (WhatsApp adapter)
                        └─→ Phase 8 (wire everything)
                              └─→ Phase 9 (integration tests)
                                    └─→ Phase 10 (docs)
```
