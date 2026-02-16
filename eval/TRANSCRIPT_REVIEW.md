# ForwardCheck-AI — Transcript Review (5-Claim Initial Eval)

Run date: 2026-02-17
Mode: mock | Claims: 5 | Total cost: $2.31

Harm-Weighted Accuracy: 71.1% | Exact Match: 60% | Acceptable Match: 60%
Coverage: 98.5 avg | Must-Find Hit Rate: 100%

---

## Claim: false-001 — PM Modi Rs 5000

**Expected:** likely-false | **Got:** likely-false | **Confidence:** 3%
**Result: PASS**

**Strategist:** Excellent. Correctly identified as viral_forward with suspected fabrication pattern. Generated 12 targeted queries across three investigator tracks (source verification, domain expertise, pattern matching). Falsification criteria were crisp and specific — e.g., "PIB press release or gazette notification" for true, "PIB Fact Check debunking" for false. The pre-investigation fiscal plausibility note (~Rs 7 lakh crore cost) was a strong analytical addition.

**Investigators:** All three converged on "contradicted" at 95-98% confidence. Source verification found PIB Fact Check debunk, AltNews, BoomLive, and Snopes. Domain expertise added fiscal implausibility analysis and PM-KISAN context. Pattern matching identified the zombie claim lineage (recurring since 2020) and election-timing exploitation. Coverage was perfect: 5 sources, 5 unique domains, both must-find URLs hit.

**DA:** Genuine and substantive. Raised four challenges: (1) investigators cited PIB debunks without specific URLs/dates for the March 2024 variant, (2) a PM-KISAN installment release event could have seeded the misinformation, (3) AltNews/BoomLive debunk dates were asserted without evidence, (4) election-timing argument cuts both ways. All were self-assessed as minor. The DA correctly concluded its counter-argument failed entirely.

**Judge:** Reasoning is thorough and well-grounded. Correctly mapped all three false-proving falsification criteria to confirmed evidence. The confidence of 3% (very low = very false) is appropriate. The nuanceTag "fabricated" is accurate.

**Issue:** None. This is the pipeline working as designed.

**Fix:** None needed.

---

## Claim: false-003 — 5G Causes COVID (WHO)

**Expected:** likely-false | **Got:** likely-false | **Confidence:** 2%
**Result: PASS**

**Strategist:** Strong. Correctly identified the "authority impersonation" pattern — someone falsely attributing a position to WHO that is the exact opposite of their actual stance. Queries targeted WHO's own myth-busters page, ICNIRP guidelines, and fact-checker databases. The falsification criteria were well-constructed, with "WHO retraction of myth-busters page" as the (impossible) bar for proving true.

**Investigators:** All three returned 100% confidence — the maximum. Source verification found WHO's myth-busters page, PolitiFact (Pants on Fire), Full Fact, and BBC Reality Check. Domain expertise added ICNIRP review and the biological impossibility argument (non-ionizing radiation cannot create/transmit viruses). Pattern matching identified the 2020 origin, arson attacks on UK cell towers, and the escalation pattern of adding fake WHO attribution.

**DA:** Genuine but necessarily weak given the overwhelming evidence. Three minor challenges: (1) no direct URL to WHO myth-busters page in citations, (2) retracted Fioranelli et al. 2020 paper technically existed, (3) could be innocent misunderstanding. The DA itself called all three "extremely weak." This is appropriate — for a slam-dunk false claim, the DA cannot manufacture real doubt.

**Judge:** Rock-solid. The confidence of 2% (extreme false) correctly reflects that this is perhaps the most clear-cut misinformation case possible — WHO's actual position is the 180-degree opposite of the claim. Reasoning is grounded in primary sources. The "Conspiracy Theory Escalation" manipulation technique identification is insightful.

**Issue:** None.

**Fix:** None needed.

---

## Claim: true-001 — Chandrayaan-3 Moon Landing

**Expected:** likely-true | **Got:** likely-true | **Confidence:** 96%
**Result: PASS**

**Strategist:** Thoughtful. Rather than assuming a true claim is trivially true, the strategist flagged the "south pole region" terminology as a potential exaggeration point and directed investigators to verify whether ~69.37 S latitude genuinely qualifies. This is exactly the kind of critical scrutiny a fact-checker should apply even to likely-true claims.

**Investigators:** All converged on "supported" at 95-98% confidence. Source verification found ISRO official page, NASA congratulatory statement, Reuters, and BBC. Domain expertise provided the key nuance: the landing site at 69.37 S is in the "south polar region" per the >60 latitude convention, though it is ~630 km from the actual pole. Pattern matching confirmed zero existing debunks in any fact-checker database.

