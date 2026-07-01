# OpsIQ Known-to-Unknown — Hostile Lacking Audit (30 areas)

Status codes: `already_proven_no_code_needed` · `partially_present_needs_tests` · `present_but_not_dashboard_visible` · `present_but_not_mobile_proven` · `present_but_not_DB_proven` · `real_gap_requires_minimal_code` · `out_of_scope_until_live_pilot`.

| # | Area | Status | Evidence / reason |
|---|---|---|---|
| 1 | Input quality & data sufficiency | already_proven_no_code_needed | default-on gate + confidence bands; tests `recommendation-input-quality(.gate)`. |
| 2 | Weak/stale/conflicting data behaviour | already_proven_no_code_needed | missing-critical⇒low; stale⇒≤medium; `novelty-training.test.ts`. |
| 3 | Next-best data request quality | already_proven_no_code_needed | ranked `nextBestInput`/`missingDataRequests`; `input-guidance.test.ts`. |
| 4 | Owner vs staff data responsibility | already_proven_no_code_needed | `action-assignment.ts` resolves ResponsibleParty; tests present. |
| 5 | Local/legal/professional boundary | already_proven_no_code_needed | 4-tier `compliance-boundary.ts`; `compliance-boundary.test.ts`. |
| 6 | Jurisdiction-specific uncertainty | already_proven_no_code_needed | `complianceUncertainty` ⇒ external-verification/professional-review path. |
| 7 | Novelty / OOD handling | already_proven_no_code_needed | missing-critical suppression + action-status; `novelty-training.test.ts`. |
| 8 | Closest-pattern reasoning / weak-analogy label | partially_present_needs_tests | supervisor surfaces assumptions + "estimate"; explicit analogy label is implicit. Covered by novelty tests; no new runtime. |
| 9 | Expected-vs-actual outcome | already_proven_no_code_needed | expected+actual+variance+reassessment; `outcome-verification`, `self-evaluation-loop`, `g4-outcome-tracker`. |
| 10 | Profit/cash/margin outcome proof | out_of_scope_until_live_pilot | needs live before/after; guardrail forbids claim. |
| 11 | Owner workload outcome proof | out_of_scope_until_live_pilot | needs live workload before/after. |
| 12 | Staff proof/anti-gaming linkage | already_proven_no_code_needed | proof lifecycle + duplicate⇒proof_fraud_block + fraud check. |
| 13 | Learning/adjudication linkage | already_proven_no_code_needed | `causal-adjudication.ts` + `controlled-learning.ts`; governance suite. |
| 14 | Daily operation coverage | real_gap (scenarios) | see coverage audit dim 1/2 — needs Daily Ops Pack (300). |
| 15 | Weekly trend coverage | real_gap (scenarios) | coverage dim 3 — Weekly Pack (150). |
| 16 | Growth/profit/scaling coverage | partially_present (scenarios) | coverage dim 4 — Growth Pack (150). |
| 17 | Finance/cash/capital-allocation coverage | real_gap (scenarios) | coverage dim 7 — Finance Pack (120). |
| 18 | Customer/vendor/market coverage | partially_present (scenarios) | coverage dim 9 — Customer/Vendor Pack (100). |
| 19 | Local/legal/professional-boundary scenario coverage | real_gap (scenarios) | coverage dim 10 — Boundary Pack (100). |
| 20 | Ugly/tail-risk/crisis coverage | partially_present (scenarios) | coverage dim 12 — Crisis Pack (150). |
| 21 | Unknown/novel/OOD scenario coverage | real_gap (scenarios) | coverage dim 19 — Unknown/OOD Pack (110). |
| 22 | Adversarial/LLM/security scenario coverage | real_gap (scenarios) | coverage dim 15 — Adversarial/Security Pack (50). |
| 23 | Sequential multi-day/week simulation coverage | real_gap (scenarios) | coverage dim 16 — 0 exist; 50 sequential sims. |
| 24 | Owner-unavailable/on-ship scenario coverage | real_gap (scenarios) | coverage dim 13/17 — mode exists, no pack. |
| 25 | 5-second dashboard clarity | already_proven_no_code_needed | SupervisorSummary; specs 18/20/22. |
| 26 | Mobile first-screen usability | already_proven_no_code_needed | full-mobile 180 + spec 18/20 no-overflow. |
| 27 | Readiness classification honesty | already_proven_no_code_needed | pilot-readiness-policy guardrail (9 tests) + gate-protection. |
| 28 | Live outcome proof limitation | out_of_scope_until_live_pilot | no live data; guardrail forbids. |
| 29 | Public SaaS readiness limitation | out_of_scope_until_live_pilot | needs live outcome + explicit go; guardrail blocks. |
| 30 | Full mobile chaos proof | already_proven_no_code_needed | **180/180 full mobile** (base branch). |

## Real gaps this slice closes with minimum code
The runtime areas (1–13, 25–30) are `already_proven`/`out_of_scope` — NOT rebuilt. The remaining gaps (14–24)
are **scenario-coverage** gaps: they need more sourced scenarios, not new engines. Building 1,250 scenarios now
would be fake volume, so this slice delivers the **typed scenario/ledger CONTRACT** that the packs will use
(schema with the known→unknown tag, per-scenario proof-layer ledger, anti-skip tests) + the audits + the
expansion plan. Future PRs add the packs one at a time (sourced, gold-anchored, DB+risk-weighted-browser/mobile).

## Rules honoured
- Nothing `already_proven_no_code_needed` is rebuilt. No duplicate engines. Scenario gaps are closed by
  data+contract+tests, not new runtime services. `out_of_scope_until_live_pilot` areas get the guardrail, not
  faked proof.
