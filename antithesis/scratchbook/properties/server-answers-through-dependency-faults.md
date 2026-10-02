---
id: server-answers-through-dependency-faults
observable: the server keeps answering while the model, search or WhatsApp are down
type: always
priority: P1
site: harness:anytime_health (SUT: src/server/app.ts)
guard: Sometimes("the probe ran while a dependency was cut")
guard_site: harness:anytime_health (the fault-open flag)
evidence: tests/unit/server/app.test.ts
---

# server-answers-through-dependency-faults

## Property

/health answers 200 within 2 s whenever the app's container is running.

## Assertion

Probed every half second beside every fault; skipped only while the app itself is the victim.

## Vacuity guard

`Sometimes`: the probe ran while a dependency was cut. Without it the property can pass only because the dangerous moment never came.
