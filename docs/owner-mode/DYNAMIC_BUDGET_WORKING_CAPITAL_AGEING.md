# Dynamic Budget — Working-Capital Ageing Buckets

Upgrades Dynamic Budget working-capital handling from coarse receivable/payable
pressure to **ageing-aware** owner guidance: detect when a business looks profitable
but cash is trapped in receivables, when overdue payables create vendor/supply risk,
and when growth spend must be blocked until collections improve.

Owner Mode only. No public SaaS / billing / launch / Gate 10 / `execution.md` / stripe /
Browser-E2E touched. No duplicate finance or reassessment engine — it reuses the
existing mode classifier, capital allocation, working-capital (gap-survival) engine,
and the reassessment/plan/signal flow.

## 1. What was implemented
- **Pure engine** `src/domain/owner-budget/working-capital-ageing.ts`:
  `classifyAgeingBucket(dueDate, asOf)` and `assessWorkingCapitalAgeing(input)` →
  receivable/payable bucket breakdowns, collection priority, vendor pressure,
  cash-conversion risk, "profitable but cash-negative", growth-block flag, honest
  confidence, and a signal list. Pure/deterministic (asOf passed in; no clock reads).
- **Persistence** `OwnerWorkingCapitalItem` (manual / import-ready line items) +
  service `src/services/owner-budget/working-capital.service.ts`
  (`recordWorkingCapitalItem`, `listWorkingCapitalItems`, `deriveAgeingForReassessment`).
- **Reassessment integration** in `budget.service.ts#assembleAssessment`: loads items,
  runs the ageing engine, feeds **overdue payables as a real cash obligation** (so the
  existing mode classifier + capital allocation react), derives the **collection gap**
  for the existing gap-survival engine, and attaches the ageing result to the
  assessment so the plan composer emits ageing signals/actions/restrictions.
- **Plan composer** `updated-plan.ts`: emits the ageing signals, a collection-first
  action, a vendor-negotiation action, growth-block restrictions, and the explicit
  trade-off "profit is not free cash".

## 2. Schema change
Yes — one minimal, workspace-scoped table `owner_working_capital_items`
(migration `20260627090000_owner_working_capital_items`). Columns: workspaceId,
businessId (FK → owner_businesses, cascade), kind, counterparty, amount, dueDate?,
status, sourceType (MANUAL|IMPORT), sourceRef?, confidenceState, createdBy, createdAt,
updatedAt. Indexed by workspaceId, (workspaceId,businessId), (workspaceId,businessId,kind).
Schema was necessary because ageing requires per-line **due dates**, which the existing
aggregate `OwnerFinancialSnapshot` (only `overdueReceivables`/`overduePayables` totals)
cannot express.

## 3. Ageing bucket definitions (relative to `asOf`)
- `current` — not yet due (days overdue ≤ 0)
- `d0_30` — 1–30 days overdue
- `d31_60` — 31–60 days overdue
- `d61_90` — 61–90 days overdue
- `d90_plus` — 90+ days overdue
- `unknown` — no due date (cannot be aged → downgrades confidence)

Applied to both receivables and payables. Only open balances (open/outstanding/partial/
disputed) are aged; collected/paid/written-off are excluded.

## 4. Signals emitted
`receivables_ageing_risk`, `payables_ageing_risk`, `collection_first_required`,
`vendor_pressure_risk`, `cash_conversion_risk`, `profitable_but_cash_negative`,
`growth_blocked_by_working_capital`, `working_capital_data_stale`,
`working_capital_data_insufficient` (added to `BudgetSignalType`; the existing
`working_capital_risk` is retained for the coarse gap path).

## 5. How it affects owner guidance
- Overdue payables become real obligations → reduce free-cash posture → can flip the
  mode away from GROW (to STABILIZE/HYBRID/EMERGENCY) and block growth in allocation.
- 90+ overdue receivables → collection-first action + restriction before new spend.
- Overdue payables (90+/high) → vendor-negotiation action + stage-payments restriction,
  while protecting payroll/rent/tax first.
- Profitable-but-cash-negative → explicit "profit is not free cash" trade-off in
  `whatNotToDo`; growth blocked.
- Missing due dates / stale manual data → confidence downgrade (INSUFFICIENT / UNVERIFIED)
  and a data-quality signal — never presented as verified.

## 6. Tests added
- `src/__tests__/owner-budget/working-capital-ageing.test.ts` — 16 pure unit tests
  (every bucket, collection-first, vendor-pressure, profitable-but-cash-negative,
  missing-due-date → insufficient, stale → downgrade, open-only, determinism).
- `src/__tests__/services/owner-budget/working-capital.service.db.test.ts` — 7 `[db]`
  tests (workspace-scoped persistence + isolation; cross-workspace write blocked; audit
  + manual labelling; overdue payables flip GROW → defensive + emit ageing signals +
  generate actions/restrictions via real reassessment; profitable-but-cash-negative;
  missing-due-date confidence downgrade; regression: no items ⇒ unchanged GROW behaviour,
  no ageing signals).

## 7. What remains missing
- No owner-facing route/UI in this slice (entry is via the service / import-ready) —
  a `GET/POST /api/owner/budget/working-capital` route + `/owner/budget` UI section is a
  deferred follow-up.
- Confidence never reaches VERIFIED here (manual/import data) — verification would
  require reconciliation/live-feed evidence.

## 8. Live feeds
Still deferred. This slice is manual / import-ready only — **not** a live bank / POS /
accounting integration. Source data is honestly labelled `MANUAL` / `IMPORT` with
`confidenceState = "unverified"`.

## 9. OWNER_MODE_READY
This slice does **not** make Owner Mode ready. Browser/E2E proof, live feeds, the
working-capital route/UI, runtime RBAC gradient actor, and archetype packs remain
outstanding. **Not OWNER_MODE_READY.**

## Classification
`DYNAMIC_BUDGET_WORKING_CAPITAL_DB_PROVEN` — ageing engine is logic-proven (16 unit
tests) and the persisted ageing → reassessment path is DB-proven (7 `[db]` tests on real
PostgreSQL), with workspace isolation and a no-regression guard.
