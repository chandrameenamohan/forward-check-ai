---
sut_path: forward-check-ai (this repository)
updated: 2026-10-02
external_references:
  - path: ARCHITECTURE.md, AGENTS.md
    why: the pipeline, its failure semantics and the known confidence-gate tension the P0s start from
  - path: https://github.com/antithesishq/antithesis-skills/tree/main/antithesis-research
    why: the format of this file and of properties/{slug}.md
  - path: /Users/cm/100x/personal/noon-antithesis-writeup.md
    why: the method (catalog first, hermetic slice, test template, prove the baseline, then attack)
---

# Property catalog: ForwardCheck-AI (claims, verdicts, webhooks, pages)

Eighteen properties: twelve `Always`, two `Unreachable`, two eventually checks, one `Sometimes`, one `Reachable`.
One file each under `properties/`, with the observable, the site, the evidence and the vacuity guard.
`tests/unit/antithesis/catalog.test.ts` fails when a file lacks one of those or disagrees with the harness's list
(`deploy/antithesis/driver/properties.ts`).

**Priority.** P0: a wrong verdict, a lost or duplicated investigation, or a forged message acted on. P1: a named
failure mode (a dependency down, a restart, a hostile input). P2: cost and quality.

**No SDK assertion is inside the app.** The image is unchanged, so every site is `harness:<command>`: the property
is asserted from the app's rows, pages and streams and from what the scripted model and the stubs were sent.

| Property | Type | Pri | What a user would see if it broke |
|---|---|---|---|
| accepted-claim-reaches-terminal-status | eventually | P0 | a claim that spins for ever |
| verdict-never-inverts-the-judge | always | P0 | a false claim shown as LIKELY TRUE |
| completed-investigation-is-whole | always | P0 | a "completed" verdict page with nothing on it |
| one-investigation-per-delivered-message | always | P0 | two investigations, two answers and twice the cost for one message |
| no-investigation-from-unsigned-webhook | unreachable | P0 | anyone on the internet making the bot message people |
| finished-verdict-survives-restart | always | P0 | a verdict link that stops working after a restart |
| signed-webhook-always-accepted | always | P1 | real WhatsApp messages silently dropped |
| server-answers-through-dependency-faults | always | P1 | the site down because a third party is |
| failed-investigation-tells-the-user | always | P1 | a failure that looks like waiting |
| search-outage-still-verdict | always | P1 | no verdict because search was down |
| partial-investigator-failure-still-verdict | always | P1 | one failed investigator losing the others' work |
| whatsapp-user-always-answered | eventually | P1 | a WhatsApp user who never hears back |
| stream-ends-like-the-database | always | P1 | a live page that disagrees with the verdict page |
| rate-limit-holds | always | P1 | one address running up the bill |
| user-markup-never-executes | always | P1 | a forwarded message running script in a reader's browser |
| no-loopback-fetch-from-user-url | unreachable | P1 | a link that makes the server read its own network |
| dangerous-windows-reached | reachability | P1 | (a run that proved nothing) |
| repeated-claim-reuses-verdict | sometimes | P2 | paying again for a claim already checked |

**Not in the catalog yet:** the Telegram path (long polling against `api.telegram.org`, not in the slice), the
feedback route and GitHub issues, and the Claude Agent SDK transport (the slice scripts the model at the Messages
API, which the app uses when `ANTHROPIC_API_KEY` is set).
