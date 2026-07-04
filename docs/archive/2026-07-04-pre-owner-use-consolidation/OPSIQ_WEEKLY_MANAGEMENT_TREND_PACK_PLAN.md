# OpsIQ Weekly Management / Trend Pack (150) — Plan

> Pack 5 of the known-to-unknown corpus (Step 2 of the Business Reality Corpus execution chain). Committed BEFORE
> implementation, per the chain's plan-first rule.

## 1. Purpose
Prove OpsIQ correctly handles **weekly management review + trend/drift signals**: a metric moving over weeks is
NOT auto-acted-on. OpsIQ separates *"is the drift real?"* (need the baseline/figures → need_more_data) from
*"the drift is proven and the response is material"* (owner decides) from *"a small proven within-band correction
under an SOP grant"* (cautious/proceed), and blocks trend responses that cross a compliance boundary or rest on
gamed/unverifiable numbers. No live outcome claim; no new engine; no schema change.

## 2. Branch & base
- Branch: `claude/weekly-management-trend-pack`
- Base: `main` @ `94954354` (PR #69 merge — Finance/Cash Pack 120). Confirmed present on main before branching.

## 3. Scenario count & taxonomy
Minimum **150**; final **150** = **10 subcategories × 15**. Every scenario is a distinct authored vignette
(no filler), source-backed, `synthetic=false`, `countedForReadiness=true`, `liveDataBacked=false`.

Subcategories (15 each):
1. `weekly_revenue_drift`
2. `gross_margin_drift`
3. `complaint_trend_increase`
4. `rework_redo_trend`
5. `staff_productivity_drift`
6. `delivery_delay_trend`
7. `proof_compliance_trend`
8. `inventory_consumable_usage_drift`
9. `repeat_customer_retention_decline`
10. `marketing_campaign_underperformance`

## 4. Action-status distribution (target ranges → planned)
| status | required range | planned |
|---|---|---|
| proceed | 15–35 | 24 |
| cautious_proceed | 25–45 | 34 |
| need_more_data | 35–60 | 45 |
| owner_decision_required | 25–45 | 33 |
| blocked | 5–25 | 14 |

Trend packs skew to **need_more_data** (a drift signal needs the baseline/figures before it is real) and
**owner_decision** (material trend responses are the owner's call). `proceed`/`cautious` only on routine,
reversible, within-band corrective steps with verified data + an owner/SOP grant.

Per-subcategory disposition mix (PR/CA/NF/OD/BL), each row = 15, columns hit the totals above:

| # | subcategory | PR | CA | NF | OD | BL |
|---|---|---|---|---|---|---|
| 1 | weekly_revenue_drift | 3 | 4 | 5 | 3 | 0 |
| 2 | gross_margin_drift | 2 | 3 | 5 | 4 | 1 |
| 3 | complaint_trend_increase | 2 | 4 | 5 | 3 | 1 |
| 4 | rework_redo_trend | 2 | 3 | 4 | 4 | 2 |
| 5 | staff_productivity_drift | 3 | 3 | 4 | 3 | 2 |
| 6 | delivery_delay_trend | 3 | 4 | 4 | 3 | 1 |
| 7 | proof_compliance_trend | 1 | 2 | 4 | 3 | 5 |
| 8 | inventory_consumable_usage_drift | 3 | 4 | 4 | 3 | 1 |
| 9 | repeat_customer_retention_decline | 2 | 4 | 5 | 4 | 0 |
| 10 | marketing_campaign_underperformance | 3 | 3 | 5 | 3 | 1 |

## 5. Mechanism (reuse the DB-proven seed path — NO new engine)
Pure data + a pure `expand()` over the merged `business-reality-scenario` contract, identical to the Daily
Operations / Finance packs. Each disposition carries a deterministic `ScenarioSeedPlan` that the existing
`getOwnerWholeBusinessPlan` DB path resolves to the intended status:
- `PR` → seed `{ profitable_growth, good, sopRiskClass: low }` → **proceed**
- `CA` → seed `{ profitable_growth, good, sopRiskClass: medium }` → **cautious_proceed**
- `NF` → seed `{ profitable_growth, bad, stripCriticalData: true }` → **need_more_data**
- `OD` → seed `{ OD_DOMINANT[sub], bad }` → **owner_decision_required**
- `BL` → seed `{ BL_DOMINANT[sub], ugly }` → **blocked**

Per-subcategory binding constraints (all four OD dominants + both BL dominants are already DB-proven by the
Daily Operations pack; **no `customer_quality` dependency**, so no reputation-metric seeding is required):
- `OD_DOMINANT`: revenue/margin/inventory/retention/marketing → `below_margin`; rework/productivity/delivery →
  `capacity_feasibility`; complaint/proof-compliance → `owner_workload`.
- `BL_DOMINANT`: rework/staff-productivity/inventory → `proof_fraud_block` (gamed/misreported numbers);
  all others → `compliance_block` (professional-review boundary). Planned: 9 compliance blocks, 5 fraud blocks.

## 6. Sources & gold
~24 privacy-clean composite/sector sources (`SRC-WKY-*`, `sourceRecordSchema`-valid, `privacyRisk` low, no PII),
each trend subcategory + the routine/compliance/fraud boundaries backed. **10 independent gold** (≥1 per
subcategory). Every counted scenario source-backed.

## 7. Proof plan
- **Schema + invariant tests** (`weekly-management-trend-pack.test.ts`): count 150, 10×15, unique, schema-valid,
  source-backed, 24 sources privacy-clean, 10 gold, distribution within the required ranges, and hard safety rules
  (no drift response proceeds while data is missing; professional-boundary/compliance never proceeds;
  proof-fraud/gamed-number trend never proceeds; proceed/cautious only routine+verified+low-risk; no live claim).
- **DB proof** (`weekly-management-trend-db.db.test.ts`): all 150 seeded into isolated businesses, run through the
  REAL `getOwnerWholeBusinessPlan`; assert status + dominant + need_more_data provider-gate + safety + proof/
  reassessment; all five statuses present; cross-workspace isolation. Ledger → `OPSIQ_WEEKLY_MANAGEMENT_PACK.run.json`.
- **Desktop + mobile Playwright** (`31-weekly-desktop.spec.ts`, `32-weekly-mobile.spec.ts`): all 150 render the
  runtime-fed Supervisor Summary at desktop + mobile (375×812); status matches; no high-risk/compliance/fraud case
  reads "Proceed"; no horizontal overflow. Shardable via `WKY_SHARD_INDEX`/`WKY_SHARD_TOTAL`. CI-gated (harness
  cannot sustain a live server this session).
- **CI workflow** (`weekly-management-trend.yml`): `wky-db` + 2-shard `wky-browser`. Additive; modifies no existing lane.

## 8. Coverage matrix
Update `OPSIQ_BUSINESS_REALITY_MODULE_COVERAGE_MATRIX.md`: cumulative 830 → **980** counted scenarios; this pack
fully covers the **weekly management / trend / drift-detection** surface and extends revenue/margin/profit (21),
customer experience (22), staff execution (17), anti-gaming (19), and compliance (27).

## 9. Hard rules honoured
No TODO/stub/placeholder. No business logic in UI. Reuses centralized runtime + policy. Additive schema-compatible
data only (no schema change → all 830 prior scenarios stay valid). Every scenario reduces risk or improves proof
coverage. No fabricated volume, no filler, no weakened gate, no lowered threshold, no deleted test.

## 10. What this pack does NOT claim
- Does NOT prove live profit/outcome improvement (no live data; `liveOutcomeClaimAllowed=false` on all 150).
- Does NOT give final accounting/tax/legal/HR advice — compliance-boundary trends block / professional-gate.
- Does NOT solve unknown-unknowns, unblock public SaaS, or make OpsIQ autonomous.
- The proven signal is the **disposition** (status + confidence + proof demand + owner-gate). Where a routine/
  need-data disposition resolves dominant `profitable_growth` under the seeded knobs, that is the documented
  arbitration behaviour (same as the prior packs), not a claim about the trend's root cause.

## 11. Merge gate
Merge only when: DB 150/150 green in CI, desktop+mobile shards green, ALL prior lanes green (no regression),
ratchet unchanged, and a final read-only hostile audit passes. Classification target on merge:
`WEEKLY_MANAGEMENT_TREND_PACK_READY`.
