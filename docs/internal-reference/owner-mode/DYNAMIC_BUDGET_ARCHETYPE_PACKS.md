# Dynamic Budget — Archetype-Specific Budget Packs

Makes budget advice reason with the **cost structure, leakage risks, growth levers and
scale constraints of the business type** instead of generic advice ("increase
marketing", "reduce costs"). Three packs: **laundry / dry-cleaning**, **housekeeping /
facilities**, and a **generic-service fallback**.

Owner Mode only. No duplicate budget/archetype/action engine. No public SaaS / billing /
launch / Gate 10 / `execution.md` / stripe / Browser-E2E touched. No schema change.

## 1. What archetype infrastructure already existed (reused)
- `archetypeFromBusinessType()` (`src/domain/owner-guidance/archetype-guidance.ts`) — maps
  `businessType` / `industryTemplate` → `laundry | housekeeping | home_services | generic`.
  **Reused** for `resolveBudgetArchetype` (home_services → generic budget fallback).
- `FinancialSnapshotInput.industryTemplate` — the archetype hint already flows into
  `composeUpdatedPlan` (passed to `runCollective`). **Reused** as the pack selector.
- `composeUpdatedPlan` extra-actions / extra-restrictions / extra-what-not-to-do pipeline
  + the capital-allocation result. **Reused** to surface pack output and to defer growth.
- Operating-model metadata (`LAUNDRY_MODEL` / `HOUSEKEEPING_MODEL`) informed the pack rule
  design (cost drivers, risks) but is not duplicated.

## 2. PR #45 dependency
**None.** This slice is implemented on a clean branch from `origin/main` and does **not**
require the PR #45 working-capital-ageing code. The two optional working-capital
cross-tests (laundry B2B cash-negative; housekeeping slow-payment) are **deferred** until
PR #45 merges (documented in §9), so no unmerged work is stacked.

## 3. New rules added (and why they are budget-specific)
Pure engine `src/domain/owner-budget/archetype-packs.ts` (`assessArchetypePack`):

**Laundry** — chemical/consumable usage leakage (cost-per-load vs baseline / rewash),
delivery economics (delivery cost ≥ delivery revenue / low-value-order share), B2B kg/linen
contribution margin, machine downtime / maintenance reserve protection, discounts that make
post-discount contribution negative. These are the actual laundry margin killers — generic
"reduce costs" would miss them.

**Housekeeping** — travel-time inefficiency (route clustering), overtime without output gain
(scheduling vs blind hiring), underpriced recurring contracts, supplies usage variance,
labour hours-per-job productivity. These are the actual housekeeping margin killers.

**Generic** — safe fallback only; never overrides a specific pack; emits nothing archetype-
specific. A specific archetype with **no operational metrics** ⇒ `archetype_data_insufficient`
(confidence downgrade), never fabricated advice.

## 4. How the rules affect owner guidance
The pack returns budget **signals**, **generated actions**, **spend restrictions**,
**what-not-to-do**, **scale-gate blocks** and **profit levers**, which `composeUpdatedPlan`
merges into the owner plan. A hard economics gate (negative delivery economics, high travel
time) sets `growthBlocked`, which **defers offensive (growth/scale/experiment) candidates
through the existing allocation result** — so the existing `growth_budget_blocked` signal and
blocked-candidate action loop fire naturally (no new ranker, no confidence-gate bypass).

### Signals emitted
`laundry_consumable_leakage`, `laundry_delivery_uneconomic`, `laundry_b2b_margin_risk`,
`laundry_machine_downtime_risk`, `laundry_discount_contribution_risk`,
`housekeeping_travel_inefficiency`, `housekeeping_overtime_without_output`,
`housekeeping_contract_underpriced`, `housekeeping_supplies_variance`,
`archetype_data_insufficient`.

## 5. Pack contents (summary)
| Pack | Cost drivers | Leakage patterns | Proof | Growth levers | Scale gates | Profit levers |
|---|---|---|---|---|---|---|
| Laundry | chemicals/load, water/elec, delivery, rewash/damage, downtime, B2B kg, packaging, discounts | chemical↑ vs volume, delivery below cost, high rewash/refund, B2B below contribution, downtime lost revenue, discounts kill contribution, low-value delivery orders | chemical bills, usage logs, load/order counts, delivery/fuel logs, refund/repair logs, B2B price+terms | B2B outreach, referral, retention, min order value, premium upsell, route density | stable margin, downtime ok, rework guardrail, delivery economics positive, B2B cash-safe, reserve safe | reduce chemical wastage, raise min order, reprice B2B, cut rework, route discipline, reduce discounts, maintenance reserve |
| Housekeeping | labour/job, travel, supervisor ratio, supplies/job, rework, no-show, overtime, recurring margin | labour↑ vs jobs, supplies vs jobs, high travel, repeated rework, no-show cost, underpriced contracts, excess overtime, poor clustering | attendance/job logs, completion proof, supply/travel logs, complaint records, contract price+terms, payroll/overtime | recurring residential/office contracts, add-ons, cluster expansion, referral, premium deep-clean | attendance reliable, quality controlled, positive per-job margin, supervisor ratio justified, route density ok, cash-safe terms | reprice contracts, reduce travel, cluster jobs, cut rework, optimise supervisor ratio, manage supplies, fix scheduling |
| Generic | labour utilization, gross margin, repeat rate, service/travel cost, rework/refund, CAC, collection timing, capacity, proof, reserve | (fallback — no archetype-specific detection) | standard finance proof | (generic) | (generic) | (generic) |

## 6. Tests added
`src/__tests__/owner-budget/archetype-packs.test.ts` (18 deterministic tests):
- pure engine — laundry (chemical leakage, delivery economics→growthBlocked, B2B margin,
  machine downtime/reserve, discount contribution) and housekeeping (travel→growthBlocked,
  overtime-without-output→scheduling not hiring, underpriced recurring, supplies variance);
- fallback safety (generic empty; specific-without-metrics → data-insufficient; determinism
  ⇒ stable action source-keys ⇒ no duplicate actions);
- plan integration — laundry ≠ generic and housekeeping ≠ generic on the same finance;
  delivery economics **defer** the growth candidate through the existing allocation (vs FUND
  for generic); regression (generic finance plan unchanged); laundry-without-metrics safe
  fallback.

## 7. What remains partial
- Archetype operational metrics are **manual / import-ready inputs** to the assessment; they
  are **not yet persisted** (no schema for per-load/per-job metrics) — so live reassessment
  surfaces `archetype_data_insufficient` until metrics are provided. Persisting them is a
  deferred follow-up.
- No owner-facing route/UI for entering archetype metrics in this slice.
- home_services has no dedicated pack (uses the generic fallback) — a fourth pack is future
  work.

## 8/9. Working-capital (PR #45) consumed or deferred
**Deferred.** This branch is from `origin/main` and does not include PR #45. Once PR #45 is
merged, the two optional cross-tests (laundry B2B cash-negative blocks growth despite profit;
housekeeping recurring contract with slow payment triggers a cash warning) can be added by
combining the ageing signals with these packs.

## 10. OWNER_MODE_READY
This slice does **not** make Owner Mode ready. Persisted archetype metrics, live feeds,
working-capital integration, route/UI, and Browser/E2E remain outstanding. **Not OWNER_MODE_READY.**

## Classification
`DYNAMIC_BUDGET_ARCHETYPE_PACKS_LOGIC_PROVEN` — the packs change actual recommendations and
are proven by 18 deterministic logic + plan-integration tests. No schema/DB involved, so
**not** DB_PROVEN; persisted archetype metrics are a documented deferral.
