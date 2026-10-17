# D9 — leakage components persisted separately

Status: **prepared, not deployed.** Requires a production database migration (see "Production migration" below).

```
D9_PRODUCTION_MIGRATION_REQUIRED=YES
D9_PRODUCTION_MIGRATION_AUTHORIZED=NO
```

Preparing this change (additive migration, code, tests) was authorised. **Running the migration against production was not.**

## Root cause (code review, confirmed)

`createFinancialSnapshot` merged `refundAmount + reworkCost + complaintCost` into the single legacy column
`owner_financial_snapshots.refund_rework_cost` before persisting, and `rowToFinanceInput` restored that sum as
`refundAmount`. The leakage domain checks four components independently (discount, refund, rework, complaint), so a persisted
snapshot could **never** prove which components the owner had supplied: `leakageCoverage().complete` was unreachable and the
"at least … redone work, complaint costs not entered yet" wording could never clear, even when all four were entered.
The earlier D9 proof fed all four components directly to the pure domain and never crossed the service/storage boundary.

This is a service/storage-boundary defect, not a presentation defect.

### Why the existing lower-bound domain tests were insufficient

The lower-bound logic (`leakageCoverage`, `valueIsLowerBound`, the "at least …" wording) was correct, and its tests passed,
because they constructed a `FinancialSnapshotInput` with four components and handed it to the pure domain. In production the
domain never receives such an input: it receives whatever `rowToFinanceInput` rebuilds from the stored row, and the stored
row had only one combined number. The defect lived in the hop *between* the API and the domain, and no test crossed that hop.
The new tests therefore start at the API schema and end at the finance domain, through a real database row
(`leakage-component-persistence.db.test.ts`), and a mutation check proves they fail when the old read mapping is restored.

## The repair (additive, backward compatible)

Schema (`20261017120000_d9_leakage_component_persistence`), all nullable, no default, no backfill:

| column | meaning |
|---|---|
| `refund_amount`, `rework_cost`, `complaint_cost` | the three components, independently. `NULL` = UNKNOWN, `0` = an explicit known zero. |
| `leakage_component_version` | `NULL` = legacy combined-aggregate record; `1` = the three columns above are authoritative. |
| `refund_rework_cost` (existing) | kept. For a version-1 row it is only a **compatibility aggregate** (sum of the known components, NULL if none); it is never the source of component coverage. For a legacy row it is the only leakage figure and its composition is unknown. |

Two `CHECK` constraints enforce the contract in the database itself:

* a component value may exist only when `leakage_component_version = 1` (so a legacy-shaped row can never carry a guessed
  component; written NULL-safe because a CHECK passes on NULL);
* components are non-negative.

### Legacy rule

Historical `refund_rework_cost` values are **not** split and **not** assigned to any component. They are read as the new
domain input `legacyCombinedLeakage`: an explicitly ambiguous amount that
* still contributes its known monetary amount to the leakage total (a lower bound — nothing is silently dropped), and
* can never make `leakageCoverage().complete` true (its split is reported as UNKNOWN).

A marker this code does not recognise is read as legacy (conservative).

### New-write contract

`API input → createFinancialSnapshot → row → rowToFinanceInput → leakageCoverage` preserves each component independently:
omitted/null stays UNKNOWN, an explicit 0 stays a known 0.

### Amendment contract

* omitted = keep the recorded state; number = known new value; `null` = back to UNKNOWN — **per component**;
* amending one component never fabricates the other two;
* an amendment that does not touch leakage carries the recorded state forward unchanged — a legacy row stays legacy;
* a legacy row cannot be corrected one component at a time (the combined figure cannot be split). The amendment must restate
  **all three** (a number, or `null` for UNKNOWN); the row then becomes component-aware, the superseded legacy version keeps
  its combined figure (append-only lineage), and the audit event records `leakageContractUpgraded` and
  `legacyCombinedLeakageSuperseded`. A partial restatement is refused with a field-level error.
* the amend API now accepts `reworkCost` and `complaintCost` (previously only `refundAmount`, which meant "the merged value").

### Legacy invariant (proved by test)

A row holding only `refund_rework_cost` must **never** produce `leakageCoverage.complete = true`, and its aggregate must never
be split. `…persistence.db.test.ts › LEGACY INVARIANT` drives one legacy row through two diagnosis reruns and a chain of four
unrelated amendments, reloading the row from the database and re-diagnosing after each step, and asserts every time that the
components are still NULL, the marker is still NULL, the combined figure is unchanged, coverage is incomplete and the finding
still names the unknown split. The `CHECK` constraint makes the same guarantee in the database.

### Where the code lives

* `src/services/owner-finance/leakage-components.ts` — the pure persist/read/amend rules (kept out of `snapshot.service.ts`,
  whose export surface is pinned by the `financial-snapshot-selection` governance test).
* `src/services/owner-finance/snapshot.service.ts` — create / read mapping / amend wiring.
* `src/domain/owner-finance/cost-model.ts` — `legacyCombinedLeakage` handling in `leakageCoverage`, `refundGroupParts`,
  `importantFieldValue`.

### Unchanged on purpose

The IMPORTANT input "Refund / Rework Cost" keeps its existing data-confidence meaning (supplied when any part is known).
Presentation items (Home wording, My Business period wording, confidence vocabulary, internal field names) are **out of scope**
for this change.

