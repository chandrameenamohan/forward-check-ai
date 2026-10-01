---
id: whatsapp-user-always-answered
observable: a WhatsApp user who sent a claim always gets a final answer: a verdict, a redirect or an apology
type: eventually
priority: P1
site: harness:eventually_whatsapp_answered (SUT: src/platforms/whatsapp/client.ts, src/index.ts)
guard: Sometimes("the Graph API was cut while an answer was due")
guard_site: harness:scene graph-unavailable
evidence: tests/unit/platforms/whatsapp/client.test.ts (retry)
---

# whatsapp-user-always-answered

## Property

Every signed text message's sender is sent a message that is not a welcome, a progress line or a link button, within SETTLE_MS of the faults stopping.

## Assertion

The Graph stub's log, by recipient.

## Vacuity guard

`Sometimes`: the Graph API was cut while an answer was due. Without it the property can pass only because the dangerous moment never came.
