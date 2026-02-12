# ForwardCheck-AI — Implementation Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

---

## Phase 0: Project Scaffolding

### Task 0.1: Initialize TypeScript project with strict ESM configuration
- [x]
**Objective:** Set up package.json, tsconfig.json, and ESM module configuration for strict TypeScript.
**Details:**
- `npm init -y` with `"type": "module"`
- Install core dev deps: `typescript`, `vitest`, `tsx`, `@types/node`
- Create `tsconfig.json` with `strict: true`, `module: "NodeNext"`, `moduleResolution: "NodeNext"`, `outDir: "./dist"`, `rootDir: "./src"`, `target: "ES2022"`
- Create `src/index.ts` with a placeholder export
- Create `vitest.config.ts`
**Validation:**
- Test file: `tests/unit/setup.test.ts`
- Test: `"tsconfig exists and is valid JSON"`
- Test: `"package.json has type module"`
- `npx tsc --noEmit` passes
- `npx vitest run` passes

### Task 0.2: Install production dependencies
- [x]
**Objective:** Install all production dependencies specified in the tech stack.
**Details:**
- Install: `grammy`, `express`, `better-sqlite3`, `@anthropic-ai/sdk`, `zod`, `nanoid`, `pino`, `pino-pretty`, `ejs`
- Install dev types: `@types/express`, `@types/better-sqlite3`, `@types/ejs`
- Verify all packages resolve correctly
**Validation:**
- Test file: `tests/unit/dependencies.test.ts`
- Test: `"all production dependencies are importable"` — dynamically import each package
- `npm ls` shows no missing deps

### Task 0.3: Create environment configuration module
- [x]
**Objective:** Build a typed environment config loader that reads `.env` and validates required variables.
**Details:**
- Create `src/config/env.ts` — loads env vars with defaults, validates required keys
- Use Zod to validate env schema: `ANTHROPIC_API_KEY`, `TELEGRAM_BOT_TOKEN`, `BRAVE_SEARCH_API_KEY` (optional), `GOOGLE_FACTCHECK_API_KEY` (optional), `PORT` (default 3000), `NODE_ENV`, `LOG_LEVEL`, `DATABASE_PATH` (default `./data/forwardcheck.db`)
- Install `dotenv` for `.env` loading
- Create `.env.example` with all variables documented
**Validation:**
- Test file: `tests/unit/config/env.test.ts`
- Test: `"should load valid env vars without error"`
- Test: `"should throw on missing ANTHROPIC_API_KEY"`
- Test: `"should use default values for optional vars"`

### Task 0.4: Set up Pino logger
- [x]
**Objective:** Create a configured Pino logger instance for structured JSON logging.
**Details:**
- Create `src/config/logger.ts` — exports a configured Pino instance
- Log level from `LOG_LEVEL` env var (default: `info`)
- Pretty printing in development mode via `pino-pretty`
- Include timestamp and pid
**Validation:**
- Test file: `tests/unit/config/logger.test.ts`
- Test: `"should export a logger with info method"`
- Test: `"should respect log level from env"`

---

## Phase 1: Database Layer

### Task 1.1: SQLite connection with WAL mode
- [x]
**Objective:** Create a SQLite database connection using better-sqlite3 with WAL mode enabled.
**Details:**
- Create `src/db/connection.ts` — exports a function `createDatabase(path: string)` that returns a better-sqlite3 Database instance
- Enable WAL mode: `db.pragma('journal_mode = WAL')`
- Enable foreign keys: `db.pragma('foreign_keys = ON')`
- Create `data/` directory if it doesn't exist
**Validation:**
- Test file: `tests/unit/db/connection.test.ts`
- Test: `"should create database file at specified path"`
- Test: `"should enable WAL mode"`
- Test: `"should enable foreign keys"`
- Cleanup: delete test database file after each test

### Task 1.2: Investigations table schema and migration
- [x]
**Objective:** Create the `investigations` table with all fields needed to store pipeline results.
**Details:**
- Create `src/db/migrations.ts` — `runMigrations(db)` function
- Table `investigations`: `id TEXT PRIMARY KEY`, `original_message TEXT NOT NULL`, `extracted_claim TEXT`, `status TEXT NOT NULL DEFAULT 'pending'`, `classifier_result JSON`, `search_strategy JSON`, `agent_reports JSON`, `challenge_report JSON`, `final_verdict JSON`, `telegram_chat_id TEXT`, `telegram_message_id TEXT`, `created_at TEXT NOT NULL DEFAULT (datetime('now'))`, `completed_at TEXT`, `total_cost_usd REAL DEFAULT 0`, `pipeline_duration_ms INTEGER`
**Validation:**
- Test file: `tests/unit/db/migrations.test.ts`
- Test: `"should create investigations table with all columns"`
- Test: `"should be idempotent — running twice doesn't error"`
- Cleanup: delete test database after each test

