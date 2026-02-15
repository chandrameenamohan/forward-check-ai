# ForwardCheck-AI — Evaluation Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

**Grounding:** [Anthropic — Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents)

**Baseline:** 49 test files, ~350 tests passing, full pipeline operational, 3 demo claims seeded.

**Budget for evals:** ~$40–60 from remaining $110 headroom (20–30 pipeline runs at ~$2/run).

---

## Philosophy

The Anthropic blog identifies three grader types: **code-based** (fast, deterministic, reproducible), **model-based** (flexible, handles open-ended outputs), and **human** (gold standard, expensive). For a hackathon with a $500 budget, we lean heavily on code-based graders and use model-based graders only where open-ended output demands it.

**Key blog principles applied:**
1. **Grade outcomes, not paths** — We don't check if investigators used specific search queries. We check if the final verdict is correct.
2. **Partial credit** — A pipeline that gets the category right but confidence wrong scores higher than one that fails entirely.
3. **pass@k for non-determinism** — Run each claim 3 times; measure consistency.
4. **Capability evals start hard** — Include adversarial claims designed to trick the pipeline.
5. **20–50 tasks from real failures** — Our dataset includes the known B1–B6 bug scenarios.
6. **Regression evals maintain ~100%** — Classifier routing and confidence gates are deterministic; these must never regress.
7. **Read transcripts regularly** — Manual review of 5–10 pipeline transcripts catches patterns automated graders miss.

**Research agent evaluation strategy (blog Section: Research Agents):**

Our pipeline is a research agent — it searches, synthesizes, and judges. The blog identifies three essential checks that generic outcome graders miss:

| Check | Blog Question | Our Grader | Phase |
|-------|--------------|------------|-------|
| **Groundedness** | "Does every claim in the output trace back to a source?" | E2.6 — verify Judge's key findings appear in investigator evidence | E2 |
| **Coverage** | "Did the agent find the important information?" | E2.7 — verify investigators found must-find sources (Snopes, PIB, etc.) | E2 |
| **Source Quality** | "Are the sources the agent relied on trustworthy?" | E2.8 — verify credibility distribution across cited sources | E2 |

These three graders evaluate the *quality of the research process*, not just the final answer. A pipeline that gets the right verdict by accident (hallucinated evidence, missed obvious debunks, low-quality sources) scores lower than one that does rigorous research — even if both reach the same conclusion.

**Two eval modes:**
- **Mock mode** ($0 search cost, ~$1.85/claim for LLM calls only): Canned search results injected into tool registry. Used for rapid iteration and prompt tuning.
- **Live mode** (~$2.00/claim): Real Brave Search + Google Fact Check APIs. Used for final validation before demo recording.

---

## Phase E0: Eval Dataset — Ground Truth Claims

### Task E0.1: Create eval dataset with 30 ground-truth claims
- [ ]
**Objective:** Build a structured JSON dataset of 30 claims with expected outcomes, organized by difficulty and category.
**Details:**
- Create `eval/dataset.ts` — exports `EvalClaim[]` array
- Create Zod schema `EvalClaimSchema`:
  ```typescript
  {
    id: string,                         // e.g. "false-001"
    claim: string,                      // the message text
    expectedCategory: "likely-true" | "partially-true" | "unverified" | "likely-false" | "satire" | "opinion",
    expectedClassifierRoute: "factual_claim" | "opinion" | "scam" | "greeting" | "other",
    acceptableCategories: string[],     // e.g. ["likely-false", "unverified"] — allows flexibility
    expectedConfidenceRange: [number, number], // e.g. [0, 29] for likely-false
    expectedDomain: string,
    difficulty: "easy" | "medium" | "hard",
    tags: string[],                     // e.g. ["zombie-claim", "health", "india"]
    notes: string,                      // why this claim is in the dataset
    // Research agent eval fields (blog: groundedness, coverage, source quality)
    mustFindSources?: string[],         // URL substrings investigators MUST cite (coverage check)
                                        // e.g. ["snopes.com", "pib.gov.in"] for false claims
                                        // e.g. ["reuters.com", "nasa.gov"] for true claims
    expectedManipulationTechniques?: string[], // techniques the claim uses (for manipulation grader)
    minimumSourceCredibility?: "high" | "medium", // minimum credibility threshold for majority of sources
  }
  ```
- 30 claims organized into 6 groups:

  **Group 1: Known False (8 claims)** — Pipeline should return `likely-false`, confidence 0–29
  1. "PM Modi announced Rs 5000 direct transfer to all citizens in March 2024" (zombie claim, from demo)
  2. "WHO officially declares green tea cures cancer" (fabricated authority claim, from demo)
  3. "Bill Gates confirmed COVID vaccine contains microchip for population tracking" (conspiracy classic)
  4. "5G towers have been proven to cause COVID-19 by WHO" (debunked correlation)
  5. "WhatsApp will start charging $0.50 per message starting next month" (perennial hoax)
  6. "NASA confirmed the Earth will experience 3 days of complete darkness in December" (zombie claim)
  7. "Mark Zuckerberg announced Facebook is donating $1 for every share of this post" (social media hoax)
  8. "Eating garlic has been confirmed by WHO to cure COVID-19" (health misinformation)

  **Group 2: Known True (6 claims)** — Pipeline should return `likely-true`, confidence 85–100
  1. "India's Chandrayaan-3 successfully landed on the Moon's south pole region in August 2023" (from demo)
  2. "The FDA granted full approval to the Pfizer COVID-19 vaccine in August 2021" (well-documented)
  3. "India surpassed China as the world's most populous country in 2023 according to UN data" (verifiable)
  4. "SpaceX successfully landed a Falcon 9 booster on a drone ship for reuse" (well-documented)
  5. "Japan hosted the 2020 Summer Olympics in 2021 due to COVID-19 delay" (verifiable fact)
  6. "The James Webb Space Telescope launched on December 25, 2021" (verifiable fact)

  **Group 3: Partially True / Misleading (6 claims)** — Pipeline should return `partially-true` or `unverified`
  1. "A Harvard study proved that eating chocolate every day prevents heart disease" (kernel of truth, exaggerated)
  2. "Scientists discovered a new human organ called the interstitium in 2018" (real paper, misleading framing)
  3. "Coffee has been classified as a cancer-causing agent by WHO" (IARC history is nuanced)
  4. "India's GDP growth rate is the highest in the world at 8%" (true in some quarters, misleading as absolute)
  5. "Drinking warm water with lemon kills the coronavirus" (partial health benefit, false COVID cure claim)
  6. "Tesla cars can drive themselves fully autonomously without any human intervention" (Autopilot vs FSD distinction)

  **Group 4: Non-Factual — Short Circuit (6 claims)** — Pipeline should NOT run investigation
  1. "Hello! How are you doing today?" → greeting
  2. "I think democracy is the best form of government" → opinion
  3. "Send ₹500 to this UPI ID to unlock your prize winnings: scammer@upi" → scam
  4. "What's for dinner?" → other
  5. "In my opinion, Virat Kohli is the greatest cricketer of all time" → opinion
  6. "Congratulations! You've won a free iPhone. Click here: bit.ly/scam123" → scam

  **Group 5: Adversarial / Edge Cases (4 claims)** — Designed to challenge the pipeline
  1. "BREAKING: The president just announced..." (vague, no specific falsifiable claim)
  2. "Studies show..." (weasel words, no specific study cited)
  3. "PM Modi gave Rs 5000 AND green tea cures cancer AND WhatsApp is now free" (compound claim)
  4. "" (empty/near-empty message)

