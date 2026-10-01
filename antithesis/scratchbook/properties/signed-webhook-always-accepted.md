---
id: signed-webhook-always-accepted
observable: a correctly signed webhook is accepted whatever the spelling of its JSON
type: always
priority: P1
site: harness:finally_webhooks (SUT: src/server/app.ts, the raw body kept for the signature)
guard: Sometimes("a signed webhook whose bytes are not what JSON.stringify would write was delivered")
guard_site: harness:parallel_driver_webhook_signatures
evidence: tests/unit/server/app-whatsapp.test.ts
---

# signed-webhook-always-accepted

## Property

The signature is checked over the bytes Meta sent. Meta escapes slashes and non-ASCII characters, so a check over a re-serialised body refuses real messages.

## Assertion

The driver signs a payload spelled Meta's way and records the answer.

## Vacuity guard

`Sometimes`: a signed webhook whose bytes are not what JSON.stringify would write was delivered. Without it the property can pass only because the dangerous moment never came.
