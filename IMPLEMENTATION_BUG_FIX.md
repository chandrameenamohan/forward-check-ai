# ForwardCheck-AI — Bug Fix Plan

> Each task is atomic, single-objective, and follows TDD. A task is complete when: code written, tests pass, validation confirmed, committed and pushed.

**Bugs discovered during QA black-box testing with `scripts/seed-demo.ts`.**

---

## Bug B1: Confidence Gate Flips Correct Verdicts

### Root Cause
The Judge prompt tells the Judge that `likely-false` means confidence 0-29, so the Judge interprets `confidence` as a **truthfulness score** (0 = definitely false, 100 = definitely true). But the Judge is instead outputting `confidence` as **certainty in its verdict** — e.g., "I'm 97% certain this is likely-false." The confidence gate then reads 97 and overrides the category to `likely-true`, destroying the correct verdict.

**Evidence from logs:**
- Claim: "PM Modi announced Rs 5000..." → Judge: `likely-false` at 97% → Gate overrides to `likely-true`
- Claim: "WHO declares green tea cures cancer" → Judge: `likely-false` at 97% → Gate overrides to `likely-true`

### Task B1.1: Fix Judge prompt to clarify confidence = truthfulness score
- [ ]
**Objective:** Update the Judge system prompt so the `confidence` field unambiguously means "how likely the claim is to be TRUE" on a 0-100 scale, matching the gate ranges.
**Details:**
- Edit `src/agents/judge-agent.ts` — update `JUDGE_SYSTEM_PROMPT`
- In the VERDICT section, add explicit instructions:
  - `confidence` = "How likely is this claim to be TRUE? 0 = definitely false, 100 = definitely true"
  - If your category is `likely-false`, your confidence MUST be in 0-29
  - If your category is `likely-true`, your confidence MUST be in 85-100
  - If your category is `partially-true`, your confidence MUST be in 60-84
  - If your category is `unverified`, your confidence MUST be in 30-59
- Also update the `submit_verdict` tool's `confidence` property description to: `"Truthfulness score: 0 = definitely false, 100 = definitely true. Must align with category ranges: likely-true 85-100, partially-true 60-84, unverified 30-59, likely-false 0-29."`
- Do NOT change the confidence gate logic itself — the gate is correct, the Judge input was wrong
**Validation:**
- Test file: `tests/unit/agents/judge-agent.test.ts` — update existing mocks so the mock Judge returns confidence values that match category ranges
- All existing tests pass
- `npx tsc --noEmit` passes

### Task B1.2: Add confidence-category alignment validation in pipeline
- [ ]
**Objective:** Add a safety check in the pipeline that logs a warning when Judge output has misaligned confidence/category, BEFORE the gate overrides.
**Details:**
- Edit `src/orchestrator/pipeline.ts` — after receiving `rawVerdict` from Judge (line ~212), add a check:
  - If category is `likely-false` and confidence > 29, log warning: "Judge confidence/category mismatch — confidence {X} does not match likely-false range [0-29]. Gate will override."
  - Same for other mismatches
- This is diagnostic only — the gate still runs and overrides. But the log makes it visible when the Judge is confused.
- Extract this check into a helper function `detectConfidenceMismatch(verdict: FinalVerdict): boolean` in `src/formatter/confidence-gates.ts`
**Validation:**
- Test file: `tests/unit/formatter/confidence-gates.test.ts` — add test: `"detectConfidenceMismatch returns true for likely-false with confidence 97"`
- Test: `"detectConfidenceMismatch returns false for likely-false with confidence 15"`
- All existing tests pass

---

## Bug B2: Investigators Fail to Call submit_report Tool

### Root Cause
Pattern matching and domain expertise investigators sometimes exhaust their 4-turn limit doing searches without calling `submit_report`. The text-parse fallback tries `JSON.parse()` on non-JSON text and throws, causing the investigator to fail entirely.

**Evidence from logs:**
- "Pattern matching agent did not call submit_report, attempting text parse" → then fails
- "Domain expertise agent did not call submit_report, attempting text parse" → then fails
- "Investigator failed, continuing with remaining reports" (only 2 of 3 succeed)

### Task B2.1: Increase investigator max turns from 4 to 6
- [ ]
**Objective:** Give investigators more room to search AND submit their report, reducing submit_report failures.
**Details:**
- Edit `src/agents/investigators/source-verification-agent.ts` — change `MAX_TURNS` from 4 to 6
- Edit `src/agents/investigators/domain-expertise-agent.ts` — change `MAX_TURNS` from 4 to 6
- Edit `src/agents/investigators/pattern-matching-agent.ts` — change `MAX_TURNS` from 4 to 6
- Update system prompts: change "Exceed 4 search tool calls" to "Exceed 5 search tool calls" in the DO NOT section
**Validation:**
- All existing unit tests pass (mock-based, unaffected by turn limit change)
- `npx tsc --noEmit` passes