- Each claim includes `cannedSearchResults` field (optional) pointing to a function in `eval/canned-results.ts` for mock mode
**Validation:**
- Test file: `tests/unit/eval/dataset.test.ts`
- Test: `"all 30 claims validate against EvalClaimSchema"`
- Test: `"dataset has correct distribution: 8 false, 6 true, 6 partial, 6 non-factual, 4 edge"`
- Test: `"all expectedConfidenceRange values align with expectedCategory gate ranges"`
- Test: `"no duplicate claim IDs"`

### Task E0.2: Create canned search results for mock eval mode
- [ ]
**Objective:** Build canned Brave Search and Google Fact Check responses for each factual claim in the eval dataset, enabling $0-search-cost eval runs.
**Details:**
- Create `eval/canned-results.ts` — exports `getCannedResults(claimId: string)` → `{ brave: BraveResult[], factCheck: FactCheckResult[] }`
- Cover all 24 factual claims (Groups 1–3 + Group 5 adversarial)
- Each claim gets 3–5 Brave results and 0–2 Fact Check results
- Results must be realistic (real URLs, plausible snippets) but don't need to be actual API responses
- Reuse existing canned results from `tests/fixtures/canned-search-results.ts` for the PM Modi claim
- For "known true" claims: results should include confirming sources (Reuters, AP, official sites)
- For "known false" claims: results should include fact-checker debunks (Snopes, PolitiFact, AltNews)
- For "partially true" claims: results should include BOTH confirming and contradicting sources
**Validation:**
- Test file: `tests/unit/eval/canned-results.test.ts`
- Test: `"getCannedResults returns results for all factual claim IDs"`
- Test: `"each result set has at least 3 brave results"`
- Test: `"false claims have at least 1 debunk source"`
- Test: `"true claims have at least 1 confirming source"`

---

## Phase E1: Eval Harness

### Task E1.1: Create eval harness — runs claims through pipeline and collects structured results
- [ ]
**Objective:** Build the core eval runner that executes claims against the pipeline and collects structured results for grading.
**Details:**
- Create `eval/harness.ts`
- Class `EvalHarness`:
  ```typescript
  constructor(config: {
    mode: "mock" | "live",
    trials: number,          // default 1, set to 3 for pass@k
    claimFilter?: string[],  // run subset of claim IDs
    groupFilter?: string[],  // run subset of groups
    timeoutMs?: number,      // per-claim timeout (default 300_000)
  })
  ```
