# OpsIQ Unknown / Novel / OOD Pack (110) — Plan

> Pack 1 of the known-to-unknown corpus expansion. 110 counted, source-backed scenarios that prove OpsIQ
> SAFELY handles unknown/novel/out-of-distribution situations — it does NOT claim to solve unknown-unknowns.
> Owner Mode only. Reuses the merged `business-reality-scenario` contract, the proven DB seed path, and the
> existing runtime (novelty = missing-critical → confidence↓ → need_more_data / escalate / block). No new engine.

## 1. Base HEAD
`a28b3f68` (main, PR #65 merged — full-mobile 180 + guardrail + shadow-pilot + scenario/ledger contracts).

## 2. Target pack
`UNKNOWN_OOD` — exactly **110** counted scenarios.

## 3. Why Unknown/OOD is first
It is the highest-leverage safety pack: it directly exercises the claim that OpsIQ handles unknowns safely
(novelty → confidence↓ → closest-pattern → weak-analogy label → specific data request → block high-risk →
proof/reassessment → local adjudicated learning), and it stresses the guardrails hardest.

## 4. Exact scenario taxonomy (11 × 10 = 110)
unfamiliar_business_model 10 · new_service_category 10 · new_equipment_process 10 · new_jurisdiction_rule 10 ·
unusual_b2b_terms 10 · strange_customer_behavior 10 · unseen_staff_proof_manipulation 10 · unusual_vendor_supply 10 ·
sudden_external_shock 10 · contradictory_incomplete_urgent 10 · weak_analogy_pattern_adjacent 10.

## 5. Source strategy
A new privacy-clean OOD source register (`unknown-ood-sources.ts`, ~22 composite/sector sources: novel-model
post-mortems, regulatory grey-area summaries, supply-shock studies, fraud-pattern reports, etc.) validated by
the existing `sourceRecordSchema` (no PII, reliability/completeness tags). Every counted scenario inherits ≥1
real `sourceRef`; sources are reused across scenarios (as the baseline corpus reuses its 11 patterns) — this is
honest composite sourcing, not fabrication. Synthetic edge cases (if any) are labelled non-counted.

## 6. Independent gold strategy
≥11 independent-gold scenarios (≥1 per subcategory), expectation authored FIRST; a test asserts the engine
independently reaches the expected DB disposition (reduces circularity). Gold scenarios carry distinct sources.

## 7. Expected action-status distribution (DB-resolved, honest)
Dominated by **need_more_data** (novelty → missing critical data → ask for data): ~55. **blocked** (professional/
proof/compliance boundary): ~25. **owner_decision_required** (material unknown that binds a hard constraint): ~22.
**cautious_proceed** (reversible low/medium-risk novel + owner SOP): ~5. **proceed** (routine owner-approved
safe step): ~3. All five statuses present; proceed/cautious rare; high-risk never proceeds; missing-data never proceeds.

## 8. Expected novelty-state distribution
novel_high_risk ~50 (guardrail/block/owner-gate) · novel_low_risk ~40 (need_more_data/cautious) · known ~20
(closest-pattern strong analogy). Every counted scenario tags `knownToUnknownTag` ∈ {known_unknown,
pattern_adjacent_unknown, unknown_unknown_guardrail} (no pure `known`).

## 9. Expected professional-boundary distribution
safe_operational ~55 · needs_external_verification ~15 · owner_approval_required ~10 · professional_review_required ~18 ·
blocked_until_review ~12. professionalReviewRequired ⇒ never proceed/cautious (schema-enforced).

## 10. Expected input-quality distribution
critical_missing ~50 (drives need_more_data) · data_limited ~20 · owner_estimate_only ~15 · conflicting ~10 ·
sufficient ~15. Weak/missing inputs never yield high confidence.

## 11. DB proof strategy
Each scenario carries a `seed` plan (dominant + optional stripCriticalData/sopRiskClass). Seed one isolated
workspace+business per scenario via the proven `seedScenarioBusiness`; run the real `getOwnerWholeBusinessPlan`;
assert action-status == expected, and for need_more_data assert `criticalDomainsRealProviderBacked===false` +
confidence≠high; isolation asserted. All **110 DB-backed**.

## 12. Desktop proof strategy
Risk-weighted, but target ALL 110 desktop (feasible — desktop 180 ran in ~78s). Assert supervisor panel renders,
action-status + confidence + proof/reassessment + missing-data visible, advanced reasoning collapsed, no fatal
console errors, blocked/need_more_data never read as proceed. All high-risk/professional/guardrail scenarios MUST pass.

## 13. Mobile proof strategy
Risk-weighted, target ALL 110 mobile (375×812), no horizontal overflow. All high-risk/professional/guardrail +
every action-status present MUST pass mobile. Minimum 60/110; aim for 110/110.

## 14. Proof ledger strategy
Reuse `business-reality-ledger.ts` per-scenario record + a pack run-ledger JSON (DB/desktop/mobile status).
`isRiskReady` requires mobile proof for high-risk. skipped≠pass enforced.

## 15. CI strategy
Extend `chaos-exhaustive.yml` (or a new `unknown-ood.yml`) with: a DB-backed OOD-110 lane + a risk-weighted
desktop/mobile lane (sharded) + schema/ledger validation. Do NOT remove/weaken existing lanes.

## 16. No-regression strategy
Rerun the full gate set (§9 of the prompt): OOD schema/DB/browser, business-reality schema, guardrail,
shadow-pilot, exhaustive-db 180, full-mobile 180, action-status policy, AI supervisor, owner-pilot, source/
privacy, business-scope isolation, learning-governance, ratchet.

## 17. What will NOT be claimed
- OpsIQ does NOT solve unknown-unknowns — it manages them safely (guardrail behavior tested, not solution correctness).
- No live outcome / profit / public-SaaS claim (`liveOutcomeClaimAllowed=false` on all 110).
- No global learning promotion (local-only adjudicated candidates only).
- `UNKNOWN_OOD_PACK_READY` only if all §8 gate conditions hold; else an honest lower classification.