### Task 1.3: Investigation repository (CRUD operations)
- [x]
**Objective:** Create a repository class for investigations table with create, read, update operations.
**Details:**
- Create `src/db/investigation-repository.ts` — class `InvestigationRepository`
- Methods: `create(originalMessage, telegramChatId?, telegramMessageId?)` → returns id (nanoid), `getById(id)` → Investigation | null, `updateStatus(id, status)`, `updateClassifierResult(id, result)`, `updateSearchStrategy(id, strategy)`, `updateAgentReports(id, reports)`, `updateChallengeReport(id, report)`, `updateFinalVerdict(id, verdict, duration, cost)`, `getRecent(limit)` → Investigation[]
- All JSON fields stored as serialized strings, parsed on read
**Validation:**
- Test file: `tests/unit/db/investigation-repository.test.ts`
- Test: `"should create investigation and return nanoid"`
- Test: `"should retrieve investigation by id"`
- Test: `"should return null for non-existent id"`
- Test: `"should update status"`
- Test: `"should update final verdict with duration and cost"`
- Test: `"should list recent investigations"`
- Cleanup: delete test database after each test

---

## Phase 2: Zod Schemas

### Task 2.1: ClassifierResult schema
- [x]
**Objective:** Define the Zod schema for Classifier agent output.
**Details:**
- Create `src/schemas/classifier-result.ts`
- Schema as defined in spec Section 6: category, extractedClaim, isCompound, domain, language, urgency, reasoning
- Export both the Zod schema and the inferred TypeScript type
**Validation:**
- Test file: `tests/unit/schemas/classifier-result.test.ts`
- Test: `"should validate a correct ClassifierResult"`
- Test: `"should reject missing required fields"`
- Test: `"should reject invalid category enum value"`
- Test: `"should reject invalid domain enum value"`

### Task 2.2: SearchStrategy schema
- [ ]
**Objective:** Define the Zod schema for Claim Strategist agent output.
**Details:**
- Create `src/schemas/search-strategy.ts`
- Schema as defined in spec Section 6: claimCharacteristics, investigatorGuidance (3 roles with targetQueries, prioritySources, lookFor), falsificationCriteria, thinkingExcerpt
**Validation:**
- Test file: `tests/unit/schemas/search-strategy.test.ts`
- Test: `"should validate a correct SearchStrategy"`
- Test: `"should require minimum 2 target queries per investigator"`
- Test: `"should enforce max 500 chars on thinkingExcerpt"`
- Test: `"should reject missing falsification criteria"`

### Task 2.3: AgentReport schema
- [ ]
**Objective:** Define the Zod schema for Investigator agent output.
**Details:**
- Create `src/schemas/agent-report.ts`
- Schema as defined in spec Section 6: agentRole, summary, findings (with nested sources), manipulationIndicators, overallAssessment, confidenceScore
**Validation:**
- Test file: `tests/unit/schemas/agent-report.test.ts`
- Test: `"should validate a correct AgentReport"`
- Test: `"should validate findings with nested sources"`
- Test: `"should enforce confidence score 0-100 range"`
- Test: `"should allow optional manipulationIndicators"`

### Task 2.4: ChallengeReport schema
- [ ]
**Objective:** Define the Zod schema for Devil's Advocate agent output.
**Details:**
- Create `src/schemas/challenge-report.ts`
- Schema as defined in spec Section 6: challenges (with targetAgent, claim, challenge, severity, evidence), overallAssessment, suggestedConfidenceAdjustment (-30 to +30), counterArgumentSucceeded, counterArgumentSummary, thinkingExcerpt
**Validation:**
- Test file: `tests/unit/schemas/challenge-report.test.ts`
- Test: `"should validate a correct ChallengeReport"`
- Test: `"should enforce confidence adjustment range -30 to +30"`
- Test: `"should require counterArgumentSucceeded boolean"`
- Test: `"should enforce max 500 chars on thinkingExcerpt"`

### Task 2.5: FinalVerdict schema
- [ ]
**Objective:** Define the Zod schema for Judge agent output.
**Details:**
- Create `src/schemas/final-verdict.ts`
- Schema as defined in spec Section 6: category (6 values), nuanceTag (optional), confidence, confidenceDecomposition (4 components), summary, reasoning, manipulationTechniques, keyFindings, sources, whatWouldChangeMyMind, falsificationCriteria (optional), devilsAdvocateOutcome, deepReasoningActivated, thinkingSummary
**Validation:**
- Test file: `tests/unit/schemas/final-verdict.test.ts`
- Test: `"should validate a correct FinalVerdict"`
- Test: `"should validate all 6 verdict categories"`
- Test: `"should validate confidence decomposition with 4 components"`
- Test: `"should allow optional nuanceTag"`
- Test: `"should validate manipulation techniques array"`

### Task 2.6: Schemas barrel export
- [ ]
**Objective:** Create an index.ts barrel export for all schemas.
**Details:**
- Create `src/schemas/index.ts` — re-exports all schemas and types
- Verify all schemas are accessible via single import
**Validation:**
- Test file: `tests/unit/schemas/index.test.ts`
- Test: `"should export all 5 schemas"`
- Test: `"should export all 5 TypeScript types"`

---

## Phase 3: Anthropic SDK Integration