## Production migration (REQUIRED, not authorised by this change)

1. The migration is **additive and instant** (four nullable columns with no default, plus two CHECK constraints that validate
   existing rows once; the table is small).
2. **Deploy order:** apply the migration **before** the application that reads/writes the new columns. The production build runs
   `scripts/release/production-migration-gate.mjs`, which fails the build while any committed migration is unapplied, so
   Vercel will not promote this commit until the migration has been run through the owner-approved
   `.github/workflows/migrate-production.yml`. Production keeps serving the last good deployment meanwhile. **After merge, the
   first production build is therefore EXPECTED to fail the release gate until the migration is applied; then redeploy.**
3. **Forward/backward compatibility:** the previous application keeps working against the migrated schema — it ignores the new
   columns and keeps writing `refund_rework_cost`; such rows have a NULL marker and are read as legacy.
4. **Rollback:** revert the application. The columns are inert to older code and nothing needs to be dropped. A version-1 row
   read by older code behaves exactly as it did before this change (aggregate only, incomplete). Dropping the columns is a
   data-loss operation and is deliberately not provided.

## Hostile review of the migration design

| Concern | Finding |
|---|---|
| Legacy ambiguity | Closed. Marker NULL ⇒ legacy; DB CHECK forbids components on a legacy row; read path ignores component columns unless marker = 1; legacy aggregate is a distinct domain input and coverage is forced incomplete by construction. |
| UNKNOWN preserved | Closed. NULL ≠ 0 at every hop (create, row, read, amend); proven across all 8 component subsets, explicit zero, and per-component amendment. |
| A CHECK that silently passes | Found and fixed during test: `NULL = 1` is NULL and a CHECK passes on NULL, which let a NULL marker carry components. The constraint now has an explicit `IS NOT NULL` branch; a DB test pins it. |
| Amendment | Per-component merge; unrelated amendments carry state unchanged; legacy rows cannot be partially corrected; concurrent amendments remain serialised by the existing `FOR UPDATE`. |
| Old app on new schema | Works: ignores new columns; its writes have a NULL marker ⇒ legacy (conservative). Old app amending a version-1 row yields a legacy row with the aggregate preserved. Verified by SQL on a disposable database. |
| New app on old schema | Would fail on the missing columns — prevented by the release gate (see Deploy order). |
| Data loss | None. No DROP, no rename, no NOT NULL, no default, no rewrite, no backfill. Verified: row count and a checksum of every pre-existing column are identical before/after on a database seeded with legacy-shaped rows. |
| Locking | `ADD COLUMN` nullable/no-default is metadata-only. `ADD CONSTRAINT … CHECK` scans the table once under a brief exclusive lock; acceptable for this table's size. |
| Remaining limitation | The "missing inputs" list (`computeMissingInputsWithPriority`) still treats "Refund / Rework Cost" as one input (present when any part is known), so for a component-aware row with only some components it does not name the specific unknown ones. The leakage finding itself does name them. Splitting that list is a presentation change and is left to a separate change. |

## Evidence

* Service-boundary cases (`leakage-component-persistence.db.test.ts`, 27 tests; pure rules in `leakage-component-contract.test.ts`, 24 tests):
  1. all four known; 2. each of the three non-discount components individually UNKNOWN; 3. multiple UNKNOWN combinations;
  4. all UNKNOWN; 5. all explicit zero; 6. refund only; 7. rework only; 8. complaint only; 9. refund + rework;
  10. refund + complaint; 11. rework + complaint; 12. all three; 13. amendment known → UNKNOWN; 14. amendment UNKNOWN → known;
  15. unrelated amendment preserves semantics; 16. legacy combined aggregate stays incomplete; 17. a historical combined value
  is never assigned to a guessed component. (Cases 1–12 are the 8 subsets of {refund, rework, complaint}, each asserted at
  the API schema, the stored row, `rowToFinanceInput`, `leakageCoverage`, the ratio and the persisted finding.)
* Mutation check: restoring the old read mapping (`refundAmount: row.refundReworkCost`) makes 15 of the then-26 DB tests fail.
* Migration data integrity (disposable loopback database): every migration except this one applied; three legacy-shaped rows
  inserted with the old columns only; this migration applied; row count 3 → 3 and a checksum of every pre-existing column
  identical before and after; the new columns are NULL on those rows; the combined values (5000, NULL, 0) are untouched; an
  old-column-only insert after the migration succeeds and reads as legacy; migration history 186 applied, 0 failed.
* A defect in this design was found by these tests and fixed before the PR: a first version of the contract `CHECK` passed for
  a NULL marker with component values (a CHECK passes on NULL).
* Governance: the export surface of `snapshot.service.ts` is pinned; a first version added three exports and broke
  `financial-snapshot-selection.test.ts`; the helpers moved to their own module.

## Out of scope (separate root causes)

Home "No profit leak detected yet"; My Business period wording; `cashOnHand` / `bankBalance` field names on Home; confidence
vocabulary; "This task is verified"; D1; Clarity; QBO; billing.

## Release status

`OWNER_BETA_READY=NO`, `CB1_OWNER_001_READY=NO`, `CB1_EXPANSION_GATE=CLOSED`. This change does not alter them.
