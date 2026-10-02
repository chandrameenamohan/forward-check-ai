---
id: repeated-claim-reuses-verdict
observable: a claim someone already asked is answered from the cache, with no model call
type: sometimes
priority: P2
site: harness:finally_cache (SUT: src/services/claim-cache.ts)
evidence: tests/unit/services/claim-cache.test.ts
---

# repeated-claim-reuses-verdict

## Property

A second person sending the same text after its verdict gets the verdict, and the model is called no more for it.

## Assertion

Model calls for the claim's token are counted before and after the second delivery.