### Task B2.2: Improve submit_report fallback with retry
- [ ]
**Objective:** When an investigator doesn't call `submit_report`, instead of fragile JSON.parse, send a follow-up message asking the agent to call the tool.
**Details:**
- Create `src/agents/investigators/report-extractor.ts` — shared helper used by all 3 investigators
- Function `extractReport(result, agentRole, client, model, tools)`:
  1. Check if `submit_report` was called → return input directly
  2. If not, log warning and send a 1-turn follow-up: "You forgot to call submit_report. Please call it now with your findings." using the same agent context
  3. If follow-up also fails, try JSON.parse fallback on combined text
  4. If all fail, throw with descriptive error
- Update all 3 investigator files to use `extractReport()` instead of inline fallback logic
- This deduplicates the ~15 lines of fallback code currently copy-pasted across 3 files
**Validation:**
- Test file: `tests/unit/agents/investigators/report-extractor.test.ts`
- Test: `"should extract report from submit_report tool call"`
- Test: `"should retry when submit_report not called"`
- Test: `"should fall back to JSON parse when retry also fails"`
- Test: `"should throw when all extraction methods fail"`
- All existing investigator tests pass

---

## Bug B3: Investigator Failure Logs Don't Identify Which Agent Failed

### Root Cause
In `pipeline.ts` line 161, the error log says "Investigator failed, continuing with remaining reports" but doesn't say WHICH investigator failed. With 3 running in parallel, it's impossible to tell from logs.

### Task B3.1: Add investigator identity to failure logs
- [ ]
**Objective:** Log the investigator role name when an investigator fails in the pipeline.
**Details:**
- Edit `src/orchestrator/pipeline.ts` — in the `Promise.allSettled` result loop (lines 155-166):
  - Map each index to its role: `["source_verification", "domain_expertise", "pattern_matching"]`
  - Include the role in the error log: `logger.error({ error: result.reason, agent: roles[i] }, "Investigator failed...")`
- Also log which investigators succeeded: `logger.info({ successfulAgents: agentReports.map(r => r.agentRole) }, "Investigators completed")`
**Validation:**
- Test file: `tests/unit/orchestrator/pipeline.test.ts` — existing "should run investigators in parallel" test still passes
- Add test: `"should log which investigator failed by role name"` — mock one investigator to reject, verify the error includes agent role
- All existing tests pass

---

## Bug B4: Judge Summary Exceeds Zod maxLength and Kills Valid Verdict

### Root Cause
The `summary` field in the `submit_verdict` tool schema and the `FinalVerdictSchema` Zod schema has `maxLength: 300`. The Judge sometimes writes summaries longer than 300 characters (the Chandrayaan-3 verdict was ~310 chars), causing Zod validation to fail. The entire investigation (~$0.50 in API cost, ~4 minutes) is thrown away because of a string length limit.

**Evidence from logs:**
- Claim: "Chandrayaan-3 landed on the Moon's south pole" → Judge produced a correct `partially-true` at 78% → **Zod rejected**: `"Too big: expected string to have <=300 characters"`
- The Judge's verdict was excellent (identified geographic imprecision at 69°S vs 90°S) but was discarded

### Task B4.1: Increase summary maxLength and truncate gracefully
- [ ]
**Objective:** Prevent valid verdicts from being rejected over summary length. Increase the limit and add a truncation safety net.
**Details:**
- Edit `src/schemas/final-verdict.ts` — change `summary` maxLength from 300 to 500
- Edit `src/agents/judge-agent.ts` — update `SUBMIT_VERDICT_TOOL` schema: change `summary` maxLength from 300 to 500, update description to say "(max 500 chars)"
- Edit `src/agents/judge-agent.ts` — after extracting `verdictInput` from `submit_verdict` call (before Zod validation), add a truncation safety net:
  ```
  if (typeof verdictInput.summary === "string" && verdictInput.summary.length > 500) {
    verdictInput.summary = verdictInput.summary.substring(0, 497) + "...";
  }
  ```
- This ensures that even if the Judge writes a long summary, the verdict is not rejected
**Validation:**
- Test file: `tests/unit/agents/judge-agent.test.ts` — add test: `"should truncate summary longer than 500 chars instead of failing"`
- Test: `"should accept summary at exactly 500 chars"`
- Update existing tests that create FinalVerdict objects with summary length assertions
- All existing tests pass
- `npx tsc --noEmit` passes

---

## Dependency Graph

```
B1.1 (Fix Judge prompt)
  └─→ B1.2 (Add mismatch detection) ← depends on B1.1 being done first

B2.1 (Increase max turns) ← independent, can run first
  └─→ B2.2 (Report extractor with retry) ← depends on B2.1

B3.1 (Failure log identity) ← independent, can run anytime

B4.1 (Summary maxLength + truncation) ← independent, can run anytime
```

**Recommended order:** B1.1 → B4.1 → B1.2 → B2.1 → B2.2 → B3.1

(B4.1 is placed early because it's a quick fix that prevents wasted API spend.)

After all fixes, re-run `npx tsx scripts/seed-demo.ts` to verify:
- Claims get correct verdicts (likely-false stays likely-false)
- Chandrayaan-3 verdict is accepted (not rejected by Zod)
- All 3 investigators succeed (no submit_report failures)
- Failure logs name the specific agent that failed
