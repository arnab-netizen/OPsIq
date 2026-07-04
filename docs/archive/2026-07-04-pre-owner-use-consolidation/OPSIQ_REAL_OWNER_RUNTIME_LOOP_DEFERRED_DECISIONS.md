# OpsIQ Wave 2 (REAL_OWNER_RUNTIME_LOOP) — Deferred Decisions

> Runtime gaps found while scoping Wave 2 that require an owner-level **schema** or **domain-semantics**
> decision, or that would add product surface without improving decision quality / proof / safety /
> runtime usefulness. No code changed for these in Wave 2 (migration-free, no-invented-semantics rule).
> Each is honestly broken/absent today; documented rather than masked. This mirrors Wave 1's discipline.

## DOMAIN/SCHEMA — non-finance CSV intake never materializes into a read model
`materializeIntake` (`src/services/owner-intake/materialize.ts:38`) materializes **only** `finance`
(`operations`/`sales`/`sop`/`marketing` return `{ materialized: 0, skipped: n }` — honest, not masked).
`field-specs.ts` itself states the record→snapshot mapping "is a future slice … not invented."

- **`operations` → `OwnerCapacitySnapshot`**: the operations field spec (`ordersReceived`, `machineCapacityUnits`,
  `idleHours`, `reworkCount`, …) does **not** map 1:1 onto `CapacitySnapshotInput` (`resources: Json`,
  `safeUtilization`, `currentRevenue`). Producing a capacity snapshot from operations rows requires inventing
  a resource/utilization model. **Decision needed:** define the deterministic operations→capacity mapping,
  or add an operations read model.
- **`sales` / `sop` / `marketing`**: there is **no snapshot read model** for these domains and no readiness
  provider consumes them. Materializing them requires a **new schema + migration**. **Decision needed:** which
  (if any) become first-class read models.

**Recommendation:** treat as a dedicated later wave once the owner confirms per-domain field→snapshot
mappings (and any new read models). Out of Wave 2's migration-free / no-invented-semantics scope.

## DOMAIN — manual-entry categories never materialize
`submitManualEntry` (`src/services/owner-mode/owner-manual-entry.service.ts`) writes only `OwnerDataIntake`
and never calls `materializeIntake`. All 20 `OWNER_INPUT_CATEGORIES` therefore reach no numeric snapshot, so
manual entry cannot clear a `need_more_data` domain. There is also a **taxonomy mismatch**: the manual
category `revenue_sales`/`cash_debt` ≠ the materializer's `targetDomain === "finance"`. **Decision needed:**
the category→materializer-domain mapping and per-category field→snapshot-input mapping (same shape of decision
as the CSV case). Not guessed here.

## DOMAIN — `WorkOrder` model/table are dead
`WorkOrder` (`schema.prisma:3875`) and its table exist, but **no service ever creates one** and
`DelegatedTask.workOrderId` is always null. There is no defined product semantics for what a work order groups
or when one is created. **Decision needed:** define work-order semantics (or remove the dead model). Adding a
create path without defined semantics would be inventing product behaviour.

## DATA-MODEL — equipment intake does not satisfy the `equipment_capacity` readiness gate
`POST /api/owner/equipment` writes `OwnerEquipment` (which feeds growth gates), but the `equipment_capacity`
`need_more_data` provider (`owner-db-providers.ts`) reads `OwnerCapacitySnapshot`. So owner-entered equipment
never flips that readiness domain; only a separate capacity-snapshot POST does. Not a crash — a store split.
**Decision needed:** whether recording equipment should derive/refresh a capacity snapshot (and with what
utilization model), or whether the two stores stay intentionally separate.

## LOW-VALUE / needs a consumer — orphaned but not harmful
- **Employee-workload intake route**: `saveEmployeeWorkloadSnapshot` is service-complete but has no route and
  **no readiness-provider consumer** — exposing it would add owner surface without improving the plan. Deferred
  until a consumer for `OwnerEmployeeWorkloadSnapshot` exists.
- **`OwnerEquipment` GET/list route**: write-only today; a read-back route is convenience, not a runtime gate.
  Low priority.
- **On-behalf proof submission**: Wave 2's S2 makes `POST /api/proof/submit` the assignee-only surface
  (server-derived `EMPLOYEE`/`isAssignee`). Manager/owner submit-on-behalf is not currently used; enabling it
  is a separate authority decision, not silently added.

## CLEANUP (Wave 4 governance-hardening territory)
Orphaned/ungrafted intake code with no production route: `src/lib/ingestion/csv.ts`,
`src/services/ingestion/csv.ts` + `validate.ts` (dead parsers, no non-test consumers);
`persistFileIntake`, `submitStructuredImport`, `import-persistence.service.ts`,
`business-facts/intake-adapter.ts` (real logic, no API entry point). Deletion or wiring is a
governance-hardening decision, batched into Wave 4.

## Not masked
None of the above were "fixed" by returning empty arrays, swallowing errors, or converting 500s to 200s.
They remain honestly absent/deferred until their decision is made.
