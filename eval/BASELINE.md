# ForwardCheck-AI — Baseline Eval Results

**Date:** 2026-02-17
**Mode:** mock (canned search results, real LLM calls)
**Claims:** 15 | **Cost:** $5.44 | **Duration:** 32 min

---

## Aggregate Metrics

| Metric | Value | Target | Status |
|--------|-------|--------|--------|
| Harm-weighted verdict accuracy | 79.6% | >70% | PASS |
| Exact category match | 66.7% (10/15) | >60% | PASS |
| Acceptable category match | 80.0% (12/15) | >80% | PASS |
| Groundedness (grounded findings) | 100.0% | >70% | PASS |
| Groundedness (traceable sources) | 100.0% | >80% | PASS |
| Coverage (must-find source hit) | 90.0% | >60% | PASS |
| Coverage (avg unique domains) | 4.1 | — | — |
| Classifier routing (non-factual) | 100% (3/3) | 100% | PASS |

---

## Per-Group Breakdown

| Group | Exact Match | Acceptable Match | Cost |
|-------|-------------|------------------|------|
| Known False (4) | 4/4 (100%) | 4/4 (100%) | $2.18 |
| Known True (3) | 2/3 (67%) | 2/3 (67%) | $0.82 |
| Partially True (3) | 0/3 (0%) | 2/3 (67%) | $1.81 |
| Non-Factual (3) | 3/3 (100%) | 3/3 (100%) | $0.00 |
| Adversarial (2) | 1/2 (50%) | 1/2 (50%) | $0.64 |

---

## Per-Claim Results

| ID | Expected | Got | Confidence | Score | Cost | Duration | Result |
|----|----------|-----|------------|-------|------|----------|--------|
| false-001 | likely-false | likely-false | 3% | 100 | $0.58 | 188s | PASS |
| false-002 | likely-false | likely-false | 3% | 100 | $0.51 | 172s | PASS |
| false-003 | likely-false | likely-false | 2% | 100 | $0.56 | 180s | PASS |
| false-004 | likely-false | likely-false | 2% | 100 | $0.52 | 181s | PASS |
| true-001 | likely-true | ERROR (Strategist schema) | N/A | 0 | $0.00 | 25s | FAIL |
| true-002 | likely-true | likely-true | 99% | 100 | $0.39 | 127s | PASS |
| true-003 | likely-true | likely-true | 99% | 100 | $0.43 | 134s | PASS |
| partial-001 | partially-true | likely-false | 10% | 20 | $0.57 | 200s | FAIL |
| partial-002 | partially-true | likely-false | 8% | 50 | $0.58 | 185s | PASS* |
| partial-003 | partially-true | likely-false | 5% | 50 | $0.67 | 226s | PASS* |
| nonfactual-001 | greeting | greeting (short-circuit) | N/A | 100 | $0.00 | 1s | PASS |
| nonfactual-002 | opinion | opinion (short-circuit) | N/A | 100 | $0.00 | 2s | PASS |
| nonfactual-003 | scam | scam (short-circuit) | N/A | 100 | $0.00 | 2s | PASS |
| adversarial-001 | unverified | other (short-circuit) | N/A | 0 | $0.00 | 2s | FAIL |
| adversarial-002 | likely-false | likely-false | 5% | 100 | $0.63 | 214s | PASS |

\* partial-002 and partial-003 got "likely-false" which is in their `acceptableCategories` list, so they pass acceptable match but fail exact match.

---

## Failures Analysis

### 1. true-001 — Chandrayaan-3 Moon Landing (harm: 1)

**Expected:** likely-true | **Got:** ERROR — Strategist output failed schema validation (`investigatorGuidance` was string instead of object)

This is a **Strategist JSON serialization bug** — the Strategist returned `investigatorGuidance` as a string instead of an object. This is a known gotcha (documented in AGENTS.md). The pipeline crashed before any investigation could happen. Cost: $0.00 (pipeline error).

### 2. partial-001 — Harvard Chocolate Heart Disease (harm: 2)

**Expected:** partially-true | **Got:** likely-false (10%)

Same failure as the 5-claim transcript review. The pipeline found all the right evidence but cannot express "partially-true." The investigators assessed the claim as "contradicted" when it should be "mixed" (real study exists, but conclusion is exaggerated). See TRANSCRIPT_REVIEW.md for detailed analysis and proposed fixes.

### 3. adversarial-001 — "BREAKING: The president just announced..." (harm: 1)

**Expected:** unverified | **Got:** short-circuited as "other" by Classifier

Same failure as the 5-claim transcript review. The Classifier correctly identifies this as an incomplete claim but short-circuits it instead of letting the pipeline return a substantive "unverified" verdict. See TRANSCRIPT_REVIEW.md for proposed Classifier prompt fix.

---

## Groundedness (Sonnet-graded)

| Metric | Value |
|--------|-------|
| Avg grounded findings | 100.0% |
| Avg traceable sources | 100.0% |
| Avg groundedness score | 90.9% |

Groundedness was graded on the 10 factual claims that produced verdicts (excluding true-001 error and non-factual short-circuits). The pipeline's Judge agent consistently grounds its reasoning in investigator evidence. No hallucinated findings detected.

---

## Key Observations

1. **Known False claims: perfect.** All 4 false claims correctly identified with very low confidence (2-3%). The pipeline excels at debunking clear misinformation.

2. **Known True claims: mostly good.** 2/3 correct (true-002, true-003 at 99% confidence). true-001 failed due to a Strategist schema bug, not an intelligence failure.

3. **Partially True claims: systematic weakness.** 0/3 exact match. The pipeline treats exaggerated claims as fully false instead of partially true. This is the #1 issue to fix. (2/3 pass as "acceptable" because `likely-false` is in their acceptable categories.)

4. **Non-Factual routing: perfect.** 3/3 correctly short-circuited (greeting, opinion, scam).

5. **Adversarial claims: mixed.** adversarial-002 (compound claim) correctly identified as likely-false. adversarial-001 (vague BREAKING news) short-circuited by Classifier instead of being investigated.

6. **Groundedness: excellent.** 100% of key findings grounded in investigator evidence. No hallucinations detected.

7. **Coverage: strong.** 90% of must-find sources located. Average 4.1 unique domains per claim.

8. **Cost: much lower than budget.** $5.44 actual vs $28 budgeted per run. Mock mode with canned search results keeps LLM costs down.

---

## Metrics to Beat After Prompt Fixes

These are the numbers to improve in L5.2:

| Metric | Baseline | Target |
|--------|----------|--------|
| Harm-weighted accuracy | 79.6% | >85% (fix partial-001 harm:2 and true-001) |
| Exact category match | 66.7% | >73% (fix at least 1 more claim) |
| Acceptable match | 80.0% | >86% (fix adversarial-001) |
| true-001 | ERROR | likely-true (fix Strategist schema bug) |
| partial-001 | likely-false | partially-true (add mixed reasoning) |
| adversarial-001 | short-circuit | unverified (fix Classifier) |

---

*Baseline established. This is the number to beat after prompt fixes (L5.1).*
