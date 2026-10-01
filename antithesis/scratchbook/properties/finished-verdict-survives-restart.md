---
id: finished-verdict-survives-restart
observable: a verdict that had completed before the app died is unchanged and served after it restarts
type: always
priority: P0
site: harness:finally_restart (SUT: src/db/connection.ts, WAL)
guard: Sometimes("the app was killed after a verdict had completed")
guard_site: harness:scene app-kill-open (the snapshot)
evidence: tests/unit/db/investigation-repository.test.ts
---

# finished-verdict-survives-restart

## Property

Every row that was completed at the kill is completed afterwards with the same final_verdict, and GET /v/:id is 200.

## Assertion

The scene snapshots completed rows before run.sh kills the container; the check compares after the restart.

## Vacuity guard

`Sometimes`: the app was killed after a verdict had completed. Without it the property can pass only because the dangerous moment never came.
