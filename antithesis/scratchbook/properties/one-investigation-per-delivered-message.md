---
id: one-investigation-per-delivered-message
observable: a WhatsApp message makes one investigation and one answer, however often Meta delivers its webhook
type: always
priority: P0
site: harness:finally_webhooks (SUT: src/platforms/message-router.ts)
guard: Sometimes("the same signed webhook was delivered a second time")
guard_site: harness:parallel_driver_duplicate_delivery
evidence: tests/unit/platforms/message-router.test.ts, tests/unit/db/investigation-repository.test.ts (hasPlatformMessage)
---

# one-investigation-per-delivered-message

## Property

Exactly one row carries a given platform message id. Meta redelivers when an acknowledgement was slow; each extra investigation costs a full pipeline run.

## Assertion

Rows are counted by platform_message_id for every message the driver delivered twice.

## Vacuity guard

`Sometimes`: the same signed webhook was delivered a second time. Without it the property can pass only because the dangerous moment never came.