- Method `run()` → `EvalResult[]`
- For each claim × trial:
  1. Create fresh in-memory SQLite database (isolation)
  2. Create ClaudeClient, ToolRegistry (mock or live based on mode)
  3. Create InvestigationPipeline
  4. Run `pipeline.investigate(claim.claim)` with timeout
  5. Capture: verdict, cost, duration, all intermediate outputs (classifier, strategist, reports, DA, judge)
  6. Capture errors/timeouts as `{ error: string }` results
  7. Store in `EvalTrialResult`:
     ```typescript
     {
       claimId: string,
       trial: number,
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
- Log progress: `[3/30] Running "PM Modi Rs 5000..." (trial 1/3) — mock mode`
- Total cost tracking across all runs
**Validation:**
- Test file: `tests/unit/eval/harness.test.ts`
- Test: `"should run a single claim in mock mode and return EvalTrialResult"` (mock all agents)
- Test: `"should handle pipeline timeout gracefully"`
- Test: `"should run multiple trials for pass@k"`
- Test: `"should filter claims by ID and group"`
- Test: `"should isolate database state between claims"`

### Task E1.2: Expose pipeline intermediate outputs for eval collection
- [ ]
**Objective:** Modify the pipeline to return all intermediate agent outputs (not just the final verdict) so the eval harness can grade each stage independently.
**Details:**
- Edit `src/orchestrator/pipeline.ts` — extend `InvestigateResult` to include:
  ```typescript
  interface InvestigateResult {
    // ... existing fields ...
    classifierResult?: ClassifierResult;
    searchStrategy?: SearchStrategy;
    agentReports?: AgentReport[];
    challengeReport?: ChallengeReport;
  }
  ```
- Populate these fields during pipeline execution (they're already computed, just not returned)
- Do NOT change the public method signature — add fields to the existing return object
- This is a non-breaking change: existing consumers ignore the new fields
**Validation:**
- Existing pipeline tests still pass (no regressions)
- Test file: `tests/unit/orchestrator/pipeline.test.ts` — add test: `"should return intermediate outputs in result"`
- `npx tsc --noEmit` passes

---

## Phase E2: Code-Based Graders (Deterministic)

### Task E2.1: Classifier routing accuracy grader
- [ ]
**Objective:** Build a deterministic grader that checks if the Classifier correctly routes messages to the expected category.
**Details:**
- Create `eval/graders/classifier-grader.ts`
- Function `gradeClassifier(result: EvalTrialResult, claim: EvalClaim)` → `ClassifierGrade`:
  ```typescript
  {
    routeCorrect: boolean,      // classifier category matches expectedClassifierRoute
    domainCorrect: boolean,     // classifier domain matches expectedDomain (factual only)
    compoundDetected: boolean,  // for compound claims only
    score: number,              // 0-100: 60 for route, 20 for domain, 20 for compound
  }
  ```
- Pure code-based — string comparison, no LLM needed
- Handles missing classifier result (score: 0)
**Validation:**
- Test file: `tests/unit/eval/graders/classifier-grader.test.ts`
- Test: `"should score 100 when all fields match"`
- Test: `"should score 60 when route correct but domain wrong"`
- Test: `"should score 0 when route incorrect"`
- Test: `"should score 0 when classifier result missing"`

### Task E2.2: Verdict category accuracy grader
- [ ]
**Objective:** Build a deterministic grader that checks if the final verdict matches the expected category, with partial credit for acceptable alternatives.
**Details:**
- Create `eval/graders/verdict-grader.ts`
- Function `gradeVerdict(result: EvalTrialResult, claim: EvalClaim)` → `VerdictGrade`:
  ```typescript
  {
    categoryCorrect: boolean,       // exact match with expectedCategory
    categoryAcceptable: boolean,    // matches any in acceptableCategories
    confidenceInRange: boolean,     // confidence within expectedConfidenceRange
    gateCompliant: boolean,         // category and confidence align per gate rules
    hasManipulationTechniques: boolean,  // non-empty array for false/misleading claims
    hasKeyFindings: boolean,             // non-empty keyFindings array
    hasSources: boolean,                 // non-empty sources array
    score: number,                  // 0-100 weighted composite
  }
  ```
- Scoring weights:
  - Category correct (exact): 40 points
  - Category acceptable (flexible): 25 points (only if exact match fails)
  - Confidence in range: 20 points
  - Gate compliant: 10 points
  - Has manipulation techniques: 5 points (factual claims only)
  - Has key findings: 3 points
  - Has sources: 2 points
- Non-factual claims: category correct = full 100 (no verdict to check)
**Validation:**
- Test file: `tests/unit/eval/graders/verdict-grader.test.ts`
- Test: `"should score 100 for exact category and confidence match"`
- Test: `"should score 65 for acceptable category match with correct confidence"`
- Test: `"should score 0 for wrong category and wrong confidence"`
- Test: `"should score 100 for non-factual short circuit"`
- Test: `"should give partial credit for missing manipulation techniques"`

### Task E2.3: Confidence gate compliance grader
- [ ]
**Objective:** Build a grader that verifies the confidence gate system is working correctly — category always aligns with confidence after gate enforcement.
**Details:**
- Create `eval/graders/gate-grader.ts`
- Function `gradeGateCompliance(result: EvalTrialResult)` → `GateGrade`:
  ```typescript
  {
    preGateAligned: boolean,    // Judge output was already aligned (no override needed)
    postGateAligned: boolean,   // After gates, category + confidence align (should always be true)
    gateOverrideOccurred: boolean,
    score: number,              // 100 if postGateAligned, 50 if override fixed it, 0 if still broken
  }
  ```
- This is a regression grader — should maintain 100% pass rate
- Detects the B1 bug pattern (Judge says likely-false with 97% confidence)
**Validation:**
- Test file: `tests/unit/eval/graders/gate-grader.test.ts`
- Test: `"should score 100 when no override needed"`
- Test: `"should score 50 when override corrects misalignment"`
- Test: `"should score 0 when post-gate alignment is broken"`

### Task E2.4: Cost and latency budget graders
- [ ]
**Objective:** Build graders that verify each pipeline run stays within cost and latency budgets.
**Details:**
- Create `eval/graders/budget-grader.ts`
- Function `gradeBudget(result: EvalTrialResult)` → `BudgetGrade`:
  ```typescript
  {
    costWithinBudget: boolean,    // costUsd <= $3.00 per claim
    latencyWithinBudget: boolean, // durationMs <= 120_000 (2 min)
    costUsd: number,
    durationMs: number,
    score: number,                // 100 if both within budget, 50 if one, 0 if neither
  }
  ```
- Budgets:
  - Cost: max $3.00/claim (50% headroom over expected $2.00)
  - Latency: max 120s (spec says <60s target, 120s acceptable)
- Non-factual claims: cost should be < $0.05, latency < 10s
**Validation:**
- Test file: `tests/unit/eval/graders/budget-grader.test.ts`
- Test: `"should score 100 for claim within both budgets"`
- Test: `"should score 50 for claim over cost but under latency"`
- Test: `"should use stricter budgets for non-factual claims"`

### Task E2.5: Schema compliance grader
- [ ]
**Objective:** Build a grader that validates all intermediate outputs against their Zod schemas, catching the B4/B6 pattern of valid verdicts rejected by schema limits.
**Details:**
- Create `eval/graders/schema-grader.ts`
- Function `gradeSchemaCompliance(result: EvalTrialResult)` → `SchemaGrade`:
  ```typescript
  {
    classifierValid: boolean,
    strategyValid: boolean,
    reportsValid: boolean,       // all agent reports valid
    challengeValid: boolean,
    verdictValid: boolean,
    allValid: boolean,
    failedSchemas: string[],     // names of schemas that failed
    score: number,               // 100 if all valid, proportional otherwise
  }
  ```
- Validates each output against its Zod schema: ClassifierResultSchema, SearchStrategySchema, AgentReportSchema, ChallengeReportSchema, FinalVerdictSchema
- This is a regression grader — should maintain 100% after B4/B6 fixes
**Validation:**
- Test file: `tests/unit/eval/graders/schema-grader.test.ts`
- Test: `"should score 100 when all schemas valid"`
- Test: `"should detect invalid classifier result"`
- Test: `"should detect invalid agent report"`
- Test: `"should list all failed schemas"`

### Task E2.6: Groundedness grader (Research Agent Check #1)
- [ ]
**Objective:** Build a code-based grader that verifies the Judge's key findings and reasoning are grounded in actual investigator evidence — not hallucinated.
**Blog principle:** *"Does every claim in the output trace back to a source?"* — The blog identifies groundedness as the first of three essential checks for research agents. A verdict built on hallucinated evidence is worse than a wrong verdict built on real evidence.
**Details:**
- Create `eval/graders/groundedness-grader.ts`
- Function `gradeGroundedness(result: EvalTrialResult)` → `GroundednessGrade`:
  ```typescript
  {
    keyFindingsTotal: number,
    keyFindingsGrounded: number,      // findings that trace back to AgentReport evidence
    keyFindingsUngrounded: number,    // findings with NO supporting evidence in any report
    ungroundedFindings: string[],     // the specific ungrounded claims (for debugging)
    sourcesInVerdictTotal: number,    // sources cited in final verdict
    sourcesTraceable: number,         // verdict sources that appear in investigator reports
    reasoningGrounded: boolean,       // does the reasoning reference actual evidence? (heuristic)
    score: number,                    // 0-100: (grounded / total) * 80 + (traceable / total) * 20
  }
  ```
- **Grounding algorithm (code-based, no LLM):**
  1. For each `verdict.keyFindings[i]`, fuzzy-match against all `agentReport.findings[].claim` and `agentReport.findings[].sources[].relevantSnippet` across all agent reports
  2. Fuzzy match = lowercase both strings, check if >50% of non-stopword tokens in the key finding appear in any agent evidence string
  3. For each `verdict.sources[i].url`, check if URL appears in any `agentReport.findings[].sources[].url`
  4. For `reasoning`: check if it contains at least 2 quoted or paraphrased references to agent findings (heuristic: look for agent role mentions like "source verification", "domain expertise", "pattern matching")
- Skip for non-factual claims (no investigation to ground)
- This is a **regression grader** — groundedness should stay above 70% once established
**Validation:**
- Test file: `tests/unit/eval/graders/groundedness-grader.test.ts`
- Test: `"should score 100 when all key findings appear in agent reports"`
- Test: `"should score 0 when no key findings match any agent evidence"`
- Test: `"should detect ungrounded key findings and list them"`
- Test: `"should trace verdict sources back to investigator sources"`
- Test: `"should skip for non-factual claims"`

### Task E2.7: Coverage grader (Research Agent Check #2)
- [ ]
**Objective:** Build a code-based grader that checks whether investigators found the important, expected sources for each claim — did they miss obvious debunks or confirmations?
**Blog principle:** *"Did the agent find the important information, or did it miss obvious sources?"* — The blog's second essential check for research agents. A pipeline that misses the top Snopes debunk for a known hoax has a coverage failure, even if it stumbles into the right verdict.
**Details:**
- Create `eval/graders/coverage-grader.ts`
- Function `gradeCoverage(result: EvalTrialResult, claim: EvalClaim)` → `CoverageGrade`:
  ```typescript
  {
    mustFindTotal: number,           // how many must-find sources defined for this claim
    mustFindHit: number,             // how many were actually found by investigators
    mustFindMissed: string[],        // URL substrings that no investigator cited
    totalSourcesFound: number,       // total unique sources across all agent reports
    uniqueDomains: number,           // source diversity: how many unique domains cited
    factCheckDbHit: boolean,         // did any investigator find an existing fact-check?
    score: number,                   // 0-100: (mustFindHit / mustFindTotal) * 70 + diversity bonus 30
  }
  ```
- **Coverage algorithm (code-based, no LLM):**
  1. Collect all `sources[].url` from all `AgentReport.findings[]` into a flat set
  2. For each `claim.mustFindSources[]` substring, check if ANY collected URL contains it (case-insensitive)
  3. Count unique root domains from all collected URLs (more diverse = better)
  4. Check if any source URL contains known fact-check domains: `["snopes.com", "politifact.com", "factcheck.org", "altnews.in", "boomlive.in"]`
  5. Diversity bonus: 30 points × min(uniqueDomains / 5, 1) — capped at 5 unique domains
- Claims without `mustFindSources` defined: skip coverage check (score: N/A)
- This is a **capability eval** — coverage will start low and improve as prompts are tuned
**Validation:**
- Test file: `tests/unit/eval/graders/coverage-grader.test.ts`
- Test: `"should score 100 when all must-find sources are present in agent reports"`
- Test: `"should score 0 when no must-find sources are found"`
- Test: `"should list missed must-find sources"`
- Test: `"should award diversity bonus for multiple unique domains"`
- Test: `"should detect fact-check database hits"`
- Test: `"should return N/A for claims without mustFindSources"`

### Task E2.8: Source quality grader (Research Agent Check #3)
- [ ]
**Objective:** Build a code-based grader that evaluates whether the pipeline relied on trustworthy sources or built its verdict on low-credibility evidence.
**Blog principle:** *"Are the sources the agent relied on actually trustworthy?"* — The blog's third essential check for research agents. A verdict citing official government sites and Reuters is more trustworthy than one citing random blogs, even if both reach the same conclusion.
**Details:**
- Create `eval/graders/source-quality-grader.ts`
- Function `gradeSourceQuality(result: EvalTrialResult, claim: EvalClaim)` → `SourceQualityGrade`:
  ```typescript
  {
    totalSources: number,
    highCredibility: number,          // sources marked "high" by investigators
    mediumCredibility: number,        // sources marked "medium"
    lowCredibility: number,           // sources marked "low"
    unknownCredibility: number,       // sources marked "unknown"
    credibilityDistribution: {        // percentage breakdown
      high: number,
      medium: number,
      low: number,
      unknown: number,
    },
    majorityCredible: boolean,        // >50% of sources are "high" or "medium"
    meetsMinimumThreshold: boolean,   // meets claim's minimumSourceCredibility requirement
    lowQualityWarnings: string[],     // URLs of low/unknown credibility sources used in verdict
    score: number,                    // 0-100: weighted by credibility distribution
  }
  ```
- **Source quality algorithm (code-based, no LLM):**
  1. Collect all `sources[].credibility` from all `AgentReport.findings[]`
  2. Count distribution: high, medium, low, unknown
  3. Score = (high × 100 + medium × 70 + low × 20 + unknown × 10) / totalSources
  4. Cross-reference: check if any `verdict.sources[].url` matches a low/unknown credibility source from investigator reports — these are "low quality warnings"
  5. If claim has `minimumSourceCredibility: "high"`, check that >50% of sources are "high"
- Skip for non-factual claims
- This is a **capability eval** — source quality depends on investigator prompts and search result quality
**Validation:**
- Test file: `tests/unit/eval/graders/source-quality-grader.test.ts`
- Test: `"should score 100 when all sources are high credibility"`
- Test: `"should score low when majority of sources are unknown credibility"`
- Test: `"should flag low-credibility sources used in final verdict"`
- Test: `"should check minimumSourceCredibility threshold when defined"`
- Test: `"should compute credibility distribution percentages correctly"`
- Test: `"should skip for non-factual claims"`

---

## Phase E3: Model-Based Graders (LLM Judge)

### Task E3.1: Reasoning quality grader — Haiku-based rubric scorer
- [ ]
**Objective:** Build a model-based grader that evaluates the quality of the Judge's reasoning, DA's challenge, and Strategist's planning using Claude Haiku as a cheap meta-evaluator.
**Details:**
- Create `eval/graders/reasoning-grader.ts`
- Uses **Haiku** (cheap — ~$0.01/grading call) to evaluate quality dimensions
- Function `gradeReasoning(result: EvalTrialResult, claim: EvalClaim, client: ClaudeClient)` → `ReasoningGrade`:
  ```typescript
  {
    strategistQuality: {
      queryRelevance: number,       // 0-5: are search queries targeted to the claim?
      falsificationClarity: number, // 0-5: are falsification criteria specific and testable?
      overall: number,              // 0-5
    },
    daQuality: {
      genuineChallenge: boolean,    // did the DA actually challenge (not rubber-stamp)?
      challengeRelevance: number,   // 0-5: are challenges relevant to the findings?
      outcomeCorrect: boolean,      // did DA succeed/fail appropriately given claim truth?
      overall: number,              // 0-5
    },
    judgeQuality: {
      evidenceSynthesis: number,    // 0-5: did Judge integrate all agent reports?
      logicalConsistency: number,   // 0-5: does reasoning support the verdict?
      groundedness: number,         // 0-5: are claims in reasoning supported by cited evidence?
      overall: number,              // 0-5
    },
    totalScore: number,             // 0-100 normalized
  }
  ```
- System prompt for Haiku grader — structured rubric:
  ```
  You are an evaluation judge for a fact-checking AI pipeline.
  Score each dimension 0-5:
  0 = completely wrong/missing
  1 = major issues
  2 = significant gaps
  3 = acceptable but mediocre
  4 = good quality
  5 = excellent

  You MUST respond with JSON matching the schema exactly.
  ```
- Input to Haiku: the claim, expected outcome, and all pipeline outputs (strategist, DA, judge)
- One Haiku call per claim (~$0.01)
- Skip for non-factual claims (no reasoning to evaluate)
**Validation:**
- Test file: `tests/unit/eval/graders/reasoning-grader.test.ts`
- Test: `"should return valid ReasoningGrade for a complete pipeline result"` (mock Haiku)
- Test: `"should handle missing DA report gracefully"`
- Test: `"should skip grading for non-factual claims"`
- QA test: `"should grade a real pipeline result via Haiku"` — real API call with sample data

### Task E3.2: Manipulation technique accuracy grader
- [ ]
**Objective:** Build a model-based grader that checks if identified manipulation techniques are real and relevant to the claim, not hallucinated.
**Details:**
- Create `eval/graders/manipulation-grader.ts`
- Uses **Haiku** for cheap evaluation
- Function `gradeManipulation(result: EvalTrialResult, claim: EvalClaim, client: ClaudeClient)` → `ManipulationGrade`:
  ```typescript
  {
    techniquesIdentified: number,
    techniquesRelevant: number,     // how many are actually present in the claim text
    techniquesHallucinated: number, // claimed but not evidenced
    evidenceQuoted: boolean,        // do evidence quotes exist in original message?
    score: number,                  // 0-100: (relevant / max(identified, expected)) * 100
  }
  ```
- Haiku prompt: "Given this claim text, verify whether each identified manipulation technique is actually present. Quote the specific text that demonstrates each technique."
- Only runs on claims tagged with expected manipulation techniques (false + misleading claims)
**Validation:**
- Test file: `tests/unit/eval/graders/manipulation-grader.test.ts`
- Test: `"should detect hallucinated manipulation techniques"` (mock Haiku)
- Test: `"should score 100 when all techniques are relevant"`
- Test: `"should skip for claims without expected manipulation"`

---

## Phase E4: Statistical Analysis

### Task E4.1: Confidence calibration analyzer
- [ ]
**Objective:** Build an analysis module that measures how well-calibrated the pipeline's confidence scores are against actual correctness.
**Details:**
- Create `eval/analysis/calibration.ts`
- Function `analyzeCalibration(results: EvalTrialResult[])` → `CalibrationReport`:
  ```typescript
  {
    bins: Array<{
      range: [number, number],       // e.g. [0, 20], [20, 40], ...
      claimCount: number,
      correctCount: number,          // verdict category matches expected
      accuracy: number,              // correctCount / claimCount
      avgConfidence: number,
      calibrationError: number,      // |accuracy - avgConfidence/100|
    }>,
    expectedCalibrationError: number, // mean across bins (lower = better calibrated)
    overconfidentBins: number,        // bins where avgConfidence > accuracy
    underconfidentBins: number,       // bins where avgConfidence < accuracy
  }
  ```
- 5 bins: 0–20, 20–40, 40–60, 60–80, 80–100
- A well-calibrated system: claims scored at 80% confidence should be correct ~80% of the time
- This is a **capability eval** — we expect poor calibration initially and use it to improve prompts
**Validation:**
- Test file: `tests/unit/eval/analysis/calibration.test.ts`
- Test: `"should compute calibration bins correctly for sample data"`
- Test: `"should detect overconfident bins"`
- Test: `"should handle empty bins gracefully"`

### Task E4.2: pass@k consistency analyzer
- [ ]
**Objective:** Build an analysis module that measures pipeline consistency using pass@k metrics from multiple trials per claim.
**Details:**
- Create `eval/analysis/consistency.ts`
- Function `analyzeConsistency(results: EvalTrialResult[])` → `ConsistencyReport`:
  ```typescript
  {
    claims: Array<{
      claimId: string,
      trials: number,
      passCount: number,            // trials where category was acceptable
      passRate: number,             // passCount / trials
      categoriesReturned: string[], // unique categories across trials
      confidenceRange: [number, number], // min/max confidence across trials
      confidenceStdDev: number,
    }>,
    passAt1: number,     // % of claims where first trial passes
    passAt3: number,     // % of claims where at least 1 of 3 trials passes
    passAllK: number,    // % of claims where ALL trials pass (stringent)
    avgConfidenceStdDev: number,
    categoryFlipRate: number, // % of claims with different categories across trials
  }
  ```
- Groups results by claimId and trial number
- pass@1 = single attempt success rate
- pass@3 = at least 1 of 3 attempts succeeds (measures recoverability)
- pass^3 = all 3 attempts succeed (measures reliability)
- Category flip rate measures the most concerning inconsistency: same claim getting different verdict categories
**Validation:**
- Test file: `tests/unit/eval/analysis/consistency.test.ts`
- Test: `"should compute pass@1 and pass@3 correctly"`
- Test: `"should detect category flips across trials"`
- Test: `"should compute confidence standard deviation"`

---

## Phase E5: Eval Runner & Reporting

### Task E5.1: Create eval runner script
- [ ]
**Objective:** Build the main entry point that runs the full eval suite and produces structured output.
**Details:**
- Create `eval/run-eval.ts` — executable script
- CLI: `npx tsx eval/run-eval.ts [options]`
  - `--mode mock|live` (default: mock)
  - `--trials N` (default: 1, set to 3 for pass@k)
  - `--group false|true|partial|non-factual|adversarial|all` (default: all)
  - `--claim <id>` (run single claim)
  - `--graders code|model|all` (default: code — skip model-based for fast runs)
  - `--report` (generate markdown report, default: true)
- Execution flow:
  1. Load eval dataset
  2. Initialize eval harness with config
  3. Run all claims through pipeline
  4. Run all code-based graders on results
  5. Run model-based graders if `--graders model|all`
  6. Run statistical analysis (calibration + consistency)
  7. Generate report
  8. Print summary to stdout
  9. Exit non-zero if regression evals fail
- Add `"eval"` and `"eval:live"` scripts to `package.json`:
  - `"eval": "npx tsx eval/run-eval.ts --mode mock --graders code"`
  - `"eval:full": "npx tsx eval/run-eval.ts --mode mock --trials 3 --graders all"`
  - `"eval:live": "npx tsx eval/run-eval.ts --mode live --trials 1 --graders all"`
**Validation:**
- Test file: `tests/unit/eval/run-eval.test.ts`
- Test: `"should parse CLI arguments correctly"` (unit test on arg parser)
- Test: `"should run eval suite in mock mode with single claim"` (mock all agents)
- Test: `"should exit non-zero when regression graders fail"`
- Integration: `npx tsx eval/run-eval.ts --mode mock --claim false-001 --graders code` completes without error

### Task E5.2: Create eval report generator
- [ ]
**Objective:** Build the Markdown report generator that produces a comprehensive, human-readable eval report.
**Details:**
- Create `eval/report.ts`
- Function `generateReport(results, grades, analysis, config)` → `string` (Markdown)
- Report structure:
  ```markdown
  # ForwardCheck-AI — Eval Report

  **Date:** 2026-02-14  |  **Mode:** mock  |  **Trials:** 3  |  **Claims:** 30
  **Total Cost:** $X.XX  |  **Total Duration:** Xm Xs

  ## Summary
  | Metric | Value | Target | Status |
  |--------|-------|--------|--------|
  | Classifier Routing Accuracy | X% | >90% | PASS/FAIL |
  | Verdict Category Accuracy (exact) | X% | >70% | PASS/FAIL |
  | Verdict Category Accuracy (acceptable) | X% | >85% | PASS/FAIL |
  | Confidence Gate Compliance | X% | 100% | PASS/FAIL |
  | Schema Compliance | X% | 100% | PASS/FAIL |
  | Cost Budget Compliance | X% | 100% | PASS/FAIL |
  | Latency Budget Compliance | X% | >90% | PASS/FAIL |
  | **Research Quality** | | | |
  | Groundedness (findings) | X% | >70% | PASS/FAIL |
  | Groundedness (sources) | X% | >80% | PASS/FAIL |
  | Coverage (must-find sources) | X% | >60% | — |
  | Source Quality (majority credible) | X% | >75% | — |
  | **Consistency** | | | |
  | pass@1 | X% | >70% | — |
  | pass@3 | X% | >85% | — |
  | Category Flip Rate | X% | <15% | — |
  | Avg Confidence Std Dev | X pts | <15 | — |
  | Expected Calibration Error | X.XX | <0.20 | — |

  ## Per-Claim Results
  | ID | Claim (truncated) | Expected | Got | Confidence | Cost | Duration | Score |
  |...per claim row...|

  ## Failures
  [list of claims that failed with error details]

  ## Calibration Analysis
  [5-bin table with accuracy vs confidence]

  ## Reasoning Quality (model-based graders)
  [if model-based graders were run]
  | Dimension | Avg Score (0-5) |
  |...|

  ## Recommendations
  [auto-generated based on failures]
  ```
- Write report to `eval/reports/eval-YYYY-MM-DD-HHMMSS.md`
- Create `eval/reports/` directory if it doesn't exist
- Add `eval/reports/` to `.gitignore`
**Validation:**
- Test file: `tests/unit/eval/report.test.ts`
- Test: `"should generate valid Markdown report from sample data"`
- Test: `"should include all summary metrics"`
- Test: `"should list failed claims"`
- Test: `"should handle empty results gracefully"`

### Task E5.3: Integrate eval checks into quality gate
- [ ]
**Objective:** Add a regression eval check to the existing quality gate script so prompt/code changes that regress eval scores are caught.
**Details:**
- Edit `scripts/quality-gate.sh` — add step after coverage:
  ```bash
  echo "=== Eval Regression Check (mock) ==="
  npx tsx eval/run-eval.ts --mode mock --trials 1 --graders code --group non-factual 2>&1
  ```
  - Only runs non-factual group (6 claims, $0 LLM cost for mocked, <$0.10 if touching Haiku)
  - These are regression evals — should maintain 100% classifier routing accuracy
  - Fail the gate if classifier accuracy < 100% for non-factual claims
- Edit `scripts/quality-full.sh` — add comprehensive eval step:
  ```bash
  echo "=== Full Eval Suite (mock, 1 trial) ==="
  npx tsx eval/run-eval.ts --mode mock --trials 1 --graders all --report 2>&1
  ```
- Do NOT block the quality gate on capability eval scores (those are informational)
- Only block on regression eval scores (classifier routing, gate compliance, schema compliance)
**Validation:**
- `npm run quality` still passes (non-factual evals pass)
- Intentionally break classifier prompt → quality gate fails
- `npm run quality:full` produces eval report in `eval/reports/`

---

## Phase E6: Prompt Tuning Evals (Capability)

### Task E6.1: Run baseline eval and establish pass rates
- [ ]
**Objective:** Run the full eval suite (mock mode, 1 trial) on the current codebase to establish baseline metrics before any prompt tuning.
**Details:**
- Run: `npx tsx eval/run-eval.ts --mode mock --trials 1 --graders all --report`
- Record baseline metrics in `eval/BASELINE.md`:
  - Classifier routing accuracy
  - Verdict category accuracy (exact + acceptable)
  - Confidence calibration error
  - Reasoning quality scores (from model-based grader)
  - Cost and latency budgets
- Identify top failure patterns:
  - Which claim categories have lowest accuracy?
  - Where is confidence most miscalibrated?
  - Which agents produce the weakest reasoning?
- This is the "hill to climb" — capability evals should improve from here
- Commit baseline report
**Validation:**
- `eval/BASELINE.md` contains all metrics
- `eval/reports/` contains the full report
- No regressions in existing test suite

### Task E6.2: Run pass@3 consistency eval
- [ ]
**Objective:** Run 3 trials per claim (mock mode) to measure pipeline consistency and identify flaky claims.
**Details:**
- Run: `npx tsx eval/run-eval.ts --mode mock --trials 3 --graders code --report`
- Expected cost: ~$1.85 × 24 factual claims × 3 trials = ~$133 (mock mode, LLM only)
  - NOTE: This is expensive. Consider running on a subset first:
  - `npx tsx eval/run-eval.ts --mode mock --trials 3 --graders code --group false` (8 claims × 3 = 24 runs ≈ $44)
- Record in consistency report:
  - pass@1, pass@3, pass^3 rates
  - Claims with category flips (most concerning — same claim, different verdict)
  - Claims with high confidence variance (> 20 points across trials)
- Identify the "flaky claims" — these may need prompt changes or may be genuinely ambiguous
**Validation:**
- Consistency report generated
- Category flip rate documented
- Flaky claims identified and annotated in dataset

### Task E6.3: Structured transcript review (Human Grading)
- [ ]
**Objective:** Manually review 5–10 pipeline transcripts to catch failure patterns that automated graders miss, and calibrate model-based graders against human judgment.
**Blog principle:** *"Read transcripts regularly to verify graders function correctly and failures seem fair."* — The blog emphasizes this as essential for research agents because automated graders can't catch everything. A grader might score 100% on a verdict where the reasoning is subtly circular, or where the DA rubber-stamped instead of genuinely challenging.
**Details:**
- Create `eval/TRANSCRIPT_REVIEW.md` — structured template for manual review
- Select 5–10 transcripts from E6.1 baseline results:
  - 2 from "failed" claims (wrong verdict category)
  - 2 from "passed but low score" claims (right category, poor reasoning)
  - 2 from "passed with high score" claims (sanity check — do graders agree with human?)
  - 1–2 from adversarial/edge case claims
- For each transcript, manually evaluate:
  1. **Strategist:** Were the search queries smart? Were falsification criteria specific?
  2. **Investigators:** Did they find the key evidence? Did they miss obvious sources?
  3. **DA:** Was the challenge genuine, or did it rubber-stamp? Was the succeed/fail flag correct?
  4. **Judge:** Is the reasoning logically sound? Does it actually synthesize the evidence?
  5. **Grader accuracy:** Do the automated grader scores feel right? Where do they over/under-score?
- Record findings in `eval/TRANSCRIPT_REVIEW.md`:
  ```markdown
  ## Claim: false-001 — PM Modi Rs 5000
  **Verdict:** likely-false (12%) — CORRECT
  **Automated score:** 92/100
  **Human assessment:** Agree — reasoning is solid, DA genuinely challenged
  **Grader issue:** None found
  **Notes:** Source verification found PIB fact-check — good coverage

  ## Claim: partial-003 — Coffee causes cancer
  **Verdict:** unverified (42%) — ACCEPTABLE but imprecise
  **Automated score:** 78/100
  **Human assessment:** Agree on score, but reasoning quality grader gave 4/5 when it should be 3/5
  **Grader issue:** Reasoning grader doesn't penalize for missing IARC reclassification nuance
  **Notes:** Need to add "IARC Group 2B removed in 2016" to claim notes
  ```
- Use findings to:
  - File bugs against graders (add to `IMPLEMENTATION_EVAL_PLAN.md` as new tasks)
  - Adjust grader rubrics or scoring weights
  - Add edge cases to eval dataset
**Validation:**
- `eval/TRANSCRIPT_REVIEW.md` contains reviews for 5–10 claims
- At least 1 grader issue identified and documented
- At least 1 dataset improvement identified

### Task E6.4: Run live-mode validation eval
- [ ]
**Objective:** Run the eval suite with real search APIs on a small subset to validate that mock-mode results generalize.
**Details:**
- Run: `npx tsx eval/run-eval.ts --mode live --trials 1 --graders all --group false --report`
- 8 false claims × $2/claim = ~$16
- Compare live vs mock results:
  - Do verdict categories differ? (search quality matters)
  - Is confidence more/less calibrated with real search?
  - Are there claims that pass in mock but fail in live? (canned results too favorable)
- Document differences in report
**Validation:**
- Live eval report generated
- Comparison with mock baseline documented
- No claims that crash/timeout in live but work in mock

---

## Dependency Graph

```
Phase E0 (Dataset)
  ├─→ E0.1 (Ground truth claims + mustFindSources + minimumSourceCredibility)
  └─→ E0.2 (Canned search results) ← depends on E0.1

