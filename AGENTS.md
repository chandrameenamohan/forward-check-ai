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

_(Updated by ralph loop as discoveries are made)_

## Decisions Log

- **Task 0.1:** Used `noUncheckedIndexedAccess: true` in tsconfig for extra safety on array/object indexing. Used `isolatedModules: true` for compatibility with transpilers. Vitest config kept minimal — no globals, file pattern `tests/**/*.test.ts`.
