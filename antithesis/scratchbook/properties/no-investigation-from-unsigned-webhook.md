---
id: no-investigation-from-unsigned-webhook
observable: a webhook with no signature or a wrong one is refused: it makes no investigation and no reply
type: unreachable
priority: P0
site: harness:finally_webhooks (SUT: src/platforms/whatsapp/webhook.ts)
guard: Sometimes("an unsigned and a wrongly signed webhook were refused with 403")
guard_site: harness:parallel_driver_webhook_signatures
evidence: tests/unit/platforms/whatsapp/webhook.test.ts, tests/unit/platforms/whatsapp/webhook-signature.test.ts
---

# no-investigation-from-unsigned-webhook

## Property

A forged webhook is answered 403, no row carries its claim, and the Graph API is sent nothing for its sender.

## Assertion

The ledger's forged entries against the rows and the Graph stub's log.

## Vacuity guard

`Sometimes`: an unsigned and a wrongly signed webhook were refused with 403. Without it the property can pass only because the dangerous moment never came.
