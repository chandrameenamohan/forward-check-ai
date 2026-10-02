---
id: verdict-never-inverts-the-judge
observable: a claim the Judge called likely-false is never shown as likely-true, nor the reverse
type: always
priority: P0
site: harness:finally_verdicts (SUT: src/formatter/confidence-gates.ts)
guard: Sometimes("the confidence gate changed the category the Judge submitted")
guard_site: harness:finally_verdicts
evidence: tests/unit/formatter/confidence-gates.test.ts, tests/unit/formatter/confidence-gates-regression.test.ts
---

# verdict-never-inverts-the-judge

## Property

The stored verdict's category and the category the Judge submitted are never the two opposite poles. The gate may still move a verdict between neighbours, and turns a self-contradicting Judge (likely-false at 97) into unverified.

## Assertion

The scripted model logs what the Judge submitted; the row's final_verdict is what was stored.

## Vacuity guard

`Sometimes`: the confidence gate changed the category the Judge submitted. Without it the property can pass only because the dangerous moment never came.
