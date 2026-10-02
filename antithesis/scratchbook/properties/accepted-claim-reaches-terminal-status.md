---
id: accepted-claim-reaches-terminal-status
observable: a claim the app accepted never stays pending or investigating for ever: it ends completed, completed_non_factual or failed
type: eventually
priority: P0
site: harness:eventually_claims_settle (SUT: src/orchestrator/pipeline.ts, src/server/routes/chat.ts, src/index.ts)
guard: Sometimes("an accepted claim was still running when a fault struck")
guard_site: harness:scenes.ts (each cue's inFlight)
evidence: tests/unit/db/investigation-repository.test.ts (failInterrupted), tests/unit/orchestrator/pipeline.test.ts (cached claim finishes the caller's row)
---

# accepted-claim-reaches-terminal-status

## Property

Every chat claim answered 201 and every signed WhatsApp text answered 200 has a row, and every such row reaches a terminal status within SETTLE_MS (45 s; 930 s for a frozen model) of the faults stopping.

## Assertion

The driver's ledger is joined to the app's SQLite rows: by id for the chat, by the claim's token for WhatsApp.

## Vacuity guard

`Sometimes`: an accepted claim was still running when a fault struck. Without it the property can pass only because the dangerous moment never came.
