---
id: rate-limit-holds
observable: no address gets more than 10 chat claims accepted in a minute
type: always
priority: P1
site: harness:finally_rate_limit (SUT: src/server/middleware/rate-limit.ts)
guard: Sometimes("a chat claim was refused with 429")
guard_site: harness:parallel_driver_rate_limit (the burst container)
evidence: tests/unit/server/middleware/rate-limit.test.ts
---

# rate-limit-holds

## Property

For every source address, no 60 s window holds more than 10 answers of 201.

## Assertion

The ledger, per driver container.

## Vacuity guard

`Sometimes`: a chat claim was refused with 429. Without it the property can pass only because the dangerous moment never came.
