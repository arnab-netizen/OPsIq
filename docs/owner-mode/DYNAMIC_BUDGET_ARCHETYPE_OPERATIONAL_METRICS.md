# Dynamic Budget — Persisted Archetype Operational Metrics + Entry Routes

Moves the archetype budget packs from pure logic toward **DB-backed owner-usable input** by
persisting archetype operational metrics (laundry / housekeeping / generic) and feeding them
into reassessment. Mirrors the PR #45 working-capital-item pattern.

Owner Mode only. No duplicate finance/budget/archetype engine. No live integrations. No
analytics warehouse. Gate 10 / `execution.md` / billing / stripe / Browser-E2E untouched.
**Not OWNER_MODE_READY.**

## What was implemented
- **Schema** `OwnerArchetypeMetric` (migration `20260627120000_owner_archetype_metrics`):
  `workspaceId, businessId (FK→OwnerBusiness cascade), archetype, metricType, metricDate,
  value, unit, sourceType (MANUAL|IMPORT), sourceRef, confidenceState, createdBy, createdAt,
  updatedAt`. Indexed by workspace, (workspace,business), (workspace,business,archetype),
  metricType.
- **Vocabulary + pure derivation** `src/domain/owner-budget/archetype-metrics.ts`: the
  laundry/housekeeping/generic metric-type allowlist and `deriveArchetypeSignalsFromMetrics`
  (latest non-stale value per type → archetype-pack signal inputs; stale excluded; pure).
- **Service** `archetype-metrics.service.ts`: `recordArchetypeMetric` (ownership-guarded,
  metric-type allowlisted, audited), `listArchetypeMetrics`, `deriveArchetypeSignalsForReassessment`.
- **Routes** `GET/POST /api/owner/budget/archetype-metrics` — `withCanonicalEnforcement`
  (GET OWNER_VIEW, POST OWNER_MANAGE), workspace derived server-side, Zod-validated.
- **Reassessment wiring** (`assembleAssessment`): persisted metrics → `assessment.archetypeSignals`
  → the archetype packs + working-capital × archetype cross-integration now run through the
  REAL `reassessBudget` DB flow.

## Metric types
**Laundry:** chemical_usage/cost, load/order/kg counts, delivery count/cost/revenue, fuel_cost,
rewash count/rate, damage/refund, machine_downtime_hours, maintenance_cost, b2b_kg_price,
b2b_payment_terms_days, b2b_contribution_margin_pct, discount amount/rate,
contribution_after_discount_pct, low_value_delivery_share_pct, chemical_cost_baseline_per_order,
staff_output. **Housekeeping:** job_count, labour hours/cost/baseline, travel time/cost/share,
supervisor hours/cost, supplies usage/cost/expected, complaint/no-show counts + rates, recurring
contract price/terms/margin, overtime hours/cost/output-gain, route_density, retention, staff_output.
**Generic:** utilization, gross margin, repeat rate, service cost, rework/refund, CAC, collection
days, capacity. (The starred subset maps directly to pack signal inputs; raw types are storable
for future use.)

## Integration proof (through real reassessment)
`[db]` tests prove persisted metrics drive guidance via `reassessBudget`:
- laundry chemical/load (+baseline) → `laundry_consumable_leakage`; B2B margin → `laundry_b2b_margin_risk`; downtime → `laundry_machine_downtime_risk`.
- housekeeping travel → `housekeeping_travel_inefficiency`; recurring margin → `housekeeping_contract_underpriced`.
- missing metrics → `archetype_data_insufficient`; stale-only metrics excluded → `archetype_data_insufficient` (confidence not inflated).

## Security / DB proof
- Migration applies on PostgreSQL; `prisma validate` clean.
- `[db]`: workspace-scoped persistence + isolation; cross-workspace read/write blocked
  (record unchanged on failed cross-workspace write); malformed metric type rejected; audited;
  manual-labelled (`confidenceState=unverified`).
- **Runtime RBAC** (`archetype-metrics.rbac.test.ts`, real wrapper, mocked auth boundary):
  unauthenticated denied; no-OWNER_VIEW read denied; no-OWNER_MANAGE write denied (no row);
  OWNER_MANAGE create + OWNER_VIEW read allowed; malformed body rejected; foreign-workspace
  read/write blocked.

## Tests
6 unit (derivation), 7 `[db]` (service + reassessment), 6 `[db]` runtime-RBAC route tests.
Regression: owner-budget + services **186/186** under PostgreSQL. `tsc` 0; `lint:ratchet` PASS.

## What remains
- No owner-facing entry **UI** for metrics in this slice (routes are owner-usable; UI is a
  follow-up). Live feeds remain deferred (manual/import-ready; confidence never VERIFIED).
- Raw operational metric types beyond the consumed subset are stored but not yet derived into
  signals (future enrichment).

## Classification
`DYNAMIC_BUDGET_ARCHETYPE_METRICS_RUNTIME_PROVEN` — persisted metrics feed reassessment
(DB-proven) and the entry routes' allow/deny are proven at runtime through the real canonical
wrapper. **Not OWNER_MODE_READY.**
