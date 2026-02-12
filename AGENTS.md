# AGENTS.md — ForwardCheck-AI Operational Guide

## Project Info

- **Name:** ForwardCheck-AI
- **Language:** TypeScript (strict ESM, NodeNext)
- **Runtime:** Node.js 20+
- **Root:** `/Users/ralph/Projects/forward-check-ai`
- **Package manager:** npm
- **Test framework:** Vitest
- **Branch:** develop

## Build & Run

```bash
# Install dependencies
npm install

# Type check
npx tsc --noEmit

# Run tests
npx vitest run

# Run dev server
npx tsx src/index.ts

# Run bot only
npx tsx src/bot.ts
```

## Validation

Run these after implementing to get immediate feedback:

- **Tests:** `npx vitest run`
- **Typecheck:** `npx tsc --noEmit`

## Architecture Overview

### Pipeline Flow

```
Telegram Message → Classifier (Haiku) → Claim Strategist (Opus 4.6)
  → 2-3 Parallel Investigators (Sonnet 4.5) → Devil's Advocate (Opus 4.6)
  → Judge (Opus 4.6) → VerdictFormatter (code) → Telegram Reply + Web Page
```

### Key Modules

| Module | Location | Responsibility |
|--------|----------|---------------|
| Bot | `src/bot/` | Telegram bot, message handling, status updates |
| Server | `src/server/` | Express server, health endpoint, verdict pages |
| Database | `src/db/` | SQLite connection, investigation repository |
| Schemas | `src/schemas/` | Zod schemas for all agent I/O |
| Services | `src/services/` | Claude client wrapper, claim cache |
| Agents | `src/agents/` | Agent implementations (classifier, strategist, investigators, DA, judge) |
| Tools | `src/tools/` | Search tools (Brave, Google Fact Check) |
| Orchestrator | `src/orchestrator/` | Pipeline orchestration, agent runner, tool-use loop |
| Formatter | `src/formatter/` | Verdict formatting for Telegram + web |
| Config | `src/config/` | Environment config, logger setup |

### Data Flow

1. User forwards message to Telegram bot
2. Bot saves to SQLite, sends "Investigating..." status
3. Orchestrator runs pipeline:
   a. Classifier (Haiku) → ClassifierResult
   b. Claim Strategist (Opus 4.6) → SearchStrategy
   c. 2-3 Investigators (Sonnet 4.5) in parallel → AgentReport[]
   d. Devil's Advocate (Opus 4.6) → ChallengeReport
   e. Judge (Opus 4.6 + brave_web_search) → FinalVerdict
4. VerdictFormatter produces Telegram HTML + saves to DB
5. Bot sends verdict with "View Full Analysis" link
6. Web server renders `/v/:id` verdict page

## Coding Standards

- **Strict TypeScript** — `strict: true` in tsconfig, no `any`
- **ESM modules** — `"type": "module"` in package.json, `.js` extensions in imports
- **Max 400 lines per file** — extract if larger
- **No `console.log`** — use Pino logger from `src/config/logger.ts`
- **Zod for validation** — all agent I/O validated through Zod schemas
- **Descriptive test names** — `"should return likely-false when confidence < 29%"`
- **Test isolation** — each test independent, no shared mutable state
- **Parameterized SQL** — never interpolate user input

## Conventions

- **File naming:** kebab-case (`agent-runner.ts`, `classifier-agent.ts`)
- **Class naming:** PascalCase (`ClassifierAgent`, `VerdictFormatter`)
- **Test files:** mirror source structure in `tests/` with `.test.ts` suffix
- **Barrel exports:** `index.ts` in each module directory
- **Environment variables:** loaded via `src/config/env.ts`, validated at startup

## Gotchas