### Task 3.1: Claude client wrapper
- [ ]
**Objective:** Create a thin wrapper around the Anthropic SDK that handles initialization and provides typed helper methods.
**Details:**
- Create `src/services/claude-client.ts`
- Class `ClaudeClient` — constructor takes API key
- Method `createMessage(params)` — wraps `client.messages.create()` with logging (model, input/output tokens, cost)
- Method `estimateCost(model, inputTokens, outputTokens, thinkingTokens?)` — returns estimated USD cost based on model pricing
- Export model constants: `MODELS = { HAIKU: "claude-haiku-4-5-20251001", SONNET: "claude-sonnet-4-5-20250929", OPUS: "claude-opus-4-6" }`
**Validation:**
- Test file: `tests/unit/services/claude-client.test.ts`
- Test: `"should initialize Anthropic client with API key"`
- Test: `"should estimate cost correctly for Haiku"`
- Test: `"should estimate cost correctly for Opus 4.6"`
- QA test: `"should make a real API call to Haiku and get a response"` — uses real API key from .env, sends simple "Hello" prompt, validates response has content

### Task 3.2: Agentic tool-use loop
- [ ]
**Objective:** Build the core agentic loop that handles multi-turn tool-use conversations with Claude.
**Details:**
- Create `src/orchestrator/agent-runner.ts`
- Function `runAgent(config)` where config includes: `model`, `systemPrompt`, `tools[]`, `messages[]`, `maxTurns`, `thinkingConfig?`, `onToolCall(name, input) => result`
- Loop logic:
  1. Call `client.messages.create()` with model, system, tools, messages, thinking
  2. Check response for `tool_use` blocks
  3. For each tool_use: call `onToolCall`, push assistant message + tool result to messages
  4. Loop until: `stop_reason === "end_turn"` OR maxTurns reached OR no tool_use blocks
  5. Extract and return: final text content, thinking blocks, all tool calls made, token usage
- Handle `stop_reason === "tool_use"` to continue the loop
- Timeout via AbortController (default 120s)
**Validation:**
- Test file: `tests/unit/orchestrator/agent-runner.test.ts`
- Test: `"should complete single-turn agent call (no tools)"`
- Test: `"should handle tool-use loop with mock tool"`
- Test: `"should stop after maxTurns"`
- Test: `"should extract thinking blocks from response"`
- Test: `"should timeout after specified duration"`
- QA test: `"should run a real multi-turn agent with a dummy tool"` — uses real API, defines a simple `get_weather` tool, validates Claude calls it and produces final answer

---

## Phase 4: Search Tools

### Task 4.1: Brave Search tool implementation
- [ ]
**Objective:** Implement the Brave Web Search API tool that investigators will use.
**Details:**
- Create `src/tools/brave-search.ts`
- Function `braveWebSearch(query: string, count?: number)` → `{ results: { title, url, description, age }[] }`
- Makes HTTP request to `https://api.search.brave.com/res/v1/web/search`
- Headers: `X-Subscription-Token: <BRAVE_SEARCH_API_KEY>`
- Returns top N results (default 5) with title, url, description, age
- Graceful error handling: returns empty results on failure with logged error
- Tool definition for Claude: `{ name: "brave_web_search", description: "...", input_schema: { query: string, count?: number } }`
**Validation:**
- Test file: `tests/unit/tools/brave-search.test.ts`
- Test: `"should return formatted search results"`  (mock HTTP)
- Test: `"should handle API errors gracefully"`
- Test: `"should limit results to specified count"`
- Test: `"should export valid Claude tool definition"`

### Task 4.2: Google Fact Check API tool implementation
- [ ]
**Objective:** Implement the Google Fact Check API tool for finding existing fact-checks.
**Details:**
- Create `src/tools/google-factcheck.ts`
- Function `googleFactCheckSearch(query: string)` → `{ claims: { text, claimant, claimReviewMarkup: { url, title, publisher, rating } }[] }`
- Makes HTTP request to `https://factchecktools.googleapis.com/v1alpha1/claims:search`
- Returns existing fact-checks with their ratings
- Graceful error handling: returns empty claims on failure
- Tool definition for Claude
**Validation:**
- Test file: `tests/unit/tools/google-factcheck.test.ts`
- Test: `"should return formatted fact-check claims"` (mock HTTP)
- Test: `"should handle API errors gracefully"`
- Test: `"should export valid Claude tool definition"`

