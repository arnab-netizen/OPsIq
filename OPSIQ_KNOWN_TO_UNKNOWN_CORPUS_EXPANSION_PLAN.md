# OpsIQ Known-to-Unknown Corpus Expansion Plan (180 → 1,250 + 50)

> The credible minimum corpus before a broad known-to-unknown readiness claim: **1,250 counted single-scenario
> cases + 50 sequential simulations**. This does NOT prove unknown-unknowns directly — it proves broad
> known-to-unknown coverage PLUS safe unknown-unknown *handling* (novelty → confidence↓ → escalate/block/proof/
> reassess/local-adjudicated-learning). No fabricated volume: every counted scenario is sourced, gold-anchored,
> and ledgered. The existing 180 (`BASELINE_CHAOS_CORPUS_V1`) is preserved and counts toward the total.

## 1. Growth path 180 → 1,250
Keep the 180 baseline. Add 10 packs (below) in **incremental PRs, one pack per PR**, each: sourced → schema-
valid → gold-anchored → DB-backed → risk-weighted desktop+mobile → ledgered → no-regression. The schema/ledger
contract shipped in THIS slice is the foundation; scenarios are added later, never faked to hit a number.

## 2. Pack-by-pack counts
| Pack | Count | Known→unknown emphasis |
|---|---|---|
| 1. Daily Operations | 300 | known + small-leak repetition |
| 2. Weekly Management / Trend | 150 | known + trend drift |
| 3. Growth / Profit / Scaling | 150 | known_unknown (fragile opportunity) |
| 4. Finance / Cash / Capital Allocation | 120 | known + known_unknown |
| 5. Staff / Proof / Anti-Gaming | 120 | known_unknown + adversarial |
| 6. Customer / Vendor / Market | 100 | known + pattern_adjacent_unknown |
| 7. Local / Legal / Professional Boundary | 100 | known_unknown + professional-review |
| 8. Ugly / Tail-Risk / Crisis | 150 | pattern_adjacent_unknown + shock |
| 9. Unknown / Novel / OOD | 110 | pattern_adjacent_unknown + unknown_unknown_guardrail |
| 10. Adversarial / LLM / Security | 50 | adversarial + unknown_unknown_guardrail |
| **Total new** | **1,070** | |
| + Baseline (V1) | 180 | |
| **Grand total** | **1,250** | |

## 3. Source strategy
Reuse the existing source-register discipline (privacy-clean `sourceRecordSchema`, no PII, reliability/
completeness tags). Each pack draws from real sector sources (SME finance literature, regulatory summaries,
review/complaint patterns, failure post-mortems, cyber/continuity examples). Target ≥120 unique sources across
the full corpus (26 today). Every counted scenario inherits ≥1 real `sourceRef`; synthetic edge cases are
labelled and NEVER counted.

## 4. Independent gold strategy
Keep the 15 hand-authored gold cases; add ≥1 independent gold per pack (≥25 total), expectation authored FIRST
and the engine asserted to agree independently (reduces circularity). Gold cases carry distinct new sources.

## 5. Synthetic / non-counted labelling
`synthetic: true` ⇒ `countedForReadiness: false`, enforced by schema refinement (a synthetic counted scenario
fails validation). Non-counted edge scenarios exist only to prove the gates reject them.

## 6. Scenario schema (this slice)
`src/domain/scenarios/business-reality-scenario.ts` — the 32-field contract (see §6 of the prompt), including
`scenarioPack`, `knownToUnknownTag` (known | known_unknown | pattern_adjacent_unknown | unknown_unknown_guardrail),
`highRisk`, `professionalReviewRequired`, `liveOutcomeClaimAllowed`, `expectedMobileFields`. Proven by lifting
all 180 existing scenarios into it.

## 7. Proof ledger schema (this slice)
`business-reality-ledger.ts` — per scenario: ownerRuntime/DB/desktop/mobile/inputQuality/boundary/novelty/
outcomeLoop/sourcePrivacy/businessScope/actionStatusPolicy/dashboard status + skipped + failureReason +
evidenceArtifactRef. The existing chaos run-ledgers remain the 180 evidence.

## 8. DB proof strategy
Each pack seeds isolated workspace+business per scenario (reuse `seedChaosScenario` shape / `chaosScenarioToKnobs`,
extended per pack) and runs the real `getOwnerWholeBusinessPlan`; assert dominant + action-status + isolation.

## 9. Desktop proof strategy
Risk-weighted: ALL high-risk / professional-review / OOD / adversarial scenarios render on desktop; lower-risk
packs sample-verified with a coverage assertion. (High-risk without proof ⇒ not risk-ready — enforced by schema test.)

## 10. Mobile proof strategy
Risk-weighted full mobile for high-risk/OOD/adversarial/boundary scenarios (the classes an owner most needs on
a phone). Baseline 180 already full-mobile.

## 11. Sequential simulation strategy
`sequential-simulation.ts` schema: simulationId, 7–30 ordered events, starting state, per-event expected
decision/proof/reassessment, expected actual-vs-expected outcome, expected learning/adjudication, owner-workload
change, final state. 50 sims: 10 normal-week, 10 slow-leak, 8 growth, 8 staff-gaming-over-time, 5 cash-crisis/
recovery, 4 customer/vendor-escalation, 3 owner-on-ship, 2 extreme-crisis. Each replays through the runtime with
time advanced deterministically (time passed via args — no `Date.now`).

## 12. CI sharding strategy
Extend `chaos-exhaustive.yml` matrix per pack (DB lane + risk-weighted browser/mobile shards). Schema/ledger
tests run in the standard vitest lane. A coverage assertion fails if a pack's counted count drops.

## 13. Cost/time estimate
~1,070 sourced scenarios + 50 sims is ~8–12 incremental PRs (1 pack/PR + 1 sims PR). Per pack: authoring +
schema-valid + gold + DB + risk-weighted browser/mobile + ledger ≈ one focused slice. This slice ships only the
audits + plan + contract (Scope A) — the highest-leverage, non-fabricated foundation.

## 14. Incremental PR slicing
1. (this slice) audits + expansion plan + schema/ledger contract + tests + full-mobile consolidation.
2. Unknown/OOD Pack (110). 3. Staff/Anti-Gaming Pack (120). 4. Daily Ops Pack (300, possibly split).
5. Finance Pack (120). 6. Boundary Pack (100). 7. Crisis Pack (150). 8. Weekly Pack (150). 9. Growth Pack (150).
10. Customer/Vendor Pack (100). 11. Adversarial/Security Pack (50). 12. Sequential simulations (50).

## 15. Classification gates
- This slice: `REAL_WORLD_READINESS_HARDENED_FULL_MOBILE_WITH_CORPUS_PLAN`.
- Per future pack: `UNKNOWN_OOD_PACK_READY` / `STAFF_ANTIGAMING_PACK_READY` / `DAILY_OPERATIONS_PACK_READY` …
- Full corpus (Scope C, all 1,250 + 50 proven): `BUSINESS_REALITY_KNOWN_TO_UNKNOWN_READY` — not before.