- **Zod v4 installed (4.3.6):** The `z` import and API (`z.object`, `z.string`, `z.enum`, etc.) are compatible with the spec's schema definitions. Import as `import { z } from "zod"`.
- **Express v5 installed (5.2.1):** Express 5 is the latest major. Router API is mostly the same as v4 but `req.params` returns `Record<string, string | undefined>` and error handling has minor differences.
- **Zod v4 `.default()` + `.transform()` ordering:** In Zod v4, `.default()` placed AFTER `.transform().pipe()` returns the raw default value without running the transform. Place `.default()` BEFORE `.transform()` so the default feeds through the pipeline. Example: `z.string().default("3000").transform(val => parseInt(val, 10)).pipe(z.number())`.
- **dotenv v17 logs injection messages to stdout:** `dotenv@17.2.4` prints "[dotenv@17.2.4] injecting env (N) from .env" on every `config()` call. This is cosmetic noise in tests but harmless.
- **SQLite `datetime('now')` has second-level granularity:** Rapid sequential inserts get identical `created_at` values, making `ORDER BY created_at DESC` non-deterministic. Use `ORDER BY rowid DESC` for reliable insertion-order sorting.
- **Vitest 4 `it()` options API:** Vitest 4 removed the `it(name, fn, { timeout })` 3-arg signature. Use `it(name, { timeout }, fn)` or `it.skipIf(cond)(name, { timeout }, fn)` instead. The old pattern was deprecated in Vitest 3.
- **Anthropic SDK adaptive thinking effort:** Effort levels (`low`, `medium`, `high`, `max`) are on `output_config.effort` in `MessageCreateParamsBase`, NOT on `ThinkingConfigAdaptive`. `ThinkingConfigAdaptive` only has `{ type: "adaptive" }`. For agents that need different effort levels, set `output_config: { effort: "high" }` alongside `thinking: { type: "adaptive" }`.

## Conventions

- **Env config testing pattern:** `loadEnv()` accepts an optional `env` record for testing. Pass env vars directly instead of manipulating `process.env` to avoid interference from `.env` file loading.

## Decisions Log

