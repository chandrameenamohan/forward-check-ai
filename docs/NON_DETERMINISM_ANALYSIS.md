# Non-Determinism Analysis: Why Nearly Identical Claims Produce Wildly Different Verdicts

**Date:** February 16, 2026
**Investigation IDs:** `NF0wSlMnhIz8qKL79X9mY` (62%) vs `x2fDezBk8UYTezZQw57rT` (10%)

---

## The Problem

Two nearly identical claims submitted to production minutes apart:

| | Investigation 1 | Investigation 2 |
|---|---|---|
| **Input** | **E**lon Musk just said 'AI will replace all programmers within 2 years...' | **l**on Musk just said 'AI will replace all programmers within 2 years...' |
| **Difference** | Full message | Missing first character "E" |
| **Verdict** | partially-true (62%) | likely-false (10%) |
| **Cost** | $2.07 | $1.47 |
| **Duration** | 297s (5.0 min) | 243s (4.1 min) |

One missing character. 52-point confidence swing. Opposite verdict categories.

---

## The Smoking Gun: Investigator Findings Diverged

| Agent | Inv 1 ("Elon", 62%) | Inv 2 ("lon", 10%) |
|-------|---------------------|---------------------|
| **source_verification** | [75] contradicted | [85, 95] contradicted, contradicted |
| **domain_expertise** | **[95] supported**, [90,85,80] contradicted x3 | [85, 95] contradicted, contradicted |
| **pattern_matching** | [75] mixed | [75, 85] insufficient_evidence, contradicted |

The critical difference: In Investigation 1, the domain expertise agent found **one sub-claim "supported" at 95% confidence** — Musk genuinely DID predict coding would end. This single finding pulled the Judge toward "partially-true."

In Investigation 2, the same agent rated everything "contradicted." Zero partial support. The Judge saw unanimous contradiction and went hard "likely-false" at 10%.

---

## Confidence Decomposition Comparison

| Component | Inv 1 (62%) | Inv 2 (10%) | Delta |
|-----------|-------------|-------------|-------|
| Evidence Strength | 80 | 92 | +12 |
| Source Reliability | 75 | 90 | +15 |
| Claim Complexity | 70 | 75 | +5 |
| Counter-Argument Resilience | 55 | 90 | +35 |

Paradoxically, Inv 2 scored HIGHER on all four components — because "the evidence strongly contradicts the claim" is itself a high-confidence finding. The 10% confidence means "10% likely to be true" (i.e., 90% likely false), while the high decomposition scores reflect certainty in that judgment.

---

## Three Compounding Root Causes

### 1. Temperature = 1.0 (Maximum Randomness)

**Every single API call in the pipeline uses the Anthropic SDK default `temperature: 1.0`.** Not a single file in the codebase explicitly sets temperature.

Files checked — no temperature parameter found:
- `src/orchestrator/agent-runner.ts` (lines 103-111)
- `src/agents/classifier-agent.ts` (line 69)
- `src/agents/strategist-agent.ts` (line 199)
- `src/agents/devils-advocate-agent.ts` (line 156)
- `src/agents/investigators/*.ts`

From the Anthropic SDK docs:
> Defaults to `1.0`. Use temperature closer to `0.0` for analytical / multiple choice tasks.

Fact-checking is definitively an "analytical" task. Running it at max temperature is like asking a judge to flip a weighted coin instead of deliberating.

### 2. Different Web Search Results

The missing "E" in "lon Musk" produced different Brave Search queries. Search engines are sensitive to exact strings:
- "Elon Musk AI replace programmers" → direct hits on Musk's statements
- "lon Musk AI replace programmers" → potentially fewer/different results

The investigators found different sources, leading to different assessments. The domain expert in Inv 1 found a source confirming Musk's prediction (marked "supported"), while in Inv 2 it found only contradicting sources.

### 3. Cascade Amplification Through the Pipeline

The 6-agent pipeline is a chain where each stage's randomness compounds:

```
Classifier (temp 1.0)
    → Strategist (temp 1.0) — generates different search queries
        → 3 Investigators (temp 1.0 each, parallel) — different findings
            → Devil's Advocate (temp 1.0) — different challenge strength
                → Judge (temp 1.0) — different final synthesis
```

One "supported" finding from the domain expert in Inv 1 cascaded through to the Judge, which wrote a nuanced "partially-true" analysis. Without it, the Judge in Inv 2 saw unanimous contradiction and rendered "likely-false."

---

## Judge Reasoning Comparison

### Investigation 1 (62% — partially-true)

> "Where the claim gets it RIGHT: Musk did make dramatic predictions about AI and coding — the kernel is real. The ~2 year timeline (January 2025 to end 2026) is approximately accurate. The general direction — AI fundamentally disrupting programming — reflects Musk's stated views."
>
> "Where the claim DISTORTS reality: Hedging removed — Musk said coding 'may not exist' as a profession. Scope amplified — 'All programmers' replaced is stronger than 'coding as a profession may end.'"

