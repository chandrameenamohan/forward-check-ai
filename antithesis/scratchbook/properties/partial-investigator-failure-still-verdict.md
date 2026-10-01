---
id: partial-investigator-failure-still-verdict
observable: the reports of the investigators that finished are kept when another fails; when all three fail the investigation fails
type: always
priority: P1
site: harness:finally_verdicts (SUT: src/orchestrator/pipeline.ts runInvestigators)
guard: Sometimes("one investigator failed while another reported")
guard_site: harness:finally_verdicts
evidence: tests/unit/orchestrator/pipeline.test.ts (parallel investigator execution)
---

# partial-investigator-failure-still-verdict

## Property

agent_reports holds exactly the reports of the investigators that submitted. With none, the row is failed and holds no reports.

## Assertion

The claim's script says which investigators fail; the model's log says which submitted; the row says what was kept.

## Vacuity guard

`Sometimes`: one investigator failed while another reported. Without it the property can pass only because the dangerous moment never came.
