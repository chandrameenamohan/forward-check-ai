# ForwardCheck-AI — SDET Test Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

**Baseline:** 42 test files, 326 tests passing, 8 skipped, 0 failures. TypeScript clean.

---

## Phase T0: Coverage Tooling

### Task T0.1: Add Vitest coverage with V8 provider
- [x]
**Objective:** Install `@vitest/coverage-v8` and configure `vitest.config.ts` to generate coverage reports.
**Details:**
- `npm install -D @vitest/coverage-v8`
- Update `vitest.config.ts`: add `coverage` block with `provider: "v8"`, `reporter: ["text", "html", "json-summary"]`, `reportsDirectory: "./coverage"`, `include: ["src/**/*.ts"]`, `exclude: ["src/index.ts", "src/server/views/**"]`
- Add `"test:coverage": "vitest run --coverage"` script to `package.json`
- Add `coverage/` to `.gitignore`
**Validation:**
- `npm run test:coverage` succeeds
- `coverage/` directory is created with `index.html` and `coverage-summary.json`
- Text summary is printed to stdout showing per-file line/branch/function percentages
- All 326 existing tests still pass

---

## Phase T1: Shared Test Fixtures

### Task T1.1: Create shared fixture factory for pipeline data
- [x]
**Objective:** Build a `tests/fixtures/` module that exports factory functions for all pipeline Zod types, eliminating copy-paste across test files.
**Details:**
- Create `tests/fixtures/index.ts` — barrel export
- Create `tests/fixtures/factories.ts` — exports:
  - `makeClassifierResult(overrides?)` → valid `ClassifierResult`
  - `makeSearchStrategy(overrides?)` → valid `SearchStrategy`
  - `makeAgentReport(overrides?)` → valid `AgentReport`
  - `makeChallengeReport(overrides?)` → valid `ChallengeReport`
  - `makeFinalVerdict(overrides?)` → valid `FinalVerdict`
  - `makeInvestigation(overrides?)` → full DB-shape investigation row
- Each factory returns Zod-valid data by default, with deep-merge for `overrides`
- Create `tests/fixtures/canned-search-results.ts` — exports mock Brave/Google search responses for known test claims
**Validation:**
- Test file: `tests/unit/fixtures/factories.test.ts`
- Test: `"each factory produces Zod-valid output"` — loop all 5 factories, validate with corresponding schema
- Test: `"overrides are deep-merged correctly"` — pass nested override, verify it appears in output
- Test: `"canned search results have expected shape"` — validate structure

### Task T1.2: Refactor existing tests to use shared fixtures
- [x]
**Objective:** Replace inline fixture construction in existing test files with calls to factory functions from `tests/fixtures/`.
**Details:**
- Audit all 42 test files for inline object literals matching pipeline schemas
- Replace with `makeClassifierResult()`, `makeAgentReport()`, etc.
- Priority files (highest duplication):
  - `tests/unit/orchestrator/pipeline.test.ts`
  - `tests/unit/agents/devils-advocate-agent.test.ts`
  - `tests/unit/agents/judge-agent.test.ts`
  - `tests/unit/formatter/confidence-gates.test.ts`
  - `tests/unit/formatter/telegram-formatter.test.ts`
  - `tests/unit/server/views/verdict-*.test.ts`
- Do NOT change test logic or assertions — only data construction
**Validation:**
- `npx vitest run` — all 326 tests still pass, 0 regressions
- `grep -r "category:" tests/unit/ | wc -l` count drops by at least 30%
- No test file directly imports from `src/schemas/` just to build test data

---

## Phase T2: HTTP API End-to-End Tests

### Task T2.1: Health and investigation API E2E tests
- [x]
**Objective:** Write integration tests that boot the real Express app (with in-memory SQLite) and hit HTTP endpoints with `fetch`.
**Details:**
- Create `tests/integration/api-e2e.test.ts`
- Setup: call `createApp()` with in-memory DB, listen on random port
- Teardown: close server
- Tests:
  - `"GET /health returns 200 with status ok"`
  - `"POST /api/investigate with valid message returns 201 with id"`
  - `"POST /api/investigate with empty message returns 400"`
  - `"GET /api/investigation/:id returns pending investigation"`
  - `"GET /api/investigation/nonexistent returns 404"`
  - `"GET /v/:id for completed investigation returns 200 HTML"`
  - `"GET /v/nonexistent returns 404"`
**Validation:**
- `npx vitest run tests/integration/api-e2e.test.ts` — all tests pass
- No port conflicts (uses dynamic port assignment)
- Server starts and stops cleanly (no hanging processes)

---

## Phase T3: Non-Factual Pipeline E2E

### Task T3.1: Non-factual message pipeline E2E test
- [x]
**Objective:** Verify the complete pipeline short-circuits correctly for non-factual messages (greeting, opinion, scam, other) using real Anthropic API.
**Details:**
- Create `tests/integration/non-factual-e2e.test.ts`
- Uses real Anthropic API (ANTHROPIC_API_KEY from env)
- Uses mock search tools (never called for non-factual)
- Test claims:
  - `"Hello, how are you?"` → classifier returns greeting, pipeline returns quick response
  - `"I think chocolate is the best flavor"` → opinion, pipeline returns opinion guidance
  - `"Send money to this account to claim your prize"` → scam, pipeline returns scam warning
- Validates:
  - Classifier identifies correct category
  - Pipeline returns `shouldInvestigate: false`
  - No investigator/DA/judge agents are invoked (cost is minimal — Haiku only)
  - Response text is non-empty and relevant
**Validation:**
- `npx vitest run tests/integration/non-factual-e2e.test.ts` — all 3 tests pass
- Total API cost < $0.01 (Haiku-only calls)
- Test timeout: 30 seconds

---