Phase E1 (Harness)
  ├─→ E1.1 (Eval harness) ← depends on E0
  └─→ E1.2 (Pipeline intermediate outputs) ← independent

Phase E2 (Code-Based Graders) ← depends on E1
  ├─→ E2.1 (Classifier grader) ← independent
  ├─→ E2.2 (Verdict grader) ← independent
  ├─→ E2.3 (Gate grader) ← independent
  ├─→ E2.4 (Budget grader) ← independent
  ├─→ E2.5 (Schema grader) ← independent
  ├─→ E2.6 (Groundedness grader ★) ← independent — Research Agent Check #1
  ├─→ E2.7 (Coverage grader ★) ← independent — Research Agent Check #2
  └─→ E2.8 (Source quality grader ★) ← independent — Research Agent Check #3

Phase E3 (Model-Based Graders) ← depends on E1
  ├─→ E3.1 (Reasoning grader) ← independent
  └─→ E3.2 (Manipulation grader) ← independent

Phase E4 (Analysis) ← depends on E1
  ├─→ E4.1 (Calibration) ← independent
  └─→ E4.2 (Consistency) ← independent

Phase E5 (Runner & Reporting) ← depends on E2, E3, E4
  ├─→ E5.1 (Eval runner script)
  ├─→ E5.2 (Report generator) ← depends on E5.1
  └─→ E5.3 (Quality gate integration) ← depends on E5.1