### Investigation 2 (10% — likely-false)

> "Both sub-claims are materially false as stated. The claim appears to be engineered outrage content that takes two real events — Musk's AI predictions and Tesla's 2024 layoffs — exaggerates both to extremes, and falsely implies a causal connection between them."

Same underlying facts. But the Judge in Inv 1 emphasized the "kernel of truth" while the Judge in Inv 2 emphasized the distortion. This is a direct consequence of what findings they received from investigators.

---

## Devil's Advocate Comparison

Both DA reports returned `counterArgumentSucceeded: false` — meaning neither could build a viable case FOR the claim. But their challenges differed:

**Inv 1 DA** raised 5 challenges, including questioning whether the timeline distortion was meaningful and whether "coding as a profession ending" is semantically close to "all programmers replaced."

**Inv 2 DA** raised 4 challenges, more focused on the "firing all Tesla engineers" sub-claim being the weaker part to defend.

---

## The Fix (Implemented & Deployed)

**PR:** [#30](https://github.com/chandrameenamohan/forward-check-ai/pull/30) — merged and deployed to production Feb 16, 2026.

Three bugs fixed across 7 files (+22/-21 lines):

### Fix 1: Temperature 0 for analytical agents

```typescript
// src/services/claude-client.ts — central wrapper
const effectiveParams =
  params.temperature !== undefined || params.thinking
    ? params
    : { ...params, temperature: 0 as const };
```

Sets `temperature: 0` by default for all non-thinking API calls (Classifier, Investigators, Report Extractor). Agents with extended thinking (Strategist, DA, Judge) keep `temperature: 1` as required by the Anthropic API.

### Fix 2: Investigator submit_report retry had no conversation context

The retry mechanism in `report-extractor.ts` was passing **only the initial user message** to the retry call, not the full conversation. The retry model had zero context about what the investigator found — no search results, no analysis — and couldn't produce a valid report.

**Root cause:** Each investigator's `extractReport()` call passed a fresh single-message array instead of `result._messages` (the full multi-turn conversation).

**Fix:** All 3 investigators now pass `result._messages` so the retry has full conversation context. Additionally, `tool_choice: { type: "tool", name: "submit_report" }` forces the model to call the tool on retry instead of responding with text.

### Fix 3: Judge submit_verdict retry reliability

Same class of bug at the Judge level. Added `toolChoice` support to `AgentConfig`/`runAgent`, then used `toolChoice: { type: "tool", name: "submit_verdict" }` on the Judge retry. Increased retry timeout from 60s to 120s.

---

## Post-Fix Production Results

Same two claims re-submitted to production after deploying the fix:

| | Run 1 ("Elon") | Run 2 ("lon") |
|---|---|---|
| **Investigation ID** | `yKprBhIxQ6G41O4u_UvLW` | `sEA9rlAftNjQKh1sp87H_` |
| **Verdict** | **partially-true (62%)** | **partially-true (62%)** |
| **Investigators** | **3/3 succeeded** | **3/3 succeeded** |
| **Status** | completed | completed |

### Before vs After

| Metric | Before Fix | After Fix |
|--------|-----------|-----------|
| Verdict gap | `partially-true` (62%) vs `likely-false` (10%) | **Both `partially-true` (62%)** |
| Confidence swing | **52 points** | **0 points** |
| Verdict categories | **Opposite** (partially-true vs likely-false) | **Identical** |
| Investigator success rate | 2/3 and 3/3 | **3/3 and 3/3** |

---

## Remaining Considerations

### Medium-term: Claim normalization

Before the pipeline runs, normalize the input:
- Fix obvious typos ("lon Musk" → "Elon Musk")
- Canonicalize entity names
- Use the Classifier's `extractedClaim` as the canonical input for all downstream agents

### Long-term: Ensemble verdicts

Run the pipeline 3 times and take the median confidence. Expensive ($3-6 per claim) but would catch outlier verdicts.

---

## Production Verdict URLs

### Pre-fix (the original problem)
- Inv 1 (62%): https://sincere-love-production-ced7.up.railway.app/v/NF0wSlMnhIz8qKL79X9mY
- Inv 2 (10%): https://sincere-love-production-ced7.up.railway.app/v/x2fDezBk8UYTezZQw57rT

### Post-fix (the solution)
- Run 1 (62%): https://sincere-love-production-ced7.up.railway.app/v/yKprBhIxQ6G41O4u_UvLW
- Run 2 (62%): https://sincere-love-production-ced7.up.railway.app/v/sEA9rlAftNjQKh1sp87H_