### Task 4.3: Tool registry and executor
- [ ]
**Objective:** Create a tool registry that maps tool names to their execution functions, used by the agent runner.
**Details:**
- Create `src/tools/tool-registry.ts`
- Class `ToolRegistry` — `register(name, handler)`, `execute(name, input)`, `getToolDefinitions()`
- Registers brave_web_search and google_fact_check_search tools
- Returns tool definitions array for Claude API calls
- Handles errors in tool execution gracefully (returns error string, doesn't throw)
**Validation:**
- Test file: `tests/unit/tools/tool-registry.test.ts`
- Test: `"should register and execute a tool by name"`
- Test: `"should return all tool definitions"`
- Test: `"should return error string for unknown tool"`
- Test: `"should catch tool execution errors and return error string"`

---

## Phase 5: Express Server

### Task 5.1: Express server with health endpoint
- [ ]
**Objective:** Set up Express 5 server with a `/health` endpoint.
**Details:**
- Create `src/server/app.ts` — creates and configures Express app
- `GET /health` → `{ status: "ok", timestamp, uptime }`
- EJS view engine configured for `src/server/views/`
- JSON body parsing middleware
- Error handling middleware
- Export `createApp()` function (not `app.listen()` — that goes in index.ts)
**Validation:**
- Test file: `tests/unit/server/app.test.ts`
- Test: `"GET /health should return 200 with status ok"`
- Test: `"should return JSON content type"`
- Test: `"should include timestamp in health response"`

### Task 5.2: Investigation API endpoint
- [ ]
**Objective:** Create a POST `/api/investigate` endpoint that accepts a claim and kicks off investigation.
**Details:**
- Create `src/server/routes/investigate.ts`
- `POST /api/investigate` — body: `{ message: string, chatId?: string }`
- Validates input, creates investigation in DB, returns `{ id, status: "pending" }`
- `GET /api/investigation/:id` — returns investigation status and result
- Wire routes into Express app
**Validation:**
- Test file: `tests/unit/server/routes/investigate.test.ts`
- Test: `"POST /api/investigate should create investigation and return id"`
- Test: `"POST /api/investigate should reject empty message"`
- Test: `"GET /api/investigation/:id should return investigation"`
- Test: `"GET /api/investigation/:id should return 404 for non-existent id"`
- Cleanup: test database cleaned after each test

---

## Phase 6: Telegram Bot

### Task 6.1: Grammy bot setup with forwarded message handler
- [ ]
**Objective:** Set up the Grammy Telegram bot that handles forwarded messages.
**Details:**
- Create `src/bot/bot.ts` — creates and configures Grammy Bot instance
- Handle forwarded messages: detect `msg.forward_origin` or `msg.forward_date`
- Handle direct text messages
- Reply with "Investigating your claim..." placeholder
- Export `createBot(token)` function
**Validation:**
- Test file: `tests/unit/bot/bot.test.ts`
- Test: `"should create bot instance with token"`
- Test: `"should detect forwarded messages"` (mock Grammy context)
- Test: `"should handle text messages"`

### Task 6.2: Telegram status updater
- [ ]
**Objective:** Create a utility that edits Telegram messages to show investigation progress.
**Details:**
- Create `src/bot/status-updater.ts`
- Class `StatusUpdater` — takes bot instance and chat context
- Method `sendInitial()` → sends "Investigating your claim..." and saves message id
- Method `update(stage)` — edits message with stage-appropriate text:
  - `"planning"` → "Planning investigation..."
  - `"searching"` → "Searching sources..."
  - `"analyzing"` → "Analyzing domain expertise..."
  - `"challenging"` → "Challenging findings..."
  - `"judging"` → "Rendering verdict..."
- Method `sendVerdict(html)` — sends formatted verdict as new message
- Handles Telegram API rate limits with retry
**Validation:**
- Test file: `tests/unit/bot/status-updater.test.ts`
- Test: `"should define all pipeline stages"`
- Test: `"should format status message for each stage"`
- Test: `"should handle update errors gracefully"`

---

## Phase 7: Classifier Agent

### Task 7.1: Classifier agent implementation
- [ ]
**Objective:** Build the Classifier agent that routes incoming messages using Haiku.
**Details:**
- Create `src/agents/classifier-agent.ts`
- Function `runClassifier(message: string, client: ClaudeClient)` → `ClassifierResult`
- Model: Haiku 4.5, 1 turn, no tools, no thinking
- System prompt: instructs classification into 5 categories (factual_claim, opinion, scam, greeting, other), extraction of the claim, domain detection, compound detection
- Parses response as JSON, validates with Zod schema
- Handles parse failures with retry (1 retry max)
**Validation:**
- Test file: `tests/unit/agents/classifier-agent.test.ts`
- Test: `"should return valid ClassifierResult for a factual claim"` (mock SDK)
- Test: `"should classify greeting messages correctly"` (mock SDK)
- Test: `"should detect compound claims"` (mock SDK)
- Test: `"should validate output against Zod schema"`
- QA test: `"should classify 'Modi gives Rs 5000' as factual_claim via real API"` — real Anthropic call

### Task 7.2: Non-factual response handler
- [ ]
**Objective:** Create quick response handlers for non-factual message categories.
**Details:**
- Create `src/agents/non-factual-handler.ts`
- Function `handleNonFactual(result: ClassifierResult)` → `{ text: string, shouldInvestigate: false }`
- Returns appropriate quick responses:
  - `greeting` → friendly response about what the bot does
  - `opinion` → explains the bot checks facts, not opinions
  - `scam` → immediate scam warning with safety tips
  - `other` → asks user to forward a specific claim
**Validation:**
- Test file: `tests/unit/agents/non-factual-handler.test.ts`
- Test: `"should return greeting response for greeting category"`
- Test: `"should return opinion response for opinion category"`
- Test: `"should return scam warning for scam category"`
- Test: `"should return guidance for other category"`

---

## Phase 8: Claim Strategist Agent

### Task 8.1: Claim Strategist agent implementation
- [ ]
**Objective:** Build the Claim Strategist agent that plans the investigation using Opus 4.6 with extended thinking.
**Details:**
- Create `src/agents/strategist-agent.ts`
- Function `runStrategist(claim: string, classifierResult: ClassifierResult, client: ClaudeClient)` → `SearchStrategy`
- Model: Opus 4.6, 1 turn, no tools, adaptive thinking (effort: "medium")
- System prompt: instructs strategic planning of investigation — generate targeted search queries per investigator role, define falsification criteria, assess claim characteristics
- Uses `submit_strategy` tool to return structured output
- Validates output with Zod schema
- Extracts thinking excerpt (first 500 chars of thinking block)
**Validation:**
- Test file: `tests/unit/agents/strategist-agent.test.ts`
- Test: `"should return valid SearchStrategy"` (mock SDK)
- Test: `"should include falsification criteria"` (mock SDK)
- Test: `"should generate queries for all 3 investigator roles"` (mock SDK)
- Test: `"should extract thinking excerpt"`
- QA test: `"should plan investigation for a health claim via real API"` — real Anthropic call, validates SearchStrategy schema

---

## Phase 9: Investigator Agents

### Task 9.1: Source Verification investigator
- [ ]
**Objective:** Build the Source Verification investigator that checks claim origins and credibility.
**Details:**
- Create `src/agents/investigators/source-verification-agent.ts`
- Function `runSourceVerification(claim, searchStrategy, client, toolRegistry)` → `AgentReport`
- Model: Sonnet 4.5, 4 turns max, tools: brave_web_search + google_fact_check_search
- System prompt: find the claim's origin, check source credibility, find debunks
- Guided by `searchStrategy.investigatorGuidance.sourceVerification`
- Uses agent runner loop for multi-turn tool use
- Returns AgentReport with `agentRole: "source_verification"`
**Validation:**
- Test file: `tests/unit/agents/investigators/source-verification-agent.test.ts`
- Test: `"should return valid AgentReport with source_verification role"` (mock SDK + mock tools)
- Test: `"should use search strategy queries"` (mock SDK)
- Test: `"should respect 4-turn limit"` (mock SDK)
- QA test: `"should investigate a known false claim via real API"` — real Anthropic + mock search tools

### Task 9.2: Domain Expertise investigator
- [ ]
**Objective:** Build the Domain Expertise investigator that checks factual accuracy against authoritative sources.
**Details:**
- Create `src/agents/investigators/domain-expertise-agent.ts`
- Function `runDomainExpertise(claim, domain, searchStrategy, client, toolRegistry)` → `AgentReport`
- Model: Sonnet 4.5, 4 turns max, tools: brave_web_search
- System prompt: dynamically templated based on domain (public_health, geopolitics, economics, science, technology, general)
- Guided by `searchStrategy.investigatorGuidance.domainExpertise`
- Returns AgentReport with `agentRole: "domain_expertise"`
**Validation:**
- Test file: `tests/unit/agents/investigators/domain-expertise-agent.test.ts`
- Test: `"should return valid AgentReport with domain_expertise role"` (mock SDK)
- Test: `"should use domain-specific system prompt"` (mock SDK)
- Test: `"should respect 4-turn limit"` (mock SDK)
- QA test: `"should investigate a health claim via real API"` — real Anthropic + mock search tools

### Task 9.3: Pattern Matching investigator
- [ ]
**Objective:** Build the Pattern Matching investigator that searches fact-checker databases for existing debunks.
**Details:**
- Create `src/agents/investigators/pattern-matching-agent.ts`
- Function `runPatternMatching(claim, searchStrategy, client, toolRegistry)` → `AgentReport`
- Model: Sonnet 4.5, 4 turns max, tools: brave_web_search + google_fact_check_search
- System prompt: search Snopes, PolitiFact, AltNews, BoomLive; identify misinformation patterns (zombie claims, chain messages, manipulated media indicators)
- Guided by `searchStrategy.investigatorGuidance.patternMatching`
- Returns AgentReport with `agentRole: "pattern_matching"`
**Validation:**
- Test file: `tests/unit/agents/investigators/pattern-matching-agent.test.ts`
- Test: `"should return valid AgentReport with pattern_matching role"` (mock SDK)
- Test: `"should use search strategy queries"` (mock SDK)
- Test: `"should respect 4-turn limit"` (mock SDK)

---

## Phase 10: Devil's Advocate Agent

### Task 10.1: Devil's Advocate agent implementation
- [ ]
**Objective:** Build the Devil's Advocate agent that challenges the investigator consensus using Opus 4.6.
**Details:**
- Create `src/agents/devils-advocate-agent.ts`
- Function `runDevilsAdvocate(claim, agentReports, falsificationCriteria, client, effortLevel)` → `ChallengeReport`
- Model: Opus 4.6, 1 turn, no tools, adaptive thinking (effort: "high" default, "max" when escalated)
- System prompt: receive all investigator reports, construct strongest counter-argument, must state if counter-argument SUCCEEDED or FAILED
- Extracts thinking excerpt (first 500 chars) for display on verdict page
- Validates output with Zod schema
**Validation:**
- Test file: `tests/unit/agents/devils-advocate-agent.test.ts`
- Test: `"should return valid ChallengeReport"` (mock SDK)
- Test: `"should include thinking excerpt"` (mock SDK)
- Test: `"should set counterArgumentSucceeded to boolean"` (mock SDK)
- Test: `"should accept effort level parameter"` (mock SDK)
- QA test: `"should challenge a clear false claim via real API"` — real Anthropic call with sample AgentReports, validates ChallengeReport schema and counterArgumentSucceeded field

---

## Phase 11: Judge Agent

### Task 11.1: Judge agent implementation
- [ ]
**Objective:** Build the Judge agent that synthesizes all evidence, verifies contested claims, and renders the final verdict using Opus 4.6.
**Details:**
- Create `src/agents/judge-agent.ts`
- Function `runJudge(claim, agentReports, challengeReport, searchStrategy, client, toolRegistry)` → `FinalVerdict`
- Model: Opus 4.6, 3 turns max, tools: brave_web_search + submit_verdict, adaptive thinking (effort: "max")
- 4-phase system prompt: Strategize (review falsification criteria) → Synthesize (resolve contradictions) → Evaluate (consider DA challenges, optionally verify via search) → Verdict (submit_verdict tool)
- Produces confidence decomposition (4 sub-scores)
- Extracts thinking summary for display
- Validates output with Zod schema
**Validation:**
- Test file: `tests/unit/agents/judge-agent.test.ts`
- Test: `"should return valid FinalVerdict"` (mock SDK)
- Test: `"should include confidence decomposition with 4 components"` (mock SDK)
- Test: `"should include thinking summary"` (mock SDK)
- Test: `"should produce verdict with correct category for high confidence"` (mock SDK)
- QA test: `"should render verdict for a complete investigation via real API"` — real Anthropic call with sample inputs, validates FinalVerdict schema

---

## Phase 12: Verdict Formatter

### Task 12.1: Confidence gate enforcement
- [ ]
**Objective:** Build the confidence gate logic that mechanically overrides verdict category if confidence doesn't match the gate range.
**Details:**
- Create `src/formatter/confidence-gates.ts`
- Function `enforceConfidenceGates(verdict: FinalVerdict)` → `FinalVerdict` (with corrected category)
- Gates: likely-true (85-100), partially-true (60-84), unverified (30-59), likely-false (0-29)
- satire and opinion categories bypass confidence gates
- Log when override occurs
**Validation:**
- Test file: `tests/unit/formatter/confidence-gates.test.ts`
- Test: `"should not change category when confidence matches gate"`
- Test: `"should override likely-true to partially-true when confidence is 70"`
- Test: `"should override likely-false to unverified when confidence is 45"`
- Test: `"should not override satire category regardless of confidence"`
- Test: `"should not override opinion category regardless of confidence"`

### Task 12.2: Telegram verdict formatter
- [ ]
**Objective:** Build the formatter that converts FinalVerdict into Telegram HTML with emoji, confidence bar, and summary.
**Details:**
- Create `src/formatter/telegram-formatter.ts`
- Function `formatTelegramVerdict(verdict: FinalVerdict)` → `string` (HTML)
- Includes: verdict badge emoji (color-coded), category label + nuanceTag, confidence percentage, 3-line summary, manipulation techniques (top 2), "View Full Analysis" inline keyboard markup data
- Uses Telegram HTML subset (`<b>`, `<i>`, `<a>`, `<code>`)
- Max ~4000 chars (Telegram limit)
**Validation:**
- Test file: `tests/unit/formatter/telegram-formatter.test.ts`
- Test: `"should format likely-false verdict with red emoji"`
- Test: `"should include nuanceTag when present"`
- Test: `"should include manipulation techniques"`
- Test: `"should not exceed 4000 characters"`
- Test: `"should include confidence percentage"`

---

## Phase 13: Pipeline Orchestrator

### Task 13.1: Pipeline orchestrator — full investigation flow
- [ ]
**Objective:** Build the orchestrator that runs the complete investigation pipeline from message to verdict.
**Details:**
- Create `src/orchestrator/pipeline.ts`
- Class `InvestigationPipeline` — constructor takes: ClaudeClient, ToolRegistry, InvestigationRepository
- Method `investigate(message, onStatusUpdate?)` → `{ verdict: FinalVerdict, investigationId: string }`
- Pipeline steps:
  1. Classify message (Haiku)
  2. If not factual_claim, return early with non-factual response
  3. Run Claim Strategist (Opus 4.6)
  4. Run 2-3 investigators in parallel (`Promise.allSettled`)
  5. Detect disagreement (confidence spread > 30 points) → set effort escalation flag
  6. Run Devil's Advocate (Opus 4.6, effort based on escalation)
  7. Run Judge (Opus 4.6)
  8. Apply confidence gates
  9. Save all results to DB
  10. Return formatted verdict
- Calls `onStatusUpdate(stage)` at each step for Telegram progress
- Tracks total cost and pipeline duration
**Validation:**
- Test file: `tests/unit/orchestrator/pipeline.test.ts`
- Test: `"should run full pipeline for factual claim"` (all agents mocked)
- Test: `"should short-circuit for greeting message"` (classifier mocked)
- Test: `"should run investigators in parallel"` (verify timing)
- Test: `"should detect disagreement and escalate DA effort"` (mock divergent confidence)
- Test: `"should apply confidence gates to final verdict"`
- Test: `"should save results to database"`
- Test: `"should call status updates in correct order"`

### Task 13.2: End-to-end pipeline integration test
- [ ]
**Objective:** Validate the complete pipeline works end-to-end with real Anthropic API calls and mock search tools.
**Details:**
- Create `tests/integration/pipeline-e2e.test.ts`
- Uses real Anthropic API (ANTHROPIC_API_KEY from .env)
- Uses mock search tools (returns canned search results for known claims)
- Test claim: "PM Modi announced Rs 5000 direct transfer to all citizens"
- Validates:
  - Classifier identifies as factual_claim
  - Strategist produces SearchStrategy with falsification criteria
  - Investigators return AgentReports
  - DA produces ChallengeReport
  - Judge produces FinalVerdict
  - Verdict category is likely-false or unverified
  - All Zod schemas validate
  - Pipeline completes in < 120 seconds
- Logs total API cost
**Validation:**
- This IS the test — `tests/integration/pipeline-e2e.test.ts`
- Test: `"should produce a verdict for a known false claim"` — end-to-end
- Test timeout: 180 seconds

---

## Phase 14: Wire Bot to Pipeline

### Task 14.1: Bot-pipeline integration
- [ ]
**Objective:** Wire the Telegram bot to the investigation pipeline so forwarded messages trigger real investigations.
**Details:**
- Create `src/bot/message-handler.ts`
- Handles incoming messages:
  1. Extract text from message (forwarded or direct)
  2. Send initial "Investigating..." reply
  3. Create StatusUpdater for progress updates
  4. Run pipeline with status callback
  5. Format verdict and send to chat
  6. Include inline keyboard with "View Full Analysis" link to `/v/:id`
- Error handling: if pipeline fails, send error message to user
- Connect to bot in `src/bot/bot.ts`
**Validation:**
- Test file: `tests/unit/bot/message-handler.test.ts`
- Test: `"should extract text from forwarded message"` (mock Grammy)
- Test: `"should trigger pipeline for factual claims"` (mock pipeline)
- Test: `"should send error message on pipeline failure"` (mock pipeline)
- Test: `"should include View Full Analysis button"` (mock pipeline)

---

## Phase 15: Web Verdict Page

### Task 15.1: Verdict page route and data loading
- [ ]
**Objective:** Create the Express route that loads investigation data for the web verdict page.
**Details:**
- Create `src/server/routes/verdict.ts`
- `GET /v/:id` — loads investigation from DB, renders EJS template
- Returns 404 page if investigation not found
- Returns "Investigation in progress" page if status is pending/investigating
- Passes parsed verdict data (FinalVerdict, ChallengeReport, SearchStrategy, AgentReports) to template
- Wire route into Express app
**Validation:**
- Test file: `tests/unit/server/routes/verdict.test.ts`
- Test: `"GET /v/:id should return 200 for completed investigation"`
- Test: `"GET /v/:id should return 404 for non-existent id"`
- Test: `"GET /v/:id should show pending page for in-progress investigation"`
- Cleanup: test database cleaned after tests

### Task 15.2: Verdict page EJS template — hero section
- [ ]
**Objective:** Build the verdict page hero section with verdict badge, confidence score, and confidence decomposition chart.
**Details:**
- Create `src/server/views/verdict.ejs`
- Hero section: large verdict badge (color-coded), confidence percentage, nuanceTag subtitle, "Deep Reasoning Mode" indicator if activated
- Confidence decomposition: 4 horizontal bar charts (evidence strength, source reliability, claim complexity, counter-argument resilience)
- Responsive layout (Bootstrap 5 CDN)
- Use `frontend-design` skill for professional styling
**Validation:**
- Start Express server, navigate to `/v/test-id` with seeded test data
- Visually verify: verdict badge displays correctly, confidence bars render, responsive on mobile
- Test file: `tests/unit/server/views/verdict-render.test.ts`
- Test: `"should render verdict page without errors"` — render EJS template with sample data, check no render errors

### Task 15.3: Verdict page — Manipulation Techniques and AI Reasoning sections
- [ ]
**Objective:** Add Manipulation Techniques cards and AI Reasoning (DA + Judge thinking excerpts) sections to the verdict page.
**Details:**
- Add to `src/server/views/verdict.ejs`:
  - Manipulation Techniques section: cards with technique name, description, evidence quote, severity bar
  - "AI Reasoning" section: DA thinking excerpt with "Devil's Advocate" label, Judge thinking excerpt with "Judge" label
  - "What Would Prove This Wrong" section from falsification criteria
  - Devil's Advocate outcome badge (counter-argument failed/succeeded)
- Use `frontend-design` skill for polished card layout
**Validation:**
- Start Express server, verify sections render with seeded data
- Test file: `tests/unit/server/views/verdict-sections.test.ts`
- Test: `"should render manipulation techniques cards"`
- Test: `"should render DA thinking excerpt"`
- Test: `"should render Judge thinking excerpt"`
- Test: `"should render falsification criteria"`

### Task 15.4: Verdict page — Agent reports and sources collapsible sections
- [ ]
**Objective:** Add collapsible agent report sections, sources list, and original claim to the verdict page.
**Details:**
- Add to `src/server/views/verdict.ejs`:
  - Collapsible agent report sections (Source Verification, Domain Expertise, Pattern Matching) using Bootstrap accordion
  - Each report shows: summary, findings with assessments, confidence score, sources
  - Key Findings bullet list
  - Sources section with links and relevance tags
  - Original claim text at bottom
  - Pipeline metadata: duration, cost, deep reasoning indicator, timestamps
- Use `frontend-design` skill
**Validation:**
- Start Express server, verify accordion expands/collapses, sources link correctly
- Test file: `tests/unit/server/views/verdict-details.test.ts`
- Test: `"should render agent reports section"`
- Test: `"should render sources with links"`
- Test: `"should render original claim"`

---

## Phase 16: Application Entry Point

### Task 16.1: Compose and start the full application
- [ ]
**Objective:** Create the main entry point that wires all modules together and starts the bot + server.
**Details:**
- Update `src/index.ts`:
  1. Load env config
  2. Initialize logger
  3. Create SQLite database + run migrations
  4. Create ClaudeClient
  5. Create ToolRegistry and register tools
  6. Create InvestigationRepository
  7. Create InvestigationPipeline
  8. Create Express app, mount routes
  9. Create Grammy bot, attach message handler
  10. Start Express server on configured port
  11. Start bot long polling
  12. Graceful shutdown on SIGINT/SIGTERM
- Log startup info: port, bot username, database path
**Validation:**
- Test file: `tests/integration/app-startup.test.ts`
- Test: `"should start server and respond to health check"` — start app, hit /health, verify 200
- Test: `"should gracefully shut down on SIGTERM"`
- Cleanup: stop server and bot after tests

---

## Phase 17: Demo Preparation

### Task 17.1: Seed demo claims for testing
- [ ]
**Objective:** Create a script that runs 3 demo claims through the pipeline and saves results.
**Details:**
- Create `scripts/seed-demo.ts`
- 3 demo claims:
  1. FALSE: "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024"
  2. MISLEADING: "WHO officially declares green tea cures cancer"
  3. TRUE: "India's Chandrayaan-3 successfully landed on the Moon's south pole in August 2023"
- Runs each through the pipeline (real API calls)
- Saves results to database
- Logs investigation IDs for demo
**Validation:**
- Run script: `npx tsx scripts/seed-demo.ts`
- Verify 3 investigations in database
- Verify verdict pages render at `/v/:id` for each

### Task 17.2: Dynamic effort escalation indicator
- [ ]
**Objective:** Implement the "Deep Reasoning Mode" detection and display in the pipeline and verdict page.
**Details:**
- In `src/orchestrator/pipeline.ts`: detect when investigator confidence spread > 30 points, set `deepReasoningActivated: true`, escalate DA effort to "max"
- In verdict page: display "Deep Reasoning Mode" badge when activated
- In Telegram: add indicator text when deep reasoning was used
**Validation:**
- Test file: `tests/unit/orchestrator/effort-escalation.test.ts`
- Test: `"should detect disagreement when confidence spread > 30"`
- Test: `"should escalate DA effort to max when disagreement detected"`
- Test: `"should not escalate when investigators agree"`
- Test: `"should set deepReasoningActivated flag in verdict"`

### Task 17.3: In-memory cache for repeated claims
- [ ]
**Objective:** Add a simple in-memory cache to avoid re-investigating identical claims.
**Details:**
- Create `src/services/claim-cache.ts`
- Uses `Map<string, { result: FinalVerdict, investigationId: string, timestamp: number }>`
- TTL: 1 hour
- Normalized key: lowercase, trimmed, whitespace-collapsed
- Integrate into pipeline: check cache before starting investigation
- Return cached result with "Cached result" indicator
**Validation:**
- Test file: `tests/unit/services/claim-cache.test.ts`
- Test: `"should cache and retrieve verdicts by normalized claim"`
- Test: `"should expire entries after TTL"`
- Test: `"should normalize claim text for matching"`
- Test: `"should miss cache for different claims"`

---

## Dependency Graph

```
Phase 0 (Scaffolding)
  └─→ Phase 1 (Database)
  └─→ Phase 2 (Schemas)
  └─→ Phase 3 (SDK + Agent Runner) → Phase 4 (Search Tools)
        └─→ Phase 7 (Classifier)
        └─→ Phase 8 (Strategist)
        └─→ Phase 9 (Investigators) ← depends on Phase 4
        └─→ Phase 10 (Devil's Advocate)
        └─→ Phase 11 (Judge) ← depends on Phase 4
              └─→ Phase 12 (Formatter)
                    └─→ Phase 13 (Pipeline Orchestrator) ← depends on all agents
  Phase 5 (Express Server) ← depends on Phase 1
  Phase 6 (Telegram Bot)
        └─→ Phase 14 (Bot-Pipeline Integration) ← depends on Phase 13
  Phase 15 (Web Verdict Page) ← depends on Phase 5, Phase 1
  Phase 16 (App Entry Point) ← depends on everything
  Phase 17 (Demo Prep) ← depends on Phase 16
```
