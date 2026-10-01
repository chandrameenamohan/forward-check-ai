---
id: completed-investigation-is-whole
observable: a completed investigation has a valid verdict, a completion time, at least one investigator report, and a verdict page that shows it
type: always
priority: P0
site: harness:finally_verdicts (SUT: src/orchestrator/pipeline.ts, src/server/routes/verdict.ts)
guard: Sometimes("an investigation that was running when a fault struck went on to complete")
guard_site: harness:finally_verdicts (a cue's inFlight id, now completed)
evidence: tests/unit/orchestrator/pipeline.test.ts, tests/unit/server/views/verdict-render.test.ts
---

# completed-investigation-is-whole

## Property

status = completed implies: final_verdict parses with a known category, a numeric confidence and a summary; completed_at is set; agent_reports is not empty; GET /v/:id is 200 and shows the verdict.

## Assertion

Read from the row and from the page.

## Vacuity guard

`Sometimes`: an investigation that was running when a fault struck went on to complete. Without it the property can pass only because the dangerous moment never came.
