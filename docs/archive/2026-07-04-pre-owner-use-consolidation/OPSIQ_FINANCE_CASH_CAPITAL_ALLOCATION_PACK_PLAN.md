# OpsIQ Finance / Cash / Capital Allocation Pack (120) — Plan

> Pack 4 of the known-to-unknown corpus. Proves OpsIQ protects cash, margin, payroll, debt obligations, capital
> allocation, and financial decision safety: it evaluates finance scenarios, **blocks unsafe financial decisions**,
> **owner-gates material decisions**, **requires missing data**, and allows only low-risk routine financial actions
> within approved thresholds. It does NOT give final investment / tax / legal / financing / accounting advice and
> does NOT claim live profit improvement. Owner Mode; minimum-code (data + pure expander + tests + specs) reusing
> the merged `business-reality-scenario` contract and the proven DB/browser seed path. No new engine, no schema change.

## 1. Base HEAD
`ea32e0bd` (main; PR #68 merge — Daily Operations Pack 300, `DAILY_OPERATIONS_PACK_READY_MERGED`). Corpus on main:
chaos 180 + OOD 110 + Staff/Proof 120 + Daily Ops 300 = 710 counted scenarios.

## 2. Why Finance/Cash is next
The corpus has proven routine ops, novelty/OOD, staff/proof fraud, and daily reality. Finance/cash is the failure
surface where a wrong "proceed" is most immediately destructive (missed payroll, blown runway, unaffordable capex,
margin leakage). This pack proves OpsIQ protects the money: cash-critical never proceeds, material calls owner-gate,
missing figures block the decision, and only routine within-threshold actions proceed.

## 3. Taxonomy (12 subcategories × 10 = 120 minimum)
1. `cash_runway_pressure` — 10
2. `payroll_staff_payment_pressure` — 10
3. `vendor_payment_prioritization` — 10
4. `delayed_receivables_b2b_credit_risk` — 10
5. `discount_vs_margin_decision` — 10
6. `capex_equipment_purchase` — 10
7. `debt_emi_financing_pressure` — 10
8. `emergency_reserve_buffer_decision` — 10
9. `owner_draw_cash_extraction` — 10
10. `pricing_margin_leakage` — 10
11. `tax_compliance_professional_boundary_finance` — 10
12. `profit_first_allocation_rule_decision` — 10

Target = the 120 minimum. Extra scenarios only if a distinct finance situation is uncovered (reported per the
scenario-count rule); no filler.

## 4. Source strategy
~24 privacy-clean `SourceRecord`s (`SRC-FIN-*`), `sourceRecordSchema`-valid (`privacyRisk=low`, no PII). Types:
`finance_example`, `gov_sme_guidance`, `sector_example`, `regulatory_summary`, `case_study`, `staffing_ops`. Every
scenario source-backed; ≥1 per subcategory.

## 5. Independent gold strategy
12 independent gold (`independentGold=true`), ≥1 per subcategory — the most diagnostic case in each family (the
cash-critical call that must owner-gate, the financing decision that must block to a professional, the discount
that leaks margin).

## 6. Action-status distribution target (within the required ranges)
proceed **7** (5–15) · cautious_proceed **~20** (10–25) · need_more_data **34** (25–45) · owner_decision_required
**42** (30–55) · blocked **~17** (15–35). Total 120. Finance skews to owner_decision + need_more_data (cash safety);
proceed is rare and only for routine within-threshold financial actions with verified data + owner/SOP grant.

## 7. Proof-risk distribution
Reuses the optional `expectedProofRiskState`: `verified` on proceed/cautious; `weak` on need_more_data/owner cases
(missing/limited financial data); `unverified` on compliance-blocked finance; `staged`/`contradictory` on the rare
financial-fraud blocked cases. High proof-risk → schema-refined to never proceed.

## 8. Input-quality distribution
Skews `critical_missing` (missing cash/margin/runway figures → need_more_data), `data_limited`/`owner_estimate_only`
(owner-decision cases), `conflicting` (fraud/contradiction), `sufficient` (the routine proceed cases).

## 9. Owner-workload distribution
Material finance calls (cash-critical, payroll, capex, financing, owner-draw) are `medium`/`high` owner-workload
(they are the owner's call); routine within-threshold actions are `low` (delegable with proof). Payroll pressure is
always owner-gated and never hidden.

## 10. DB proof strategy
Reuse `seedFinanceScenario` = `seedScenarioBusiness` + `chaosScenarioToKnobs(seed.dominant)` (+ optional
`sopRiskClass`/`stripCriticalData`). Dominant map: proceed → `profitable_growth`+SOP-low; cautious →
`profitable_growth`+SOP-medium; need_more_data → `profitable_growth`+`stripCriticalData`; owner_decision →
`cash_survival` (cash/payroll/reserve/owner-draw) / `below_margin` (discount/pricing/receivables) /
`capacity_feasibility` / `owner_workload`; blocked → `compliance_block` (tax/legal/financing/professional boundary,
professionalReviewRequired) / `proof_fraud_block` (financial fraud). All mappings already proven by OOD + Staff/Proof
+ Daily Ops DB tests. `[db]`-gated test seeds all 120 into isolated businesses, asserts status==expected +
dominant==expected, cash-critical never proceeds, missing-critical never proceeds, professional-boundary never
proceeds, proof + reassessment present, cross-workspace isolation. Writes `OPSIQ_FINANCE_CASH_PACK.run.json`.

## 11. Desktop proof strategy
`tests/browser/29-finance-desktop.spec.ts` — real Chromium, 12 subcategory groups, renders the runtime-fed
Supervisor Summary from DB-backed data, asserts status label matches disposition, proof + reassessment visible,
advanced reasoning collapsed, and NO high-risk / professional-review / compliance / fraud / cash-critical case reads
"Proceed". Shardable (`FIN_SHARD_INDEX`/`FIN_SHARD_TOTAL`). Target: all 120 (well above any minimum). Writes
`OPSIQ_FINANCE_CASH_DESKTOP.run.json`.

## 12. Mobile proof strategy
`tests/browser/30-finance-mobile.spec.ts` — 375×812, all 120, no horizontal overflow, same safety assertions.
Writes `OPSIQ_FINANCE_CASH_MOBILE.run.json`.

## 13. CI strategy
New additive workflow `.github/workflows/finance-cash.yml`: `fin-db` (migrate deploy + schema tests + all-120 DB
proof + exact-120 ledger assertion + artifact) + `fin-browser` 2-shard matrix (build, seed 120, desktop + mobile).
Additive only — does NOT modify any existing lane. Block-style artifact upload (avoids the YAML flow-map startup bug).

## 14. No-regression strategy
Re-run prisma/tsc/eslint/ratchet + the full no-regression set (business-reality schema, OOD/Staff-Proof/Daily-Ops DB,
guardrail, shadow-pilot, exhaustive-chaos DB 180, action-status policy, AI-supervisor, owner-pilot, source/privacy,
business-scope isolation, learning-governance, max-reliability). No schema change → all 710 prior scenarios stay valid.

## 15. Module coverage matrix
Create/update `OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md` after this pack, mapping the corpus against the 30
OpsIQ modules/domains (this pack adds finance/cash/capital-allocation, revenue/margin/profit, and
local/legal/professional-boundary-finance coverage).

## 16. What will NOT be claimed
- NO live profit / outcome improvement claim (`liveOutcomeClaimAllowed=false` on all 120; no live data).
- NO final investment / tax / legal / financing / accounting advice — professional-boundary finance cases block or
  owner/professional-gate.
- NO new engine, parallel AI brain, AI autonomy, duplicate engine, or gate weakening.
- NO SaaS/billing/launch/external-integration changes.
- `proceed`/`cautious_proceed` ONLY for routine, reversible, within-threshold financial actions with verified data +
  owner/SOP grant — never for cash-critical, missing-critical, debt/financing/tax/legal/compliance, or fraud cases.

## 17. Final classification gate
`FINANCE_CASH_CAPITAL_ALLOCATION_PACK_READY` only if ≥120 counted with real coverage, all schema+ledger-valid + DB-backed,
desktop+mobile risk proof green in CI, all five statuses covered, no cash-critical/critical-missing/professional-boundary
proceeds, no fake confidence/generic advice/unsafe output/live claim, prior packs green. Otherwise a lower classification
is reported honestly.
