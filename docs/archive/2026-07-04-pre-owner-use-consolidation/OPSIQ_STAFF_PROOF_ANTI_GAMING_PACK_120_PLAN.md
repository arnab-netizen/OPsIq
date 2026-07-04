# OpsIQ Staff / Proof / Anti-Gaming Pack (120) — Plan

> Pack 2 of the known-to-unknown corpus expansion. Proves OpsIQ **detects, resists, escalates, and prevents
> unsafe reliance on** staff/proof/manipulation risks — via proof-quality checks, contradiction detection,
> owner/customer/vendor confirmation, reassessment, escalation, and local adjudicated learning. It does **not**
> claim staff fraud can be fully prevented. Owner Mode; minimum-code (data + pure expander + tests + specs)
> reusing the merged `business-reality-scenario` contract and the proven DB/browser path. No new engine.

## 1. Base HEAD
`a80783fb` (main; PR #66 merge — Unknown/OOD Pack 110). Baseline verified green: prisma ✓, tsc ✓, 353 non-DB
no-regression tests ✓, ratchet PASS (2155=2155). DB-180 / full-mobile-180 / OOD DB+browser baselines are
CI-gated (green on main via #66; local Neon infeasible).

## 2. Target pack
**Staff / Proof / Anti-Gaming — exactly 120 counted scenarios**, `scenarioPack = STAFF_PROOF_ANTI_GAMING`.

## 3. Why this pack is next
Highest safety value after Unknown/OOD: it extends the proof-fraud / manipulation coverage the runtime already
models via the `proof_fraud_block` dominant. Staff/proof/anti-gaming is the failure surface where a wrong
"verified/proceed" is most damaging, so it is the right second hardening pack.

## 4. Exact scenario taxonomy (12 subcategories × 10 = 120)
1. `fake_task_completion` — 10
2. `reused_stale_photo_proof` — 10
3. `staged_misleading_proof` — 10
4. `manager_rubber_stamping` — 10
5. `staff_manager_collusion` — 10
6. `delayed_after_the_fact_proof` — 10
7. `proof_contradiction_customer_vendor_system` — 10
8. `selective_reporting_omitted_bad_facts` — 10
9. `false_excuse_patterns` — 10
10. `task_splitting_metric_gaming` — 10
11. `workload_gaming_burden_shifting` — 10
12. `training_noncompliance_sop_drift` — 10

Each of the 120 is a distinct authored vignette (no filler), inherits a real source, and carries a
deterministic `seed` plan so the existing DB path resolves the intended disposition.

## 5. Source strategy
~24 privacy-clean `SourceRecord`s (`SRC-SPA-*`), validated by the existing `sourceRecordSchema`
(`privacyRisk:"low"`, `anonymizationStatus` no-PII/anonymized). Types: `staffing_ops`, `failure_postmortem`,
`review_complaint_pattern`, `sector_example`, `regulatory_summary`. Composite/sector sourcing (honest, not
fabricated); every scenario source-backed via `sourceRefs`. ≥1 source per subcategory.

## 6. Independent gold strategy
**12 independent gold** (`independentGold:true`), ≥1 per subcategory — the hardest/most-diagnostic case in
each family, authored independently of its disposition preset.

## 7. Expected action-status distribution (honest; dominated by proof-demand + escalation)
- `need_more_data` **50** — weak/stale/delayed/omitted proof → demand fresh/complete proof (never verifies).
- `owner_decision_required` **34** — rubber-stamp risk, collusion escalation, workload gaming, contradiction escalation.
- `blocked` **24** — confirmed proof-fraud / staged / fabricated / collusion-with-fraud (`proof_fraud_block`).
- `cautious_proceed` **8** — only where proof is *verified fresh* + owner SOP grant (medium risk), low manipulation.
- `proceed` **4** — fully verified proof + low-risk owner SOP grant (rare contrast cases).
All five statuses present; proceed/cautious rare and only on verified-good-proof (never on any fraud/high-risk case).

## 8. Expected proof-risk distribution (`expectedProofRiskState`)
New optional enum on the shared contract: `none | verified | weak | stale | delayed | unverified | staged |
contradictory | fabricated`. High-proof-risk = {`staged`,`contradictory`,`fabricated`} → schema-refined to
never proceed/cautious. Distribution skews to weak/stale/delayed/unverified (the demand-fresh-proof cases),
with staged/contradictory/fabricated on the blocked cases and verified/none on the proceed cases.

## 9. Expected manipulation-risk distribution (`expectedManipulationRiskState`)
New optional enum: `none | low | suspected | collusion_suspected | confirmed_pattern`. High-manipulation =
{`collusion_suspected`,`confirmed_pattern`} → schema-refined to never proceed/cautious. Collusion family →
`collusion_suspected`; confirmed fraud/fabrication → `confirmed_pattern`; excuse/gaming families → `suspected`;
verified cases → `none`/`low`.

## 10. Expected input-quality distribution (`expectedInputQualityState`)
Skews to `critical_missing` (fresh proof absent), `stale` (reused proof), `conflicting` (contradiction),
`data_limited` / `owner_estimate_only` (escalation), `sufficient` (verified proceed cases).

## 11. Expected DB proof strategy
Reuse `seedStaffProofScenario` = `seedScenarioBusiness` + `chaosScenarioToKnobs(seed.dominant)` (+ optional
`sopRiskClass` / `stripCriticalData`), exactly as the OOD pack. Dominant map: blocked→`proof_fraud_block`
(`proofDuplicate` knob), need_more_data→`profitable_growth`+`stripCriticalData`, owner_decision→
`owner_workload`/`below_margin`/`capacity_feasibility`/`cash_survival`, cautious/proceed→`profitable_growth`+
SOP grant. `[db]`-gated test seeds all 120 into isolated businesses, runs real `getOwnerWholeBusinessPlan`,
asserts status==expected, dominant==expected, fake/weak proof never verifies (need_more_data ⇒ not real-backed,
confidence≠high), high-risk/fraud/collusion never proceed, proof+reassessment present, cross-workspace
isolation. Writes `OPSIQ_STAFF_PROOF_ANTI_GAMING_PACK.run.json`.

## 12. Expected desktop proof strategy
`tests/browser/25-staff-proof-desktop.spec.ts` — real Chromium, 12 subcategory groups, renders the runtime-fed
Supervisor Summary from DB-backed data, asserts status label matches disposition, proof + reassessment visible,
advanced reasoning collapsed, and NO high-risk / professional-review / fraud / collusion case reads "Proceed".
Shardable. Target: all 120 (well above the 70/120 minimum). Writes `OPSIQ_STAFF_PROOF_ANTI_GAMING_DESKTOP.run.json`.

## 13. Expected mobile proof strategy
`tests/browser/26-staff-proof-mobile.spec.ts` — 375×812, all 120, no horizontal overflow, same safety
assertions. Target: all 120. Writes `OPSIQ_STAFF_PROOF_ANTI_GAMING_MOBILE.run.json`.

## 14. Proof-ledger strategy
The three run-ledgers (`*_PACK.run.json` DB, `*_DESKTOP.run.json`, `*_MOBILE.run.json`) are committed evidence
and asserted in CI (exact-120 coverage gate). Each records per-scenario pass/fail + failureReason + got-status;
0 unsafe, 0 skipped required for readiness.

## 15. CI strategy
New additive workflow `.github/workflows/staff-proof-anti-gaming.yml`: `spa-db` job (migrate deploy + schema
tests + all-120 DB proof + exact-120 ledger assertion + artifact) and `spa-browser` 2-shard matrix (build,
seed 120, desktop + mobile). Additive only — does NOT modify `unknown-ood.yml`, `chaos-exhaustive.yml`,
`owner-pilot-e2e`, or any existing lane.

## 16. No-regression strategy
Re-run prisma/tsc/eslint/ratchet + the full no-regression set (business-reality schema, OOD schema/DB/browser/
mobile, guardrail, shadow-pilot, exhaustive chaos DB, full-mobile, action-status policy, AI-supervisor,
owner-pilot, source/privacy, business-scope isolation, learning-governance/adjudication, max-reliability).
The two new schema fields are **optional** → all 290 existing scenarios stay valid (no regression).

## 17. What will NOT be claimed
- NOT "staff fraud fully prevented" — OpsIQ detects/resists/escalates/prevents-unsafe-reliance, not eliminates.
- NO live outcome / profit / public-SaaS claim (`liveOutcomeClaimAllowed=false` on all 120; no live data).
- NO global-learning promotion without adjudication (controlled learning stays workspace-scoped).
- NO new engine, parallel AI brain, AI autonomy, or duplicate engine.
- NO change to SaaS/billing/launch/marketing/Stripe/Lemon Squeezy/enterprise/external-integration surfaces.

## 18. Final classification gate
`STAFF_PROOF_ANTIGAMING_PACK_READY` only if all 120 schema+ledger-valid + DB-backed, all fraud/collusion/
fake-proof/high-risk pass desktop AND mobile and never proceed, ≥70 desktop + ≥70 mobile (target all 120),
fake completion never verifies, reused/stale never passes as fresh, rubber-stamp never overrides defects,
collusion requires independent verification, no fake confidence / generic advice / unsafe output / live claim /
un-adjudicated global learning, and no-regression green. Otherwise a lower classification is reported honestly.
