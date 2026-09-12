# Dynamic Budget — Working-Capital × Archetype Cross-Integration

Combines the working-capital ageing assessment (PR #45) with the archetype budget packs
(PR #46) so OpsIQ gives **business-specific cash-cycle guidance** instead of treating
working-capital risk and archetype risk as independent signals.

Owner Mode only. **No new engine** — a small pure helper reads the two existing
assessments and feeds the existing `composeUpdatedPlan` pipeline + the existing allocation
growth-defer. No duplicate reassessment/working-capital/archetype/action engine; no bypass
of confidence gates, action-linkage idempotency, or workspace isolation. **No schema
change.** Gate 10 / `execution.md` / billing / stripe / Browser-E2E untouched.

## What was implemented
- **Pure helper** `src/domain/owner-budget/archetype-working-capital.ts`
  (`assessArchetypeWorkingCapital`): given the resolved archetype + the ageing result +
  the archetype operational signals, returns combined budget signals / generated actions /
  spend restrictions / what-not-to-do + a `growthBlocked` flag.
- **Wiring** in `composeUpdatedPlan`: computed alongside the archetype pack; its
  `growthBlocked` is OR-ed into the existing offensive-candidate defer; its output is merged
  through the existing extra-actions/restrictions/what-not-to-do pipeline.
- **5 new signals** (only where existing signals were insufficient):
  `laundry_b2b_cash_conversion_risk`, `laundry_b2b_payment_terms_risk`,
  `laundry_reserve_protected_by_downtime_and_receivables`,
  `housekeeping_recurring_contract_cash_risk`, `housekeeping_payroll_collection_conflict`.

## Combined business behaviours
**Laundry** (with working-capital ageing present):
1. Overdue B2B receivables ⇒ `laundry_b2b_cash_conversion_risk`, collect/renegotiate action, growth deferred ("profit is not free cash").
2. Low kg margin **AND** overdue receivable ⇒ stronger `laundry_b2b_payment_terms_risk` + a **price-AND-terms** action (not just "collect").
3. Uneconomic delivery **AND** severe ageing (90+/serious) ⇒ delivery expansion deferred.
4. Machine downtime **AND** overdue receivables ⇒ `laundry_reserve_protected_by_downtime_and_receivables`; maintenance reserve protected from marketing/growth.

**Housekeeping** (with working-capital ageing present):
5. Overdue recurring receivables ⇒ `housekeeping_recurring_contract_cash_risk`, collection/terms action, hiring/expansion deferred.
6. Cash-conversion impaired / profitable-but-cash-negative ⇒ `housekeeping_payroll_collection_conflict` (protect payroll/rent before chasing growth).
7. Travel inefficiency **AND** slow collection ⇒ route clustering + collection outrank growth (deferred).
8. Underpriced recurring **AND** overdue receivable ⇒ reprice-AND-terms action.

**Generic / safety:**
9. Generic archetype ⇒ no laundry/housekeeping assumptions; the standalone working-capital warnings (PR #45) still fire.
10. Missing archetype metrics ⇒ archetype confidence downgraded (`archetype_data_insufficient`) but working-capital risk is **not** suppressed.

## Growth/scale gating
A combined cash-cycle constraint defers offensive (growth/scale/experiment) candidates
through the **existing** allocation result (decision flips to `DEFER` in
`fundAllocationChanges`) — same mechanism PR #46 uses, no new ranker.

## Tests
`src/__tests__/owner-budget/archetype-working-capital.test.ts` (15 deterministic, via the
real `composeUpdatedPlan`): all 8 laundry/housekeeping combined behaviours; generic safe
fallback; missing-metrics downgrade-without-suppression; **no-ageing ⇒ archetype unchanged**;
**no-archetype ⇒ working-capital unchanged**; deterministic action source-keys (action-linkage
compatible, no duplicates). Regression: owner-budget + services **166/166** under PostgreSQL.

## Reassessment / DB note
The combined behaviour is proven at the **updated-owner-plan** (`composeUpdatedPlan`) level.
Full proof through the live `reassessBudget` DB flow additionally requires **persisted
archetype operational metrics** (the ageing side is already persisted via PR #45). Archetype
metric persistence is **Slice 2**; until then `reassessBudget` surfaces
`archetype_data_insufficient` for laundry/housekeeping businesses while still emitting the
working-capital ageing signals. The working-capital DB path (PR #45) remains DB-proven and
green (166/166 includes it).

## Classification
`DYNAMIC_BUDGET_WC_ARCHETYPE_INTEGRATION_LOGIC_PROVEN` — combined behaviour proven
deterministically through the updated owner plan; not claimed DB_PROVEN because the
combined path is not yet driven end-to-end by persisted data through `reassessBudget`
(awaits Slice 2 archetype-metric persistence). **Not OWNER_MODE_READY.**