- **Task 0.1:** Used `noUncheckedIndexedAccess: true` in tsconfig for extra safety on array/object indexing. Used `isolatedModules: true` for compatibility with transpilers. Vitest config kept minimal — no globals, file pattern `tests/**/*.test.ts`.
- **Task 0.2:** Installed all production deps. Zod resolved to v4 (4.3.6) — API is backward-compatible with spec schemas. Express resolved to v5 (5.2.1). All 9 production packages + 3 dev type packages installed and importable.
- **Task 0.3:** Env config uses Zod for validation with `loadEnv(env?)` pattern. `dotenv.config()` called inside `loadEnv()` only when no custom env is provided. Added `dotenv` as production dependency. `.env.example` already existed from prior setup.
- **Task 0.4:** Logger uses `createLogger(options?)` factory pattern with `LoggerOptions` interface (`level`, `pretty`). Pretty printing via pino `transport` config (not the deprecated `prettyPrint` option). Defaults to `info` level and JSON output. Consumers will call `createLogger({ level: config.LOG_LEVEL, pretty: config.NODE_ENV === "development" })`.
- **Task 1.1:** Database connection uses `createDatabase(dbPath)` factory function. Enables WAL mode and foreign keys via pragmas. Auto-creates parent directories with `mkdirSync(dirname(dbPath), { recursive: true })`. Tests use `os.tmpdir()` with random UUIDs for isolation, and clean up `-wal`/`-shm` files in afterEach.
- **Task 1.2:** Migrations use `runMigrations(db)` with `CREATE TABLE IF NOT EXISTS` for idempotency. All JSON columns (classifier_result, search_strategy, agent_reports, challenge_report, final_verdict) use the `JSON` column type — stored as TEXT in SQLite but semantically typed. Default values: `status='pending'`, `created_at=datetime('now')`, `total_cost_usd=0`.
- **Task 1.3:** `InvestigationRepository` class wraps better-sqlite3 with typed CRUD methods. JSON columns serialized with `JSON.stringify()` on write, `JSON.parse()` on read. Uses `nanoid()` for ID generation (21-char default). `getRecent()` orders by `rowid DESC` instead of `created_at DESC` because `datetime('now')` has second-level granularity — multiple inserts within the same second get identical timestamps.
- **Task 3.1:** `ClaudeClient` class wraps Anthropic SDK with `createMessage()` and `estimateCost()`. Pricing: Haiku $1/$5, Sonnet $3/$15, Opus $5/$25 per MTok (input/output). Thinking tokens billed as output tokens. Exposes `_client` getter for test mocking — assign `client._client.messages.create` directly. QA test uses `it.skipIf(!apiKey)` to auto-skip when no API key is set. `MODELS` constant exported with all 3 model IDs.
- **Task 3.2:** `runAgent(config)` function implements the core agentic tool-use loop. Uses `Promise.race` for timeout enforcement (not AbortController signal — mocks don't respect it). Internal `runAgentLoop()` handles the multi-turn loop: calls `client.createMessage()`, checks for `tool_use` blocks, executes tools via `onToolCall` callback, pushes assistant content + tool results to messages array, loops until `stop_reason !== "tool_use"` or maxTurns reached. Tool errors are caught and returned as `is_error: true` tool_result blocks (never thrown). Thinking config passed through to API. Token usage and cost accumulated across turns. `ContentBlockParam` requires cast from `response.content` due to SDK type narrowing.
- **Task 4.1:** `braveWebSearch(query, count, apiKey)` function wraps the Brave Search API. Returns `{ results: BraveSearchResult[] }` with `title`, `url`, `description`, `age` fields. API key passed as parameter (not read from env directly) so tool registry can inject it. Graceful error handling: returns `{ results: [] }` on HTTP errors or network failures. `braveSearchToolDefinition` exported as a Claude `Tool` type for agent tool configs. Tests mock global `fetch` via `vi.stubGlobal("fetch", mockFn)`.
- **Task 4.2:** `googleFactCheckSearch(query, apiKey)` function wraps the Google Fact Check Tools API (`v1alpha1/claims:search`). Returns `{ claims: FactCheckClaim[] }` with `text`, `claimant`, and `claimReviewMarkup` (containing `url`, `title`, `publisher`, `rating`). Follows same pattern as Brave Search: API key as parameter, graceful error handling returning `{ claims: [] }`. Claims without `claimReview` arrays are filtered out. When a claim has multiple reviews, uses the first one. `googleFactCheckToolDefinition` exported for Claude tool configs.
- **Task 4.3:** `ToolRegistry` class maps tool names to handlers and Claude tool definitions. Methods: `register(name, handler, definition)`, `execute(name, input)` → `Promise<string>`, `getToolDefinitions()` → `Tool[]`. Unknown tools return error strings (not thrown). Handler execution errors are caught and returned as error strings. Handlers can be sync or async — both are awaited. The agent runner's `onToolCall` callback delegates to `registry.execute()`. Tool definitions are stored alongside handlers so `getToolDefinitions()` returns them in registration order.
- **Task 5.1:** `createApp()` factory function creates and configures Express 5 app. Sets up JSON body parsing, EJS view engine (views in `src/server/views/`), `/health` endpoint returning `{ status, timestamp, uptime }`, 404 handler, and error handling middleware. Does NOT call `app.listen()` — server startup belongs in the entry point (`src/index.ts`). Tests use `app.listen(0)` on a random port with native `fetch` (no supertest needed). Express 5 error handler requires explicit 4-param signature `(err, req, res, next)` to be recognized as error middleware. `__dirname` derived from `import.meta.url` for ESM compatibility.
- **Task 5.2:** `createApp(repo?)` now accepts an optional `InvestigationRepository`. When provided, mounts `createInvestigateRouter(repo)` which provides `POST /api/investigate` (validates message, creates investigation, returns `{ id, status }` with 201) and `GET /api/investigation/:id` (returns investigation or 404). Routes in `src/server/routes/investigate.ts` use Express `Router`. Input validation is manual (checks non-empty string) since this is an internal API — Zod validation happens at the agent layer. Tests create isolated SQLite DBs in `os.tmpdir()` per test.
