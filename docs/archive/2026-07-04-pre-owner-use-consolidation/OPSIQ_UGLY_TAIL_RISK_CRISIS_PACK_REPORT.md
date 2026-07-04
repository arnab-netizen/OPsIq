# OpsIQ Ugly / Tail-Risk / Crisis Pack (150) — Report

> Pack 9 of the known-to-unknown corpus. Proves OpsIQ handles the ugly / tail-risk / crisis end of business reality
> with RESTRAINT: in a cash-collapse / fraud / key-person-loss / major-customer-loss / supply shock / safety
> incident / lawsuit / reputational crisis / disaster / data breach, OpsIQ does NOT act rashly or autonomously. It
> BLOCKS unsafe/irreversible moves and legal/safety/insolvency boundaries (route to a professional / emergency
> response), OWNER-gates the material crisis response, asks for the missing facts (need_more_data), and allows only
> a routine, reversible, immediate-containment step to proceed. Confirmed fraud/theft is blocked. No new engine, no
> schema change, no live claim.

## 1. Branch
`claude/ugly-tail-risk-crisis-pack`

## 2. Base HEAD
`f30d5a34` (main; PR #73 merge — Local/Legal/Professional-Boundary Pack 100).

## 3. Scenario count
Minimum **150**; final **150** (10 subcategories × 15). No filler. `synthetic=false`, `countedForReadiness=true`,
`liveDataBacked=false` on all.

## 4. Source / gold count
**24** privacy-clean sources (`SRC-UTR-*`, `sourceRecordSchema`-valid, `privacyRisk` low, no PII); **10** independent
gold (≥1 per subcategory). Every scenario source-backed.

## 5. Taxonomy distribution (10 × 15)
cash_collapse_insolvency_risk 15 · fraud_theft_embezzlement 15 · key_person_loss_founder_dependency 15 ·
major_customer_loss_revenue_shock 15 · supply_chain_disruption_shortage 15 · safety_incident_injury 15 ·
legal_lawsuit_regulatory_action 15 · reputational_crisis_public_backlash 15 · natural_disaster_business_continuity 15 ·
data_breach_cyber_incident 15.

## 6. Action-status distribution (DB-resolved)
blocked **58** · owner_decision_required **46** · need_more_data **30** · cautious_proceed **12** · proceed **4**.
All five present and within the required ranges (proceed 0–5, cautious 5–15, need_more_data 20–45, owner 35–60,
blocked 45–80). The runtime resolved the intended disposition for all 150 (exact match to the authored plan). This
is the **most block-dominant** pack: blocked is the largest bucket, owner the second — crisis demands restraint.

## 7. Proof-risk / input-quality distribution
proofRisk: verified 16 (proceed/cautious) · weak (owner/need-data) · unverified 50 (professional-review-blocked) ·
staged 8 (confirmed fraud/theft). inputQuality skews conflicting (blocked), data_limited (owner), critical_missing
(need_more_data), sufficient (proceed).

## 8. DB proof count
**150 / 150** (`ugly-tail-risk-crisis-db.db.test.ts` → `OPSIQ_UGLY_TAIL_RISK_CRISIS_PACK.run.json`, real Postgres
16). Each resolves to its intended disposition; missing-facts → need_more_data (not real-provider-backed, confidence
≠ high); unsafe/legal/safety/insolvency boundary → blocked (professional-review-required); confirmed fraud → blocked
(proof_fraud); cross-workspace isolation proven.

## 9. Desktop / mobile proof
CI-gated (`ugly-tail-risk-crisis.yml → utr-browser`, 2 shards, all 150 desktop + mobile). Implemented specs 39/40.
NOT claimed proven until PR CI observes them green (not runnable in this session — harness terminates persistent servers).

## 10. Safety counters (all 0)
professional/legal/safety-boundary proceed **0** (all 50 professional-review cases blocked) · missing-facts proceed
**0** · high-risk/irreversible proceed **0** · confirmed-fraud/high-manipulation proceed **0** · policy violations
**0** · autonomous-crisis claim **0** · generic-advice **0** · unsafe-output **0** · live-outcome claim **0** ·
global-learning promotion **0**. Confirmed fraud/theft/embezzlement + insolvency/safety/breach boundaries are
blocked; OpsIQ never autonomously handles a high-risk crisis. Every scenario carries an "involve the relevant
professionals" note.

## 11. No-regression proof
prisma ✓ · tsc ✓ · eslint(changed) ✓ · ratchet PASS (2155=2155). Vitest: Crisis invariant (14) + Crisis DB 150/150
+ no-regression across prior packs (business-reality schema, LLB/CVM invariant + policy = 58 tests, LLB DB 100/100)
— all green. No schema change → all 1330 prior scenarios stay valid.

## 12. Module coverage matrix
`OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md` updated — cumulative **1480** counted scenarios. This pack brings
crisis/tail-risk (28) to full coverage, brings compliance/safety (27) to full coverage, and extends anti-gaming (19),
finance/cash-survival (20), and legal boundary (26).

## 13. Final classification
**`UGLY_TAIL_RISK_CRISIS_PACK_READY`** (pending PR CI observation of the desktop/mobile lanes, per the
DB_PROVEN→READY gate used by the prior packs) — 150 counted with real coverage, all schema+ledger-valid, all 150
DB-backed, all five statuses, block-dominant, every professional/legal/safety boundary blocked, confirmed fraud
blocked, no missing-facts / high-risk / autonomous-crisis proceeds, no generic advice / unsafe output / live claim,
prior packs green.

## 14. Extra-scenario accounting
Original minimum 150; final 150; **no extra scenarios** added (no filler; the required taxonomy is fully covered at
the minimum). CI impact: one additive workflow (`utr-db` + 2-shard `utr-browser`).

## 15. Limitations
- Desktop/mobile proof is CI-gated (harness cannot sustain a live server this session); the CI lane runs it.
- This pack proves OpsIQ handles crises with RESTRAINT (block/escalate/owner-gate); it explicitly does NOT and
  cannot autonomously resolve a high-risk crisis, and gives no final legal/insurance/safety/crisis advice.
- Proves crisis-handling SAFETY, not live crisis-outcome improvement (no live data).
- UTR need_more_data / proceed / cautious resolve dominant `profitable_growth` (arbitration under seeded knobs);
  the proven signal is the disposition (status + confidence + proof demand + owner-gate + block), not the dominant.
  OD/BL dominants (cash_survival / below_margin / capacity_feasibility / owner_workload / compliance_block /
  proof_fraud_block) are the DB-proven binding constraints for the material/blocked cases.

## 16. Next pack
Sequential Simulations Pack (≥50 multi-event simulations) — after this pack is merged and verified on main (Step 7
of the chain). Note: Step 7 introduces multi-event time-evolution simulations (a different artifact shape from the
single-scenario packs) and will require its own plan + schema/interface groundwork.
