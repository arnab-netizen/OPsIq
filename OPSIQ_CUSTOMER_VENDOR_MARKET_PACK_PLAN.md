# OpsIQ Customer / Vendor / Market Pack (100) — Plan

> Pack 7 of the known-to-unknown corpus (Step 4 of the Business Reality Corpus execution chain). Committed BEFORE
> implementation, per the chain's plan-first rule.

## 1. Purpose
Prove OpsIQ handles **customer, vendor, and market** decisions safely: routine in-policy customer/vendor handling
proceeds (with proof); a decision missing the customer/vendor/market figures blocks on data (need_more_data);
material relationship/contract/pricing calls are owner-gated; and moves that cross a consumer-law / contract-law /
anti-competitive boundary — or rest on a fraudulent refund/chargeback claim or a falsified vendor credential — are
blocked. Does NOT prove live outcome/retention improvement (no live data); no new engine; no schema change.

## 2. Branch & base
- Branch: `claude/customer-vendor-market-pack`
- Base: `main` @ `c160634e` (PR #71 merge — Growth/Profit/Scaling Pack 150). Confirmed present on main before branching.

## 3. Scenario count & taxonomy
Minimum **100**; final **100** = **10 subcategories × 10**. Every scenario is a distinct authored vignette
(no filler), source-backed, `synthetic=false`, `countedForReadiness=true`, `liveDataBacked=false`.

Subcategories (10 each):
1. `customer_complaint_resolution`
2. `customer_refund_dispute`
3. `key_customer_relationship_risk`
4. `customer_churn_winback`
5. `vendor_reliability_quality_issue`
6. `vendor_price_increase_negotiation`
7. `vendor_dependency_single_source_risk`
8. `new_vendor_onboarding_vetting`
9. `competitor_pricing_pressure`
10. `market_demand_shift_signal`

## 4. Action-status distribution (target ranges → planned)
| status | required range | planned |
|---|---|---|
| proceed | 10–25 | 15 |
| cautious_proceed | 20–40 | 28 |
| need_more_data | 20–40 | 27 |
| owner_decision_required | 20–40 | 22 |
| blocked | 5–25 | 8 |

Customer/vendor/market work is more routine than growth, so proceed/cautious carry more weight, owner-gate is
moderate (material relationship/contract calls), and blocked is low (consumer/contract/anti-competitive boundary or
fraudulent refund / falsified vendor credential).

Per-subcategory disposition mix (PR/CA/NF/OD/BL), each row = 10, columns hit the totals above:

| # | subcategory | PR | CA | NF | OD | BL |
|---|---|---|---|---|---|---|
| 1 | customer_complaint_resolution | 2 | 3 | 2 | 2 | 1 |
| 2 | customer_refund_dispute | 1 | 3 | 3 | 2 | 1 |
| 3 | key_customer_relationship_risk | 1 | 3 | 3 | 2 | 1 |
| 4 | customer_churn_winback | 2 | 3 | 3 | 2 | 0 |
| 5 | vendor_reliability_quality_issue | 1 | 3 | 2 | 2 | 2 |
| 6 | vendor_price_increase_negotiation | 2 | 3 | 3 | 2 | 0 |
| 7 | vendor_dependency_single_source_risk | 1 | 3 | 3 | 2 | 1 |
| 8 | new_vendor_onboarding_vetting | 2 | 3 | 2 | 2 | 1 |
| 9 | competitor_pricing_pressure | 2 | 2 | 3 | 2 | 1 |
| 10 | market_demand_shift_signal | 1 | 2 | 3 | 4 | 0 |

## 5. Mechanism (reuse the DB-proven seed path — NO new engine)
Pure data + a pure `expand()` over the merged `business-reality-scenario` contract, identical to the Daily
Operations / Finance / Weekly / Growth packs. Each disposition carries a deterministic `ScenarioSeedPlan` that the
existing `getOwnerWholeBusinessPlan` DB path resolves to the intended status:
- `PR` → seed `{ profitable_growth, good, sopRiskClass: low }` → **proceed**
- `CA` → seed `{ profitable_growth, good, sopRiskClass: medium }` → **cautious_proceed**
- `NF` → seed `{ profitable_growth, bad, stripCriticalData: true }` → **need_more_data**
- `OD` → seed `{ OD_DOMINANT[sub], bad }` → **owner_decision_required**
- `BL` → seed `{ BL_DOMINANT[sub], ugly }` → **blocked**

Per-subcategory binding constraints (all DB-proven by the Daily Operations / Finance / Weekly / Growth packs via
the same seed path; NO `customer_quality` dependency, so no reputation-metric seeding is required — the proven
signal is the disposition, per the prior packs' documented note):
- `OD_DOMINANT`: complaint/relationship → `owner_workload`; refund/churn/vendor-price/onboarding/competitor/market
  → `below_margin`; vendor-reliability/dependency → `capacity_feasibility`.
- `BL_DOMINANT`: refund-dispute + vendor-reliability → `proof_fraud_block` (fraudulent refund/chargeback,
  falsified vendor quality proof); all others → `compliance_block` (consumer-law / contract-law / anti-competitive
  boundary). Planned: 5 compliance blocks, 3 fraud blocks.

## 6. Sources & gold
~24 privacy-clean composite/sector sources (`SRC-CVM-*`, `sourceRecordSchema`-valid, `privacyRisk` low, no PII),
each subcategory + the routine/compliance/fraud boundaries backed. **10 independent gold** (≥1 per subcategory).
Every counted scenario source-backed.

## 7. Proof plan
- **Schema + invariant tests** (`customer-vendor-market-pack.test.ts`): count 100, 10×10, unique, schema-valid,
  source-backed, 24 sources privacy-clean, 10 gold, distribution within the required ranges, and hard safety rules
  (no decision proceeds while customer/vendor/market data is missing; professional-boundary/compliance never
  proceeds; fraudulent-claim/gamed cases never proceed; proceed/cautious only routine in-policy verified; no live claim).
- **DB proof** (`customer-vendor-market-db.db.test.ts`): all 100 seeded into isolated businesses, run through the
  REAL `getOwnerWholeBusinessPlan`; assert status + dominant + need_more_data provider-gate + safety + proof/
  reassessment; all five statuses present; cross-workspace isolation. Ledger → `OPSIQ_CUSTOMER_VENDOR_MARKET_PACK.run.json`.
- **Desktop + mobile Playwright** (`35-customer-vendor-desktop.spec.ts`, `36-customer-vendor-mobile.spec.ts`): all
  100 render the runtime-fed Supervisor Summary at desktop + mobile (375×812); status matches; no high-risk/
  compliance/fraud case reads "Proceed"; no horizontal overflow. Shardable via `CVM_SHARD_INDEX`/`CVM_SHARD_TOTAL`. CI-gated.
- **CI workflow** (`customer-vendor-market.yml`): `cvm-db` + 2-shard `cvm-browser`. Additive; modifies no existing lane.

## 8. Coverage matrix
Update `OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md`: cumulative 1130 → **1230** counted scenarios; this pack
brings **customer experience (22)**, **vendor/supply chain (23)**, and **market/competition (24)** to full coverage
and extends revenue/margin/profit (21), local/legal boundary (26), and compliance (27).

## 9. Hard rules honoured
No TODO/stub/placeholder. No business logic in UI. Reuses centralized runtime + policy. Additive schema-compatible
data only (no schema change → all 1130 prior scenarios stay valid). Every scenario reduces risk or improves proof
coverage. No fabricated volume, no filler, no weakened gate, no lowered threshold, no deleted test.

## 10. What this pack does NOT claim
- Does NOT prove live outcome/retention improvement (no live data; `liveOutcomeClaimAllowed=false` on all 100).
- Does NOT give final legal/consumer-law/contract advice — compliance-boundary cases block / professional-gate.
- Does NOT solve unknown-unknowns, unblock public SaaS, or make OpsIQ autonomous.
- The proven signal is the **disposition** (status + confidence + proof demand + owner-gate). Where a routine/
  need-data disposition resolves dominant `profitable_growth` under the seeded knobs, that is the documented
  arbitration behaviour (same as prior packs), not a claim about the case's root cause.

## 11. Merge gate
Merge only when: DB 100/100 green in CI, desktop+mobile shards green, ALL prior lanes green (no regression),
ratchet unchanged, and a final read-only hostile audit passes. Classification target on merge:
`CUSTOMER_VENDOR_MARKET_PACK_READY`.
