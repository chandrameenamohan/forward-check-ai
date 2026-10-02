---
id: failed-investigation-tells-the-user
observable: an investigation that failed says so: the live page's stream carries pipeline:error
type: always
priority: P1
site: harness:finally_streams (SUT: src/orchestrator/pipeline.ts)
guard: Sometimes("an investigation ended failed")
guard_site: harness:finally_streams
evidence: tests/unit/orchestrator/pipeline-events-integration.test.ts
---

# failed-investigation-tells-the-user

## Property

Every row with status failed, made in the app's current life, has pipeline:error in its stream's history.

## Assertion

The stream is read for each failed row.

## Vacuity guard

`Sometimes`: an investigation ended failed. Without it the property can pass only because the dangerous moment never came.