## Phase T4: Error Resilience Tests

### Task T4.1: Agent failure and timeout resilience tests
- [x]
**Objective:** Verify the pipeline degrades gracefully when individual agents fail, time out, or return malformed data.
**Details:**
- Create `tests/unit/orchestrator/pipeline-resilience.test.ts`
- Uses fully mocked agents (no real API calls)
- Tests:
  - `"pipeline completes when 1 of 3 investigators fails"` — one investigator rejects, other two succeed, verdict is produced from available reports
  - `"pipeline completes when 2 of 3 investigators fail"` — only one report, still produces verdict (lower confidence)
  - `"pipeline handles classifier returning malformed JSON"` — classifier mock returns invalid JSON, pipeline retries once then returns error
  - `"pipeline handles DA timeout"` — DA mock hangs past timeout, pipeline skips DA and proceeds to judge
  - `"pipeline handles judge returning invalid schema"` — judge mock returns wrong shape, pipeline retries once then returns error with partial results
  - `"pipeline tracks cost even when agents fail"` — cost accumulation works across partial failures
**Validation:**
- `npx vitest run tests/unit/orchestrator/pipeline-resilience.test.ts` — all 6 tests pass
- No unhandled promise rejections
- Each test completes in < 5 seconds (all mocked)

---

## Phase T5: Confidence Gate Regression Tests

### Task T5.1: Exhaustive confidence gate boundary tests
- [x]
**Objective:** Add boundary-value tests for every confidence gate threshold to catch regressions in verdict category overrides.
**Details:**
- Create `tests/unit/formatter/confidence-gates-regression.test.ts`
- Uses shared fixtures from Phase T1
- Boundary tests (value at exact threshold, +1, -1):
  - `confidence: 84` → `partially-true` (NOT `likely-true`)
  - `confidence: 85` → `likely-true` (gate floor)
  - `confidence: 100` → `likely-true` (max)
  - `confidence: 59` → `unverified` (NOT `partially-true`)
  - `confidence: 60` → `partially-true` (gate floor)
  - `confidence: 29` → `likely-false` (NOT `unverified`)
  - `confidence: 30` → `unverified` (gate floor)
  - `confidence: 0` → `likely-false` (min)
- Category-bypass tests:
  - `satire` with confidence `95` → stays `satire`
  - `opinion` with confidence `10` → stays `opinion`
- Mismatch-correction matrix (6 combinations):
  - `likely-true` with `confidence: 50` → corrected to `unverified`
  - `likely-false` with `confidence: 90` → corrected to `likely-true`
  - etc.
**Validation:**
- `npx vitest run tests/unit/formatter/confidence-gates-regression.test.ts` — all tests pass
- Covers every gate boundary (no gaps)
- Does not duplicate existing tests in `confidence-gates.test.ts`

---

## Phase T6: Quality Gate Script

### Task T6.1: Create `scripts/quality-gate.sh` all-in-one check
- [x]
**Objective:** Build a single shell script that runs typecheck, lint, tests, and coverage — exiting non-zero on any failure.
**Details:**
- Create `scripts/quality-gate.sh`
- Steps (sequential, fail-fast):
  1. `echo "=== TypeScript ===" && npx tsc --noEmit`
  2. `echo "=== Unit Tests ===" && npx vitest run --exclude 'tests/integration/**'`
  3. `echo "=== Coverage ===" && npx vitest run --coverage --exclude 'tests/integration/**'`
  4. Parse `coverage/coverage-summary.json` — fail if overall line coverage < 60%
  5. `echo "=== Integration Tests (mocked) ===" && npx vitest run tests/integration/api-e2e.test.ts`
  6. Print summary: pass/fail counts, coverage percentage, total duration
- Add `"quality": "bash scripts/quality-gate.sh"` script to `package.json`
- Does NOT run live-API integration tests (those are opt-in via separate command)
**Validation:**
- `npm run quality` passes end-to-end on current codebase
- Intentionally break a type → script exits non-zero at step 1
- Intentionally fail a test → script exits non-zero at step 2
- Script prints clear pass/fail summary at the end

### Task T6.2: Full quality run with report
- [x]
**Objective:** Add an opt-in command that runs the full quality gate INCLUDING live-API integration tests and produces a Markdown report.
**Details:**
- Create `scripts/quality-full.sh`
- Runs everything from `quality-gate.sh` PLUS:
  - `npx vitest run tests/integration/` (all integration tests including live API)
- Generates `quality-report.md` with:
  - Timestamp, git branch, commit SHA
  - TypeScript: pass/fail
  - Unit tests: X passed, Y failed, Z skipped
  - Integration tests: X passed, Y failed
  - Coverage: line %, branch %, function %
  - Total API cost (parsed from test logs)
  - Total duration
- Add `"quality:full": "bash scripts/quality-full.sh"` script to `package.json`
- Add `quality-report.md` to `.gitignore`
**Validation:**
- `npm run quality:full` produces `quality-report.md`
- Report contains all sections listed above
- Report is valid Markdown (can be viewed in any Markdown renderer)

---

## Dependency Graph

```
Phase T0 (Coverage Tooling)
  └─→ Phase T1 (Shared Fixtures)
        └─→ Phase T2 (HTTP API E2E)
        └─→ Phase T3 (Non-Factual E2E)
        └─→ Phase T4 (Error Resilience)
        └─→ Phase T5 (Confidence Gate Regression)
  Phase T6 (Quality Gate Script) ← depends on T0 + T2
```

**Phase T0** is prerequisite for coverage reporting.
**Phase T1** is prerequisite for T2–T5 (shared fixtures reduce boilerplate).
**Phases T2–T5** are independent of each other and can be done in any order.
**Phase T6** depends on T0 (coverage tooling) and T2 (API E2E tests referenced in the gate).