**DA:** The most interesting DA performance in this eval. Raised a genuinely substantive challenge about whether "south pole region" is generous terminology for 69.37 S, noting that some planetary scientists use an 80 S threshold. Also caught that investigators cited NASA diplomatic statements rather than the actual LRO imagery (which does exist but was not directly referenced). Both are real methodological observations. The DA correctly concluded they do not undermine the verdict since the claim says "region" and ISRO/NASA both use this terminology. Suggested confidence adjustment: -2 points.

**Judge:** Appropriately confident at 96%. The reasoning acknowledges the south pole terminology nuance while correctly concluding that "south pole region" is the standard accepted description used by ISRO, NASA, BBC, and Reuters. The -2 adjustment from the DA was applied. Good calibration.

**Issue:** None.

**Fix:** None needed.

---

## Claim: partial-001 — Harvard Chocolate Heart Disease

**Expected:** partially-true | **Got:** likely-false | **Confidence:** 8%
**Result: FAILURE**

This is the most important failure to analyze. The pipeline found all the right evidence but reached the wrong conclusion because it lacks a "partially-true" reasoning pathway.

**Strategist:** Good setup. Correctly identified the claim as "scientific_claim" with suspected "exaggeration" pattern. The queries targeted the COSMOS trial, and the falsification criteria correctly distinguished between supplements vs. chocolate and prevention vs. risk reduction. The strategist even noted that the absolute language ("proved," "prevents") was a red flag for exaggeration. However, the strategist framed this as a binary true/false investigation rather than guiding investigators to quantify the "kernel of truth."

**Investigators:** This is where the failure originates. All three assessed the sub-claim "eating chocolate prevents heart disease" as "contradicted" rather than recognizing the compound structure: (a) a Harvard study exists about cocoa and heart health (TRUE), (b) it used supplements not chocolate (misrepresented), (c) it found risk reduction not prevention (exaggerated), (d) "proved" overstates the certainty (exaggerated). The source_verification agent did note one finding as "mixed" (the Harvard study existing), but then its overall assessment was "MISLEADING" — a word that maps to "partially-true" in a well-calibrated system, yet the agent rated its confidence at 97% that the claim was contradicted. All three investigators used language like "misleading," "misrepresents," and "exaggerated" — words that should signal partially-true — but their binary assessment framework forced them into "contradicted."

**DA:** Actually the best DA performance in the run. Raised a moderate-severity challenge that the source_verification agent incorrectly called the COSMOS trial "associational" when it was actually an RCT (which establishes causation). Also noted that EFSA approved a health claim for 200mg/day cocoa flavanols, narrowing the supplement-chocolate gap. And flagged that the "zombie claim" framing undersells the genuine scientific merit of the COSMOS trial (21,000+ participant RCT). All valid. But the DA still concluded the counter-argument "failed" — because it was evaluating whether the claim is literally true, not whether it is partially true.

**Judge:** The reasoning is detailed, well-sourced, and internally consistent. The problem is that it asked the wrong question. The judge evaluated "is it true that chocolate prevents heart disease?" (answer: no) instead of "does this claim contain a kernel of truth that was exaggerated?" (answer: yes). The nuanceTag was correctly set to "exaggerated" — which implicitly acknowledges partial truth — but the category was "likely-false" instead of "partially-true." The confidence of 8% treats this as almost completely false, ignoring that the COSMOS trial is real, rigorous, and did find cardiovascular benefits from cocoa-derived compounds.

**Issue:** The judge prompt has no reasoning pathway for "partially-true." When investigators unanimously say "contradicted" and the DA says "counter-argument failed," the judge has no signal to reach a split verdict. The nuanceTag "exaggerated" is a downstream signal that partial truth exists, but it does not feed back into category selection. The entire pipeline treats each claim as binary (true or false) rather than having a structured way to decompose a claim into its true kernel and its exaggerated shell.

**Fix:** Two changes needed:

1. **Investigator prompt** — Add explicit instruction: "For claims flagged as suspected 'exaggeration' by the Strategist, decompose the claim into its factual kernel and its exaggerated additions. Assess each component separately. Use 'mixed' assessment when the kernel is supported but the framing overstates it. Do NOT use 'contradicted' when the claim is an exaggeration of real research — use 'mixed' and explain what is true vs. what is overstated."

2. **Judge prompt** — Add a partially-true reasoning pathway: "When investigators identify a claim as 'exaggerated' or 'mixed,' or when the nuanceTag is 'exaggerated' or 'misleading,' consider whether the claim is best categorized as 'partially-true' rather than 'likely-false.' A claim built on real research that overstates the findings is partially-true, not likely-false. Reserve 'likely-false' for claims with no factual basis (fabricated) or where the kernel of truth is negligible."

---

## Claim: adversarial-001 — "BREAKING: The president just announced..."

**Expected:** unverified | **Got:** [short-circuited as "other"] | **Confidence:** N/A
**Result: FAILURE**

The claim was never investigated. The classifier killed it at the gate.

