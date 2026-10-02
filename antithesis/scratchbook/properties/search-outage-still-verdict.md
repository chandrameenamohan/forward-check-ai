---
id: search-outage-still-verdict
observable: an investigation still reaches a verdict when every search fails
type: always
priority: P1
site: harness:finally_verdicts (SUT: src/tools/brave-search.ts, src/tools/google-factcheck.ts)
guard: Sometimes("an investigator's searches all came back empty")
guard_site: harness:finally_verdicts (the scripted investigator reports how many of its searches had results)
evidence: tests/unit/tools/brave-search.test.ts, tests/unit/tools/google-factcheck.test.ts
---

# search-outage-still-verdict

## Property

When an investigator's searches all returned nothing and the Judge was reached, the investigation is completed.

## Assertion

The scripted investigator counts the search results it was given; the row says how the investigation ended.

## Vacuity guard

`Sometimes`: an investigator's searches all came back empty. Without it the property can pass only because the dangerous moment never came.
