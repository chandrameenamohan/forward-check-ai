---
id: stream-ends-like-the-database
observable: the live page is told the truth: its stream starts with pipeline:start and ends the way the row did
type: always
priority: P1
site: harness:finally_streams (SUT: src/orchestrator/pipeline-events.ts, src/server/routes/live-stream.ts)
guard: Sometimes("a client joined a stream after its investigation had started and was sent the history")
guard_site: harness:parallel_driver_late_joiner
evidence: tests/unit/server/routes/live-stream.test.ts, tests/integration/live-stream-integration.test.ts
---

# stream-ends-like-the-database

## Property

completed: exactly one pipeline:complete and no pipeline:error. failed: exactly one pipeline:error and no pipeline:complete. completed_non_factual: a non-factual classifier:complete and neither.

## Assertion

The stream's history is read for each terminal row made in the app's current life.

## Vacuity guard

`Sometimes`: a client joined a stream after its investigation had started and was sent the history. Without it the property can pass only because the dangerous moment never came.
