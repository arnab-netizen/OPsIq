# OpsIQ Growth / Profit / Scaling Pack (150) — Plan

> Pack 6 of the known-to-unknown corpus (Step 3 of the Business Reality Corpus execution chain). Committed BEFORE
> implementation, per the chain's plan-first rule.

## 1. Purpose
Prove OpsIQ handles **growth / profit / scaling** decisions WITHOUT reckless expansion: a scaling move is
material and reversible-only-at-cost, so it is owner-gated by default; a growth decision missing its ROI /
capacity / margin / cash figures blocks on data (need_more_data); expansion that crosses a licensing / labour /
consumer-law / franchise-disclosure boundary or rests on gamed growth numbers is blocked; and ONLY a small,
proven, within-capacity, capped pilot with verified data + an owner/SOP grant proceeds. Does NOT prove live
profit/outcome improvement (no live data); no new engine; no schema change.

## 2. Branch & base
- Branch: `claude/growth-profit-scaling-pack`
- Base: `main` @ `30cc82a5` (PR #70 merge — Weekly Management/Trend Pack 150). Confirmed present on main before branching.

## 3. Scenario count & taxonomy
Minimum **150**; final **150** = **10 subcategories × 15**. Every scenario is a distinct authored vignette
(no filler), source-backed, `synthetic=false`, `countedForReadiness=true`, `liveDataBacked=false`.

Subcategories (15 each):
1. `new_location_branch_expansion`
2. `hiring_team_scaling`
3. `new_product_service_line`
4. `capacity_expansion_investment`
5. `market_geographic_expansion`
6. `price_increase_for_profit`
7. `profit_margin_improvement_initiative`
8. `large_contract_bulk_order_scaling`
9. `marketing_channel_scale_up`
10. `partnership_franchise_scaling`

## 4. Action-status distribution (target ranges → planned)
| status | required range | planned |
|---|---|---|
| proceed | 10–30 | 18 |
| cautious_proceed | 25–50 | 34 |
| need_more_data | 30–55 | 40 |
| owner_decision_required | 35–65 | 45 |
| blocked | 10–30 | 13 |

Growth/scaling skews to **owner_decision** (scaling is a material, capital/capacity/commitment call the owner
must make) and **need_more_data** (a growth move needs its ROI/capacity/margin/cash figures first). `proceed`/
`cautious` only on small, capped, reversible, within-capacity pilots with verified data + an owner/SOP grant.

Per-subcategory disposition mix (PR/CA/NF/OD/BL), each row = 15, columns hit the totals above:

| # | subcategory | PR | CA | NF | OD | BL |
|---|---|---|---|---|---|---|
| 1 | new_location_branch_expansion | 1 | 3 | 4 | 5 | 2 |
| 2 | hiring_team_scaling | 2 | 4 | 4 | 4 | 1 |
| 3 | new_product_service_line | 2 | 3 | 4 | 5 | 1 |
| 4 | capacity_expansion_investment | 1 | 3 | 4 | 5 | 2 |
| 5 | market_geographic_expansion | 1 | 3 | 4 | 5 | 2 |
| 6 | price_increase_for_profit | 2 | 4 | 4 | 4 | 1 |
| 7 | profit_margin_improvement_initiative | 3 | 4 | 4 | 3 | 1 |
| 8 | large_contract_bulk_order_scaling | 2 | 3 | 4 | 5 | 1 |
| 9 | marketing_channel_scale_up | 2 | 4 | 4 | 4 | 1 |
| 10 | partnership_franchise_scaling | 2 | 3 | 4 | 5 | 1 |

## 5. Mechanism (reuse the DB-proven seed path — NO new engine)
Pure data + a pure `expand()` over the merged `business-reality-scenario` contract, identical to the Daily
Operations / Finance / Weekly packs. Each disposition carries a deterministic `ScenarioSeedPlan` that the existing
`getOwnerWholeBusinessPlan` DB path resolves to the intended status:
- `PR` → seed `{ profitable_growth, good, sopRiskClass: low }` → **proceed**
- `CA` → seed `{ profitable_growth, good, sopRiskClass: medium }` → **cautious_proceed**
- `NF` → seed `{ profitable_growth, bad, stripCriticalData: true }` → **need_more_data**
- `OD` → seed `{ OD_DOMINANT[sub], bad }` → **owner_decision_required**
- `BL` → seed `{ BL_DOMINANT[sub], ugly }` → **blocked**

Per-subcategory binding constraints (all OD dominants + both BL dominants are already DB-proven by the Daily
Operations / Finance / Weekly packs via the same seed path; NO `customer_quality` dependency):
- `OD_DOMINANT`: branch/geographic expansion → `cash_survival`; hiring/capacity/partnership → `capacity_feasibility`;
  new-line/price/margin/bulk-order/marketing → `below_margin`.
- `BL_DOMINANT`: profit-margin-initiative + marketing-scale-up → `proof_fraud_block` (gamed growth/attribution
  numbers); all others → `compliance_block` (licensing / labour / consumer-law / franchise-disclosure boundary).
  Planned: 11 compliance blocks, 2 fraud blocks.

## 6. Sources & gold
~24 privacy-clean composite/sector sources (`SRC-GRW-*`, `sourceRecordSchema`-valid, `privacyRisk` low, no PII),
each growth subcategory + the pilot/compliance/fraud boundaries backed. **10 independent gold** (≥1 per
subcategory). Every counted scenario source-backed.

## 7. Proof plan
- **Schema + invariant tests** (`growth-profit-scaling-pack.test.ts`): count 150, 10×15, unique, schema-valid,
  source-backed, 24 sources privacy-clean, 10 gold, distribution within the required ranges, and hard safety rules
  (no growth move proceeds while ROI/capacity/margin/cash data is missing; professional-boundary/compliance never
  proceeds; gamed-number growth never proceeds; proceed/cautious only capped+reversible+verified+low-risk; no live claim).
- **DB proof** (`growth-profit-scaling-db.db.test.ts`): all 150 seeded into isolated businesses, run through the
  REAL `getOwnerWholeBusinessPlan`; assert status + dominant + need_more_data provider-gate + safety + proof/
  reassessment; all five statuses present; cross-workspace isolation. Ledger → `OPSIQ_GROWTH_PROFIT_SCALING_PACK.run.json`.
- **Desktop + mobile Playwright** (`33-growth-desktop.spec.ts`, `34-growth-mobile.spec.ts`): all 150 render the
  runtime-fed Supervisor Summary at desktop + mobile (375×812); status matches; no high-risk/compliance/fraud case
  reads "Proceed"; no horizontal overflow. Shardable via `GRW_SHARD_INDEX`/`GRW_SHARD_TOTAL`. CI-gated.
- **CI workflow** (`growth-profit-scaling.yml`): `grw-db` + 2-shard `grw-browser`. Additive; modifies no existing lane.

## 8. Coverage matrix
Update `OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md`: cumulative 980 → **1130** counted scenarios; this pack
fully covers the **growth / scaling (25)** surface and extends revenue/margin/profit (21), vendor/contract (23),
market/competition (24), local/legal boundary (26), and compliance (27).

## 9. Hard rules honoured
No TODO/stub/placeholder. No business logic in UI. Reuses centralized runtime + policy. Additive schema-compatible
data only (no schema change → all 980 prior scenarios stay valid). Every scenario reduces risk or improves proof
coverage. No fabricated volume, no filler, no weakened gate, no lowered threshold, no deleted test.

## 10. What this pack does NOT claim
- Does NOT prove live profit/outcome improvement (no live data; `liveOutcomeClaimAllowed=false` on all 150).
- Does NOT give final accounting/tax/legal/franchise advice — compliance-boundary growth moves block / professional-gate.
- Does NOT solve unknown-unknowns, unblock public SaaS, or make OpsIQ autonomous.
- The proven signal is the **disposition** (status + confidence + proof demand + owner-gate). Where a routine/
  need-data disposition resolves dominant `profitable_growth` under the seeded knobs, that is the documented
  arbitration behaviour (same as prior packs), not a claim about the growth move's root cause.

## 11. Merge gate
Merge only when: DB 150/150 green in CI, desktop+mobile shards green, ALL prior lanes green (no regression),
ratchet unchanged, and a final read-only hostile audit passes. Classification target on merge:
`GROWTH_PROFIT_SCALING_PACK_READY`.