Phase E6 (Prompt Tuning + Human Review) ← depends on E5
  ├─→ E6.1 (Baseline eval)
  ├─→ E6.2 (pass@3 consistency) ← depends on E6.1
  ├─→ E6.3 (Transcript review ★) ← depends on E6.1 — Human Grading
  └─→ E6.4 (Live validation) ← depends on E6.1
```

★ = Tasks added to close research agent eval gaps identified in blog

**Recommended build order:** E0.1 → E0.2 → E1.2 → E1.1 → E2.1–E2.8 (parallel) → E3.1–E3.2 (parallel) → E4.1–E4.2 (parallel) → E5.1 → E5.2 → E5.3 → E6.1 → E6.2 → E6.3 → E6.4

**Estimated build time:** ~12–16 hours across 2 days
**Estimated eval cost:** ~$40–60 for mock + live runs combined

---

## Target Metrics (informed by blog guidance)

### Outcome Graders (did we get the right answer?)

| Metric | Type | Target | Rationale |
|--------|------|--------|-----------|
| Classifier Routing Accuracy | Regression | >95% | Simple routing — should be near-perfect with Haiku |
| Verdict Category (exact) | Capability | >60% | LLMs are non-deterministic; exact match is hard |
| Verdict Category (acceptable) | Capability | >80% | With flexible acceptable categories, should be high |
| Confidence Gate Compliance | Regression | 100% | Mechanical — code enforced, never fails |
| Schema Compliance | Regression | 100% | Fixed by B4/B6 — should never regress |
| Cost Budget (<$3/claim) | Regression | 100% | Well under budget at ~$2/claim |
| Latency (<120s) | Capability | >90% | Occasional Opus timeouts expected |

### Research Quality Graders ★ (did we do good research?)

| Metric | Type | Target | Rationale |
|--------|------|--------|-----------|
| Groundedness (key findings) | Capability | >70% | Judge findings should trace back to investigator evidence |
| Groundedness (sources) | Capability | >80% | Verdict sources should appear in investigator reports |
| Coverage (must-find sources) | Capability | >60% | At least find the obvious debunks/confirmations |
| Source Quality (majority credible) | Capability | >75% | >50% of sources should be "high" or "medium" credibility |
| Source Quality (low-quality warnings) | Capability | <20% | Few low/unknown sources should leak into final verdict |

### Consistency Metrics (is the pipeline reliable?)

| Metric | Type | Target | Rationale |
|--------|------|--------|-----------|
| pass@1 | Capability | >60% | First-try success rate |
| pass@3 | Capability | >80% | At least 1 of 3 attempts succeeds |
| Category Flip Rate | Capability | <20% | Same claim should give consistent categories |
| Calibration Error | Capability | <0.25 | Aspirational — LLMs are notoriously poorly calibrated |

### Reasoning Quality Metrics (model-based + human)

| Metric | Type | Target | Rationale |
|--------|------|--------|-----------|
| Reasoning Quality (avg) | Capability | >3.0/5 | "Good" quality threshold |
| DA Genuine Challenge Rate | Capability | >80% | DA should actually challenge, not rubber-stamp |
| Manipulation Technique Relevance | Capability | >70% | Identified techniques should be real, not hallucinated |
| Human-Grader Agreement | Informational | — | Track how often automated graders agree with human review |

---

## Eval Claims to Demo Outcomes Mapping

The eval suite directly supports the demo narrative:

| Demo Moment | Eval Verification | Grader |
|-------------|-------------------|--------|
| "LIKELY FALSE — 8%" (Modi Rs 5000) | category `likely-false`, confidence 0–29 | E2.2 Verdict |
| "MISLEADING — 45%" (WHO green tea) | correct nuance detection | E2.2 Verdict |
| DA "tried and failed" | `daQuality.outcomeCorrect === true` for false claims | E3.1 Reasoning |
| Visible thinking | `thinkingSummary` non-empty | E2.5 Schema |
| Confidence decomposition | all 4 components present and 0–100 | E2.5 Schema |
| Manipulation techniques | techniques relevant, not hallucinated | E3.2 Manipulation |
| Pipeline completes in <60s | latency within budget | E2.4 Budget |
| **Research quality** | | |
| Judge cites real evidence | key findings grounded in investigator reports | E2.6 Groundedness ★ |
| Found the Snopes/PIB debunk | must-find sources hit rate | E2.7 Coverage ★ |
| Cited credible sources | majority high/medium credibility | E2.8 Source Quality ★ |
| Human agrees with graders | transcript review confirms automated scores | E6.3 Transcript ★ |

---

*Grounded in [Anthropic — Demystifying Evals for AI Agents](https://www.anthropic.com/engineering/demystifying-evals-for-ai-agents) — February 2026*
