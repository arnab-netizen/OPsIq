# Dynamic Budget — Cross-Module Signal Wiring

Delivers the budget plan's emitted `signals` to **real** consumers after a reassessment,
instead of leaving them inert on the plan snapshot. The budget engine already computed a
`BudgetSignal[]` "for cross-module consumption"; this slice wires the delivery.

Owner Mode only. **Reuses** the existing audit ledger and the proven finance
action → finance re-diagnosis precedent — **no new module, no duplicate signal system, no
schema change.** Gate 10 / `execution.md` / billing / stripe untouched. **Not OWNER_MODE_READY.**

## The honest constraint

The repo has exactly **one** cross-module *push* precedent: `owner-finance/action.service.ts`
triggers a finance re-diagnosis on action completion (best-effort, non-blocking, lazy import).
Every other owner domain (sales, operations, marketing, staffing, scale readiness, external
procurement) runs diagnosis from its **own snapshot** — a pull model with no push-consumption
interface. Budget must not invent those interfaces (new module = hard-stop) or duplicate their
snapshots (forbidden). So signals route in two honest ways:

1. **Real push consumer** — financially-material signals trigger a finance re-diagnosis. The
   refreshed `OwnerFinanceCycle` feeds business-condition/health via the existing
   `financeCycleToDomainScore` aggregation. This reaches health re-eval and margin/pricing.
2. **Audit/owner-risk ledger** — the universal real consumer. Governance, override, and
   data-quality signals are consumed here directly; pull-model domains get a **safe budget-side
   signal only**, with the consumption gap explicitly recorded (not faked).

## What was implemented

- **Pure routing map** `src/domain/owner-budget/signal-routing.ts` (`routeBudgetSignal` /
  `routeBudgetSignals` / `requiresFinanceReDiagnosis`): maps every `BudgetSignalType` to
  `{ targetDomain, consumptionMode, consumerExists, gapReason? }`. The table is
  `satisfies Record<BudgetSignalType, SignalRoute>` so a new signal type is a **compile error**
  until routed — no signal is ever silently dropped.
- **Router service** `src/services/owner-budget/signal-router.service.ts`
  (`routeReassessmentSignals`): emits one `OWNER_BUDGET_SIGNAL_ROUTED` audit event per signal
  (correlationId = reassessmentId), and for financially-material signals triggers a finance
  re-diagnosis (latest snapshot, lazy import, best-effort) + emits
  `OWNER_BUDGET_CROSS_MODULE_REASSESSMENT_TRIGGERED`. Idempotent, workspace-scoped, never throws.
- **Wiring** in `reassessBudget` (budget.service.ts): after `syncBudgetActions`, the plan's
  signals are routed. Advisory — a routing failure never fails the reassessment.
- **Audit events** `OWNER_BUDGET_SIGNAL_ROUTED`, `OWNER_BUDGET_CROSS_MODULE_REASSESSMENT_TRIGGERED`.

## Routing decisions

| Signal class | Examples | Target | Mode | Consumer |
|---|---|---|---|---|
| Financially material | `cash_runway_risk`, `statutory_reserve_breach`, `budget_variance_critical`, `profit_guardrail_breach`, `unit_economics_negative`, `profitable_but_cash_negative` | health / finance_pricing | `RE_DIAGNOSE_FINANCE` | **real** (finance cycle → health) |
| Governance / override / data quality | `spend_proof_missing`, `reconciliation_exception`, `manager_budget_violation`, `approval_bypass_risk`, `owner_override_recorded`, `*_data_stale/insufficient` | owner_risk_audit | `AUDIT_SIGNAL_ONLY` | **real** (audit ledger) |
| Collections / receivables | `revenue_leakage_risk`, `receivables_ageing_risk`, `collection_first_required`, `cash_conversion_risk`, `working_capital_risk` | sales_collections | `AUDIT_SIGNAL_ONLY` | gap (pull model) |
| Procurement / payables | `vendor_control_risk`, `payables_ageing_risk`, `vendor_pressure_risk` | procurement_vendor | `AUDIT_SIGNAL_ONLY` | gap (vendor native to budget) |
| Operations leakage | `laundry_consumable_leakage`, `laundry_delivery_uneconomic`, `housekeeping_supplies_variance`, … | operations | `AUDIT_SIGNAL_ONLY` | gap (pull model) |
| Pricing / margin (archetype) | `laundry_b2b_margin_risk`, `housekeeping_contract_underpriced`, … | finance_pricing | `AUDIT_SIGNAL_ONLY` | gap (snapshot can't model) |
| Staffing / payroll | `housekeeping_overtime_without_output`, `housekeeping_payroll_collection_conflict` | staffing | `AUDIT_SIGNAL_ONLY` | gap (no staffing module) |
| Scale readiness | `underinvestment_detected`, `growth_budget_*`, `scale_budget_*`, `growth_blocked_by_working_capital` | scale_readiness | `AUDIT_SIGNAL_ONLY` | gap (pull model) |

## No duplicate signals on repeated reassessment

`reassessBudget` is already idempotent by `triggerEventId` (a repeated identical trigger returns
the stored plan and never re-routes). As defence-in-depth, the router itself checks for an
existing `OWNER_BUDGET_SIGNAL_ROUTED` event with the same `correlationId = reassessmentId` and
returns `alreadyRouted: true` without re-emitting. Proven by a `[db]` test.

## Loop safety

`reassessBudget` is only called from budget + governance services — never from finance. Finance
re-diagnosis refreshes the finance **cycle**; budget reads the finance **snapshot**, not the
cycle. So budget → finance re-diagnosis cannot loop back into budget.

## Tests

- **7 unit** (`signal-routing.test.ts`): financial → finance re-diagnosis; governance →
  audit-consumed; pull-model → documented gap with reason; gap/consumer reason invariants;
  order/length preservation; `requiresFinanceReDiagnosis`; determinism. Exhaustiveness of the
  map is enforced at compile time by `satisfies Record<BudgetSignalType, …>`.
- **7 `[db]`** (`signal-router.service.db.test.ts`): one routed audit event per signal with the
  correct decision; financial signal triggers finance re-diagnosis (new cycle + event) when a
  snapshot exists; no snapshot → gap-safe (routed, no re-diagnosis); idempotent re-invocation
  (no duplicates); non-financial → audit-only; workspace-scoped (no leak); a real
  `reassessBudget` routes end-to-end.
- Regression owner-budget + services **232/232**. `tsc` 0; `lint:ratchet` PASS. No schema.

## Known limitations / honest scope

- Only the **finance/health** path is a real push consumer. All pull-model domains
  (sales, operations, marketing, staffing, scale readiness, external procurement) receive a
  safe budget-side audit signal only; the gap is recorded in the routed event's `gapReason`,
  not faked with a fabricated consumer. Closing those gaps requires push interfaces in each
  domain (a product-policy decision / new surface — out of this slice's scope).
- No `marketing_roi` signal type currently exists in the budget engine, so nothing routes there
  yet; the target domain is reserved for when a marketing budget signal is added.

## Classification

`DYNAMIC_BUDGET_CROSS_MODULE_SIGNALS_PARTIAL` — every emitted budget signal is now delivered:
financially-material signals drive a real finance re-diagnosis (→ health), governance/risk/
data-quality signals are consumed by the audit ledger, and all remaining (pull-model) domains
receive a safe budget-side signal with the consumption gap documented. DB-proven for routing,
finance re-diagnosis, idempotency, and workspace isolation. **Not OWNER_MODE_READY.**
