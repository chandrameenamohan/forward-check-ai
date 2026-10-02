---
id: dangerous-windows-reached
observable: the run really entered each fault window, so a PASS is not a quiet run
type: reachability
priority: P1
site: harness:finally_windows
evidence: deploy/antithesis/run.sh baseline
---

# dangerous-windows-reached

## Property

R1 the model was cut while an investigation was running. R2 the app was killed while an investigation was running. R3 search was cut while an investigator was searching. R4 the Graph API was cut while an answer was due. R5 the same message was delivered twice while its first delivery was running. R6 one investigator failed while another reported.

## Assertion

From the cues, the ledger and the model's log.
