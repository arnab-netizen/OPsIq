# Cockpit Explanation Safety Notes — PASS 31

The explanation layer turns the PASS 30 prioritisation output into a coherent owner-facing explanation. It re-derives nothing from raw text and inherits every upstream safety property.

1. **No raw text / PII / injection shown.** Every owner-facing string is built from governed fields (topics, tiers, routes, governed decisions). A Zod refinement rejects any explanation containing an email/phone/name, an injected instruction, or a fabricated financial figure (unit tests 14/15/16, DB tests 12+13).
2. **No fabricated certainty.** Public signals are labelled `unverified`; a confidence caveat states "public data is a signal, not verified fact; more signals raise validation urgency, not certainty; no financial result is implied and nothing has been executed yet" (unit test 17).
3. **No hidden score.** Priority is shown as a transparent tier (1–9) plus explicit `whyThisIsTopPriority` reasons; no field is an opaque numeric ranking (unit test 13).
4. **Verified vs unverified separated.** `verifiedFacts` only ever contains an official/published-requirement statement (never internal execution); `unverifiedSignals` states the public signals are not proof (unit test 3, DB test 4).
5. **Uncertainty and missing data explicit.** `missingData` lists what internal data is needed; `requiredEvidenceBeforeCompletion` states exactly what must be captured/proven (unit tests 4/9, DB test 7).
6. **Blockers explained.** `whyNotGrowthYet` states growth/scale is subordinated and blocked-before-proof; tender explanations state data-first + no auto-submit; contact stays draft-only/owner-gated (unit tests 5/6/7, DB test 9).
7. **Owner-gating explained.** When the top action is owner-gated, `ownerApprovalReason` is present (Zod fail-closed if missing) (unit tests 8/20, DB test 6).
8. **Nothing implied as executed.** Copy says the action is proposed and, after completion, a reassessment confirms it actually worked — never "this worked" without executed + outcome evidence (PASS 26 rule).
9. **No new cockpit / no new task system / no autonomy.** The layer only explains; the governed bridge remains the routing/gating authority.
10. **Fail-closed.** An incoherent explanation (top action without a reason, owner-gated without a reason, evidence route without evidence, high-risk route without blocked actions, PII/injection/fake-money) is rejected by the schema and never reaches the owner (unit tests 19/20).

**Clean / monitor-only:** a workspace with nothing actionable (clean, or only positive/monitor signals) yields a **null** explanation — nothing is fabricated (unit test 18, DB test 16).
