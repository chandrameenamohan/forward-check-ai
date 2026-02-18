# ForwardCheck-AI — Lean Eval Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

**Principle:** Build the minimum eval infrastructure needed to find what's broken, fix it, and verify the fix. Measure less, improve more.

**Grounding:** [Anthropic — Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

**Budget:** ~$66 total (~$28/full run × 2 runs + $10 initial 5-claim run)

**Estimated build time:** ~7–9 hours

---

## Why Lean?

The full eval plan (IMPLEMENTATION_EVAL_PLAN.md) builds 10 graders and 25 tasks over 20+ hours. Most of that measures the system without telling you *what to fix*. This plan inverts the ratio:

| | Full Plan | Lean Plan |
|---|----------|-----------|
| Tasks | 25 | 12 |
| Graders | 10 | 3 |
| Build time | ~20 hours | ~8 hours |
| API cost | ~$193 | ~$66 |
| Iterations before budget gone | ~2 | ~4 |
| Transcript review | Phase 6 (last) | Phase L4 (early) |

**What we cut and why:**
- **Gate compliance grader** — tests code, not intelligence. Already covered by unit tests.
- **Schema compliance grader** — tests Zod validation. Already covered by unit tests.
- **Budget grader** — useful monitoring, but doesn't make the pipeline better. We track cost/latency in the harness output instead.
- **Calibration analysis** — 15 claims across 5 bins = 3 per bin. Statistically meaningless.
- **pass@k consistency** — expensive ($133 for 3 trials). Deferred until after prompt fixes show value.
- **Haiku reasoning grader** — smaller model grading larger model is unreliable. Human transcript review is better.
- **Manipulation technique grader** — niche. Covered implicitly by verdict accuracy.

**What we kept and why:**
- **Verdict accuracy** — did we get the right answer? The core eval.
- **Groundedness** — is the reasoning backed by real evidence? Uses Sonnet (not token matching).
- **Coverage** — did investigators find the obvious sources? Directly actionable.
- **Transcript review** — the blog says "read transcripts regularly." This is where real improvement comes from.
- **Harm weighting** — false negatives on health/scam claims should hurt more.

---

## Phase L0: Eval Dataset — 15 Ground-Truth Claims

### Task L0.1: Create eval dataset with 15 ground-truth claims
- [x]
**Objective:** Build a structured JSON dataset of 15 claims with expected outcomes.
**Details:**
- Create `eval/dataset.ts` — exports `EvalClaim[]` array
- Create Zod schema `EvalClaimSchema`:
  ```typescript
  {
    id: string,                         // e.g. "false-001"
    claim: string,                      // the message text
    expectedCategory: "likely-true" | "partially-true" | "unverified" | "likely-false" | "satire" | "opinion",
    expectedClassifierRoute: "factual_claim" | "opinion" | "scam" | "greeting" | "other",
    acceptableCategories: string[],     // e.g. ["likely-false", "unverified"]
    expectedConfidenceRange: [number, number],
    difficulty: "easy" | "medium" | "hard",
    tags: string[],                     // e.g. ["health", "india", "zombie-claim"]
    notes: string,
    // Research quality fields
    mustFindSources?: string[],         // URL substrings investigators should find
    // Harm weighting
    harmWeight: 1 | 2 | 3,             // 1 = normal, 2 = misleading health/safety, 3 = dangerous scam/health
  }
  ```
- 15 claims in 5 groups:

  **Group 1: Known False (4 claims)** — Pipeline should return `likely-false`, confidence 0–29
  1. "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024" (zombie claim, from demo seed) — harmWeight: 2
  2. "WHO officially declares green tea cures cancer" (fabricated authority, from demo seed) — harmWeight: 3
  3. "5G towers have been proven to cause COVID-19 by WHO" (debunked conspiracy) — harmWeight: 3
  4. "NASA confirmed the Earth will experience 3 days of complete darkness in December" (zombie claim) — harmWeight: 1

  **Group 2: Known True (3 claims)** — Pipeline should return `likely-true`, confidence 85–100
  1. "India's Chandrayaan-3 successfully landed on the Moon's south pole region in August 2023" (from demo seed) — harmWeight: 1
  2. "The James Webb Space Telescope launched on December 25, 2021" (verifiable fact) — harmWeight: 1
  3. "Japan hosted the 2020 Summer Olympics in 2021 due to COVID-19 delay" (verifiable fact) — harmWeight: 1

  **Group 3: Partially True / Misleading (3 claims)** — Pipeline should return `partially-true` or `unverified`
  1. "A Harvard study proved that eating chocolate every day prevents heart disease" (kernel of truth, exaggerated) — harmWeight: 2
  2. "Coffee has been classified as a cancer-causing agent by WHO" (IARC history is nuanced) — harmWeight: 2
  3. "Tesla cars can drive themselves fully autonomously without any human intervention" (Autopilot vs FSD) — harmWeight: 1

  **Group 4: Non-Factual — Short Circuit (3 claims)** — Pipeline should NOT run investigation
  1. "Hello! How are you doing today?" → greeting — harmWeight: 1
  2. "I think democracy is the best form of government" → opinion — harmWeight: 1
  3. "Send ₹500 to this UPI ID to unlock your prize winnings: scammer@upi" → scam — harmWeight: 3

  **Group 5: Adversarial (2 claims)** — Designed to challenge the pipeline
  1. "BREAKING: The president just announced..." (vague, no falsifiable claim) — harmWeight: 1
  2. "PM Modi gave Rs 5000 AND green tea cures cancer AND WhatsApp is now free" (compound claim) — harmWeight: 2

**Validation:**
- Test file: `tests/unit/eval/dataset.test.ts`
- Test: `"all 15 claims validate against EvalClaimSchema"`
- Test: `"dataset has correct distribution: 4 false, 3 true, 3 partial, 3 non-factual, 2 adversarial"`
- Test: `"no duplicate claim IDs"`
- Test: `"all harmWeights are 1, 2, or 3"`

### Task L0.2: Create canned search results via live capture
- [x]
**Objective:** Capture real Brave Search and Google Fact Check API responses for each factual claim, enabling $0-search-cost eval runs.
**Details:**
- Create capture script: `scripts/capture-eval-fixtures.ts`
  - Accepts `--claim <id>` or `--all`
  - For each factual claim (12 total from Groups 1–3 + Group 5):
    - Call Brave Search API with claim text as query
    - Call Google Fact Check API with claim text as query
    - Save raw JSON to `eval/fixtures/{claimId}.json`
  - 1-second delay between requests (rate limits)
  - Uses free API tiers — $0 cost
  - Logs: `[3/12] Capturing "PM Modi Rs 5000..." → 5 brave, 1 factCheck`
- Create `eval/canned-results.ts`:
  - Exports `getCannedResults(claimId: string)` → `{ brave: BraveSearchResult[], factCheck: FactCheckClaim[] }`
  - Loads from `eval/fixtures/{claimId}.json`
  - Falls back to existing `tests/fixtures/canned-search-results.ts` for PM Modi claim
- **Do NOT edit captured results.** If the API returns garbage, that's signal.
**Validation:**
- Test file: `tests/unit/eval/canned-results.test.ts`
- Test: `"getCannedResults returns results for all factual claim IDs"`
- Test: `"each result set has at least 1 brave result"`
- Test: `"captured fixtures match expected JSON shape"`

---

## Phase L1: Eval Harness

### Task L1.1: Expose pipeline intermediate outputs
- [x]
**Objective:** Make the pipeline return all intermediate agent outputs so graders can evaluate each stage.
**Details:**
- Edit `src/orchestrator/pipeline.ts` — extend `InvestigateResult`:
  ```typescript
  interface InvestigateResult {
    // ... existing fields ...
    classifierResult?: ClassifierResult;
    searchStrategy?: SearchStrategy;
    agentReports?: AgentReport[];
    challengeReport?: ChallengeReport;
  }
  ```
- Populate these from variables already computed in `runPipeline()` — they exist, just aren't returned
- Non-breaking change: existing consumers ignore new fields
**Validation:**
- All existing pipeline tests still pass
- Add test in `tests/unit/orchestrator/pipeline.test.ts`: `"should return intermediate outputs in result"`
- `npx tsc --noEmit` passes

### Task L1.2: Create eval harness
- [x]
**Objective:** Build the eval runner that executes claims against the pipeline and collects structured results.
**Details:**
- Create `eval/harness.ts`
- Class `EvalHarness`:
  ```typescript
  constructor(config: {
    mode: "mock" | "live",
    claimFilter?: string[],   // run subset of claim IDs
    groupFilter?: string[],   // run subset of groups
    timeoutMs?: number,       // per-claim timeout (default 300_000)
  })
  ```
- Method `run(claims: EvalClaim[])` → `EvalTrialResult[]`
- For each claim:
  1. Create fresh in-memory SQLite database
  2. Create ClaudeClient, ToolRegistry (mock or live based on mode)
  3. In mock mode: register canned search tool handlers from `eval/canned-results.ts`
  4. Create InvestigationPipeline
  5. Run `pipeline.investigate(claim.claim)` with timeout
  6. Capture full result including intermediate outputs
  7. Capture errors/timeouts as `{ error: string }`
  8. Store in `EvalTrialResult`:
     ```typescript
     {
       claimId: string,
       claim: EvalClaim,
       classifierResult?: ClassifierResult,
       searchStrategy?: SearchStrategy,
       agentReports?: AgentReport[],
       challengeReport?: ChallengeReport,
       verdict?: FinalVerdict,
       nonFactualResponse?: string,
       error?: string,
       costUsd: number,
       durationMs: number,
       timestamp: string,
     }
     ```
- Run claims sequentially (avoid rate limits)
- Log progress: `[3/15] Running "PM Modi Rs 5000..." — mock mode`
- Track total cost
**Validation:**
- Test file: `tests/unit/eval/harness.test.ts`
- Test: `"should run a single claim in mock mode and return EvalTrialResult"` (mock all agents)
- Test: `"should handle pipeline timeout gracefully"`
- Test: `"should filter claims by ID and group"`
- Test: `"should isolate database state between claims"`

---

## Phase L2: Three Graders

### Task L2.1: Verdict accuracy grader with harm weighting
- [x]
**Objective:** Build a code-based grader that checks verdict correctness, weighted by harm potential.
**Details:**
- Create `eval/graders/verdict-grader.ts`
- Function `gradeVerdict(result: EvalTrialResult, claim: EvalClaim)` → `VerdictGrade`:
  ```typescript
  {
    categoryCorrect: boolean,       // exact match with expectedCategory
    categoryAcceptable: boolean,    // matches any in acceptableCategories
    confidenceInRange: boolean,     // within expectedConfidenceRange
    harmWeight: number,             // 1, 2, or 3
    rawScore: number,               // 0-100 before harm weighting
    weightedScore: number,          // rawScore * harmWeight (for aggregation)
    maxWeightedScore: number,       // 100 * harmWeight (for normalization)
  }
  ```
- Scoring:
  - Category exact match: 50 points
  - Category acceptable (flexible): 30 points (only if exact fails)
  - Confidence in range: 30 points
  - Non-factual correct route: 100 points (no verdict to check)
  - Has key findings: 10 points (factual claims only)
  - Has sources: 10 points (factual claims only)
- Harm weighting means: getting a health misinformation claim wrong (harmWeight: 3) hurts 3x as much as getting a trivia claim wrong (harmWeight: 1)
- Aggregate accuracy = sum(weightedScores) / sum(maxWeightedScores)
**Validation:**
- Test file: `tests/unit/eval/graders/verdict-grader.test.ts`
- Test: `"should score 100 for exact category and confidence match"`
- Test: `"should score 80 for acceptable category with correct confidence"`
- Test: `"should score 0 for wrong category"`
- Test: `"should apply harm weighting correctly"`
- Test: `"should score 100 for non-factual short circuit"`

### Task L2.2: Groundedness grader (Sonnet-based)
- [x]
**Objective:** Build a model-based grader that verifies the Judge's findings are grounded in investigator evidence — using Sonnet, not crude token matching.
**Blog principle:** *"Does every claim in the output trace back to a source?"*
**Details:**
- Create `eval/graders/groundedness-grader.ts`
- Function `gradeGroundedness(result: EvalTrialResult, client: ClaudeClient)` → `Promise<GroundednessGrade>`:
  ```typescript
  {
    keyFindingsTotal: number,
    keyFindingsGrounded: number,
    keyFindingsUngrounded: string[],   // the specific ungrounded findings
    sourcesInVerdict: number,
    sourcesTraceable: number,          // verdict sources that appear in investigator reports
    score: number,                     // 0-100
    reasoning: string,                 // Sonnet's explanation
  }
  ```
- **Approach:** Single Sonnet call (~$0.02) per claim with this prompt:
  ```
  You are evaluating whether a fact-checking Judge's findings are grounded
  in the evidence gathered by investigators.

  ## Judge's Output
  Key Findings: [verdict.keyFindings]
  Sources: [verdict.sources]
  Reasoning: [verdict.reasoning]

  ## Investigator Evidence
  [for each agentReport: role, findings with sources and snippets]

  For each key finding, determine:
  1. Is it supported by specific evidence from any investigator report?
  2. Or is it a claim the Judge made without supporting evidence (hallucinated)?

  Also check: do the verdict's cited sources appear in investigator reports?

  Respond with JSON: { keyFindingsGrounded: number, keyFindingsUngrounded: string[], sourcesTraceable: number, reasoning: string }
  ```
- Skip for non-factual claims (no investigation to ground)
- Cost: ~$0.02/claim × 12 factual claims = ~$0.24 per eval run
**Why Sonnet over token matching:** The original plan used >50% non-stopword overlap, which fails when Opus paraphrases or synthesizes. Sonnet understands semantic equivalence — "The government never issued this announcement" is grounded in "PIB archive shows no Rs 5000 transfer scheme" even though they share few tokens.
**Validation:**
- Test file: `tests/unit/eval/graders/groundedness-grader.test.ts`
- Test: `"should return valid GroundednessGrade for grounded verdict"` (mock Sonnet)
- Test: `"should detect ungrounded key findings"` (mock Sonnet)
- Test: `"should skip for non-factual claims"`

### Task L2.3: Coverage grader
- [x]
**Objective:** Build a code-based grader that checks whether investigators found expected sources.
**Blog principle:** *"Did the agent find the important information?"*
**Details:**
- Create `eval/graders/coverage-grader.ts`
- Function `gradeCoverage(result: EvalTrialResult, claim: EvalClaim)` → `CoverageGrade`:
  ```typescript
  {
    mustFindTotal: number,
    mustFindHit: number,
    mustFindMissed: string[],       // URL substrings not found
    totalSourcesFound: number,      // total unique sources across all agents
    uniqueDomains: number,          // source diversity
    score: number,                  // 0-100
  }
  ```
- Algorithm (code-based, no LLM):
  1. Collect all `sources[].url` from all `AgentReport.findings[]` into a flat set
  2. For each `claim.mustFindSources[]` substring, check if any URL contains it (case-insensitive)
  3. Score = (mustFindHit / mustFindTotal) × 70 + diversity bonus × 30
  4. Diversity bonus = min(uniqueDomains / 5, 1) — capped at 5 domains
- Claims without `mustFindSources`: skip (score: N/A)
**Validation:**
- Test file: `tests/unit/eval/graders/coverage-grader.test.ts`
- Test: `"should score 100 when all must-find sources present"`
- Test: `"should score 0 when no must-find sources found"`
- Test: `"should list missed sources"`
- Test: `"should return null score for claims without mustFindSources"`

---

## Phase L3: Runner & Report

### Task L3.1: Create eval runner script
- [x]
**Objective:** Build the CLI entry point that runs the eval suite.
**Details:**
- Create `eval/run-eval.ts` — executable script
- CLI: `npx tsx eval/run-eval.ts [options]`
  - `--mode mock|live` (default: mock)
  - `--group false|true|partial|non-factual|adversarial|all` (default: all)
  - `--claim <id>` (run single claim)
  - `--skip-groundedness` (skip Sonnet grader for fast runs)
- Execution flow:
  1. Load eval dataset (filter by group/claim)
  2. Initialize eval harness
  3. Run claims through pipeline
  4. Run verdict grader on all results
  5. Run groundedness grader on factual results (unless --skip-groundedness)
  6. Run coverage grader on results with mustFindSources
  7. Print summary to stdout
  8. Write detailed results to `eval/results/eval-{timestamp}.json`
  9. Exit non-zero if harm-weighted accuracy < 50% (safety net)
- Add npm scripts to `package.json`:
  - `"eval": "npx tsx eval/run-eval.ts --mode mock --skip-groundedness"`
  - `"eval:full": "npx tsx eval/run-eval.ts --mode mock"`
  - `"eval:live": "npx tsx eval/run-eval.ts --mode live"`
**Validation:**
- Test file: `tests/unit/eval/run-eval.test.ts`
- Test: `"should parse CLI arguments correctly"`
- Test: `"should run eval with single claim in mock mode"` (mock pipeline)
- Integration: `npx tsx eval/run-eval.ts --mode mock --claim false-001 --skip-groundedness` completes

### Task L3.2: Create eval report — console + markdown
- [x]
**Objective:** Print a clear summary to stdout and save detailed markdown report.
**Details:**
- Create `eval/report.ts`
- Function `printSummary(results, grades)` — prints to stdout:
  ```
  ══════════════════════════════════════════
  ForwardCheck-AI — Eval Results
  Mode: mock | Claims: 15 | Cost: $X.XX
  ══════════════════════════════════════════

  VERDICT ACCURACY
    Harm-weighted accuracy:  72.3%  (target: >70%)
    Exact category match:    60.0%  (9/15)
    Acceptable match:        80.0%  (12/15)

  GROUNDEDNESS (Sonnet-graded)
    Avg grounded findings:   78.5%  (target: >70%)
    Avg traceable sources:   83.2%  (target: >80%)

  COVERAGE
    Must-find source hit:    58.3%  (target: >60%)
    Avg unique domains:      3.2

  FAILURES
    ✗ false-003  expected:likely-false  got:unverified  harm:3
    ✗ partial-001  expected:partially-true  got:likely-true  harm:2

  TOP ISSUES (read these transcripts)
    1. false-003 — 5G COVID claim — wrong category, high harm
    2. partial-001 — chocolate study — overconfident
  ```
- Function `generateMarkdownReport(results, grades, config)` → string
  - Per-claim table: ID, expected, got, confidence, cost, duration, score
  - Failures with details
  - Write to `eval/results/eval-{timestamp}.md`
- Create `eval/results/` directory, add to `.gitignore`
**Validation:**
- Test file: `tests/unit/eval/report.test.ts`
- Test: `"should generate summary string with all metrics"`
- Test: `"should list failures sorted by harm weight"`
- Test: `"should generate valid markdown report"`

---

## Phase L4: Transcript Review & Baseline

### Task L4.1: Run initial eval on 5 claims and review transcripts
- [x]
**Objective:** Run 5 diverse claims, read the full pipeline transcripts, and document what's actually broken.
**Details:**
- Run: `npx tsx eval/run-eval.ts --mode mock --claim false-001 --claim false-003 --claim true-001 --claim partial-001 --claim adversarial-001`
  - Or: run 5 claims by passing IDs via a simple loop
- For each result, examine:
  1. **Classifier:** Did it route correctly?
  2. **Strategist:** Were search queries targeted? Were falsification criteria specific?
  3. **Investigators:** Did they find key evidence? Did any fail?
  4. **DA:** Did it genuinely challenge or rubber-stamp?
  5. **Judge:** Does the reasoning actually use the evidence? Is confidence reasonable?
- Document findings in `eval/TRANSCRIPT_REVIEW.md`:
  ```markdown
  ## Claim: false-001 — PM Modi Rs 5000
  **Expected:** likely-false | **Got:** [actual] | **Confidence:** [actual]%
  **Strategist:** [quality assessment — were queries good?]
  **Investigators:** [what did they find? what did they miss?]
  **DA:** [genuine challenge or rubber stamp?]
  **Judge:** [reasoning quality — grounded or hallucinated?]
  **Issue:** [specific problem to fix, or "none"]
  **Fix:** [which agent's prompt to change and how]
  ```
- Identify top 3 actionable prompt fixes
**Validation:**
- `eval/TRANSCRIPT_REVIEW.md` exists with 5 claim reviews
- At least 2 specific prompt improvement suggestions documented

### Task L4.2: Run full 15-claim baseline eval
- [x]
**Objective:** Run all 15 claims in mock mode to establish baseline metrics.
**Details:**
- Run: `npx tsx eval/run-eval.ts --mode mock`
- Record baseline in `eval/BASELINE.md`:
  - Harm-weighted verdict accuracy
  - Exact category match rate
  - Acceptable category match rate
  - Groundedness score (if --skip-groundedness not used)
  - Coverage score
  - Total cost and duration
  - Per-group accuracy breakdown
- This is the number to beat after prompt fixes
**Validation:**
- `eval/BASELINE.md` exists with all metrics
- `eval/results/` contains the full report
- No regressions in existing test suite

---

## Phase L5: Fix & Iterate

### Task L5.1: Fix top prompt issues from transcript review
- [x]
**Objective:** Apply the top 3 fixes identified in L4.1 transcript review.
**Details:**
- Edit agent prompts based on transcript findings (likely candidates):
  - Strategist: sharpen search queries, make falsification criteria more specific
  - DA: make challenges more adversarial (less rubber-stamping)
  - Judge: improve evidence synthesis, fix confidence calibration
- Each fix should be targeted: change the specific prompt section that caused the failure
- Run the 5 transcript-reviewed claims after each fix to verify improvement
- Do NOT change the eval dataset or graders — only change pipeline agent prompts
**Validation:**
- At least 1 of the 5 transcript-reviewed claims improves
- All existing unit tests still pass
- `npx tsc --noEmit` passes

### Task L5.2: Re-run full eval and compare to baseline
- [x]
**Objective:** Run the full 15-claim eval again and compare to the L4.2 baseline.
**Details:**
- Run: `npx tsx eval/run-eval.ts --mode mock`
- Compare to baseline:
  - Did harm-weighted accuracy improve?
  - Did any claims that were passing now fail? (regressions)
  - Did the specific claims from transcript review improve?
- Update `eval/BASELINE.md` with new metrics alongside old
- If regressions found: revert the offending prompt change and try a different fix
**Validation:**
- New eval report generated
- Comparison documented in `eval/BASELINE.md`
- No regressions in claims that were previously passing

---

## Dependency Graph

```
Phase L0 (Dataset)
  ├─→ L0.1 (15 ground-truth claims)
  └─→ L0.2 (Canned search results) ← depends on L0.1

Phase L1 (Harness)
  ├─→ L1.1 (Pipeline intermediate outputs) ← independent
  └─→ L1.2 (Eval harness) ← depends on L0, L1.1

Phase L2 (Graders) ← depends on L1
  ├─→ L2.1 (Verdict accuracy + harm weighting) ← independent
  ├─→ L2.2 (Groundedness — Sonnet-based) ← independent
  └─→ L2.3 (Coverage) ← independent

Phase L3 (Runner & Report) ← depends on L2
  ├─→ L3.1 (Eval runner script)
  └─→ L3.2 (Report generator) ← depends on L3.1

Phase L4 (Baseline & Review) ← depends on L3
  ├─→ L4.1 (Run 5 claims + transcript review)
  └─→ L4.2 (Full 15-claim baseline) ← depends on L4.1

Phase L5 (Fix & Iterate) ← depends on L4
  ├─→ L5.1 (Fix top prompt issues)
  └─→ L5.2 (Re-run and compare)
```

**Build order:** L0.1 → L0.2 → L1.1 → L1.2 → L2.1, L2.2, L2.3 (parallel) → L3.1 → L3.2 → L4.1 → L4.2 → L5.1 → L5.2

---

## Target Metrics

| Metric | Target | Type | Rationale |
|--------|--------|------|-----------|
| Harm-weighted verdict accuracy | >70% | Capability | Core metric — health/scam errors hurt 3x |
| Exact category match | >60% | Capability | LLMs are non-deterministic |
| Acceptable category match | >80% | Capability | With flexible categories |
| Groundedness (findings) | >70% | Capability | Judge should cite real evidence |
| Groundedness (sources) | >80% | Capability | Verdict sources should trace to investigators |
| Coverage (must-find) | >60% | Capability | Find the obvious debunks |
| Classifier routing (non-factual) | 100% | Regression | Simple routing must be perfect |

---

## Cost Breakdown

| Run | Claims | Cost |
|-----|--------|------|
| Capture fixtures (L0.2) | 12 API calls | $0 (free tiers) |
| Initial 5-claim run (L4.1) | 5 | ~$10 |
| Groundedness grading (L4.1) | 5 Sonnet calls | ~$0.10 |
| Full baseline (L4.2) | 15 | ~$28 |
| Groundedness grading (L4.2) | 12 Sonnet calls | ~$0.24 |
| Re-run after fixes (L5.2) | 15 | ~$28 |
| **Total** | | **~$66** |

Leaves ~$44 headroom from the original $110 budget for additional iterations.

---

*Lean eval: find what's broken, fix it, prove you fixed it.*