**Strategist:** Never invoked. The classifier returned category "other" before the pipeline reached the strategist.

**Investigators:** Never invoked. Cost was $0.001 (classifier only) vs. ~$0.55-0.61 for investigated claims.

**DA:** Never invoked.

**Judge:** Never invoked. The pipeline returned a canned non-factual response: "I wasn't able to identify a specific factual claim in that message."

**Issue:** The classifier prompt treats vague/incomplete claims as "other" instead of "factual_claim." Its reasoning was: "The message is incomplete and does not contain a specific, verifiable factual claim." This is technically correct — the message IS incomplete — but the expected behavior per the eval dataset is to classify it as "factual_claim" and let the investigation pipeline handle it, ultimately returning "unverified" because no specific claim can be verified or falsified.

The eval dataset definition says: `expectedClassifierRoute: "factual_claim"` and `notes: "Vague, no falsifiable claim. Pipeline should recognize insufficient information."` This means the classifier should let it through, and the judge should be the one to say "unverified" — not the classifier short-circuiting to "other."

The core tension: the classifier is being too smart. It correctly identifies that "BREAKING: The president just announced..." is not a complete factual claim, but by short-circuiting it, the pipeline loses the ability to return a proper "unverified" verdict with an explanation. The user who forwarded this message gets a generic "I can't identify a claim" response instead of a substantive "This message is too vague to verify — it contains no specific claim. Be suspicious of messages that use urgency language ('BREAKING') without providing details."

**Fix:** Modify the **classifier prompt** to add a rule: "If the message uses news/urgency framing (e.g., 'BREAKING', 'JUST IN', 'URGENT') but lacks a specific claim, classify as 'factual_claim' with extractedClaim set to the full text and a note that the claim is vague/incomplete. Do NOT classify these as 'other' — they are likely truncated forwards that deserve investigation, even if the investigation concludes the claim is unverifiable." This would let the pipeline produce a much more useful "unverified" verdict with context about the urgency-framing manipulation tactic.

---

## Top 3 Actionable Prompt Fixes

### 1. Add "partially-true" reasoning pathway to Investigator + Judge prompts

**Problem:** partial-001 ("Harvard chocolate") was rated "likely-false" instead of "partially-true" because investigators used a binary contradicted/supported framework. They correctly identified all evidence but had no way to express "the kernel is true, the framing is exaggerated."

**Fix (Investigator prompt):** When the Strategist flags a claim as suspected "exaggeration," instruct investigators to decompose the claim into its factual kernel and exaggerated framing. Replace binary "contradicted"/"supported" with a three-way assessment: "supported," "mixed" (kernel true, framing overstated), "contradicted" (no factual basis). Require investigators to explicitly state what is true and what is exaggerated when using "mixed."

**Fix (Judge prompt):** Add a decision branch: "If investigators assess 'mixed' or the nuanceTag is 'exaggerated'/'misleading,' default to 'partially-true' unless the kernel of truth is negligible. A claim that exaggerates real peer-reviewed research from a named institution is partially-true, not likely-false."

**Claims affected:** partial-001, and likely partial-002 and partial-003 when they run.

### 2. Reclassify urgency-framed vague messages as "factual_claim" in the Classifier

**Problem:** adversarial-001 ("BREAKING: The president just announced...") was classified as "other" and short-circuited, returning a generic non-factual response instead of an "unverified" verdict with useful context.

**Fix (Classifier prompt):** Add rule: "Messages using news/urgency framing ('BREAKING', 'JUST IN', 'URGENT', 'DEVELOPING') should be classified as 'factual_claim' even if the specific claim is vague or incomplete. These are likely truncated forwards and should enter the investigation pipeline so the judge can return a substantive 'unverified' verdict explaining WHY the claim cannot be verified, rather than a generic 'no claim found' response."

**Claims affected:** adversarial-001, plus the common real-world case of users forwarding incomplete breaking-news messages.

### 3. Strengthen DA challenge calibration for "exaggeration" claims

**Problem:** The DA on partial-001 raised genuinely strong challenges (RCT establishes causation, EFSA approved flavanol health claims, COSMOS was a rigorous 21,000-participant trial) but still concluded "counter-argument failed." This is because the DA evaluates whether the claim is literally true, not whether partial truth exists. The DA's own findings should have tipped the pipeline toward "partially-true."

**Fix (DA prompt):** Add instruction: "For claims flagged as 'exaggeration,' your job is not just to attack the investigators' conclusion but also to assess whether the investigators adequately weighed the kernel of truth. If you find evidence that the underlying research is more rigorous or the truth-kernel more substantial than investigators acknowledged, flag this as a 'partial truth underweighted' concern and set counterArgumentSucceeded to true with a note recommending 'partially-true' rather than 'likely-false.'"

**Claims affected:** partial-001, and any future exaggeration-pattern claims.
