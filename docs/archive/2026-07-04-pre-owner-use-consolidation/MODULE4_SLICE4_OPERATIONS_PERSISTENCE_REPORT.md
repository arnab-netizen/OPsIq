# Module 4 (Operations & Productivity Intelligence) — Slice 4: Persistence Schema + Migration — Report

Status: **BUILT + LOCALLY VERIFIED — MIGRATION NOT YET APPLIED (manual gate).**
Additive Prisma schema (5 operations tables) + a fail-closed manual migration
workflow. **No migration was run by the agent** (execution.md §3). Module 1 +
Module 2 + Module 3 + Module 5 + recovery untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Per execution.md §23 (SCHEMA step) the operations domain logic (engine + detector +
planner, Slices 1–3) is complete and unit-proven. The next contract step is
**SCHEMA**. Persisting requires a migration, a manual gate — so this slice creates
the schema, the migration SQL, and the manual migration workflow, then stops.

## 2. Files created / changed

- `prisma/schema.prisma` — added 5 models (`OwnerOperationsSnapshot`,
  `OwnerOperationsCycle`, `OwnerOperationsFinding`, `OwnerOperationsAction`,
  `OwnerOperationsVerification`) + 5 back-relations on `OwnerBusiness`. **Additive
  only** — no existing model altered.
- `prisma/migrations/20260613130000_module4_operations/migration.sql` — additive
  DDL: 5 `CREATE TABLE`, indexes, and FKs. **No ALTER/DROP** on any existing table.
- `.github/workflows/module-4-operations-migrate.yml` — manual `workflow_dispatch`
  migration workflow (mirrors the proven Module 3/5 workflows): confirmation phrase
  `APPLY_MODULE4_OPERATIONS_MIGRATION`, fail-closed secret preflight, strips local
  `.env*`, informational pre-status, strict `migrate deploy` + post-status, no
  secret printing, no app deploy.

## 3. Schema design (mirrors Modules 2/3/5 for spine uniformity)

- `owner_operations_snapshots` — raw `OperationsSnapshotInput` fields
  (ordersReceived/Completed/Delayed, reworkCount, complaints, staffHours,
  machineCapacityUnits, idleHours, deliveryAttempts/Failures, inventoryShortages,
  sopChecks/Misses) + period/currency/model/template + dataConfidenceScore +
  missingCriticalData(JSON). Unique `(business_id, period_start, period_end)`.
- `owner_operations_cycles` — healthScore, riskScore, opportunityScore,
  dataConfidenceScore, operationsState, sequenceNumber (unique per business),
  snapshot FK. Engine recomputes derived metrics from the snapshot (single source
  of truth), so no derived-metric columns are stored.
- `owner_operations_findings` / `_actions` / `_verifications` — match the Spine
  `OwnerFinding` / `OwnerAction` / `OwnerVerification` shapes, workspace- and
  business-scoped with indexes.
- Every model carries `id` (UUID), `workspaceId`, `businessId`, `createdAt`,
  `updatedAt`, and `status` where relevant (execution.md §23.2).

## 4. Verification (local — no DB writes)

| Gate | Result |
|---|---|
| `npx prisma validate` | valid 🚀 (5 new models) |
| `npx prisma generate` | Prisma Client regenerated, no errors |
| `npm run build` | Compiled successfully |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 / 1153 — no increase) |
| `npm test` | full suite — see status report (0 failed) |

`npx prisma migrate status` against a real DB is **not** run locally (no DB env);
it runs inside the migration workflow.

## 5. Additivity / safety proof

- The migration SQL contains only `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, and
  `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` on the **new** operations tables.
- No statement touches any existing table; back-relations are virtual Prisma
  fields (no DDL).
- FKs to `owner_businesses` use `ON DELETE CASCADE`; the cycle→snapshot FK uses
  `ON DELETE RESTRICT`, matching the finance/cashflow/sales precedent.

## 6. MANUAL GATE — STOP

To apply (after merging to `main`, since the workflow must be on the default
branch to dispatch):

> Run the **Module 4 Operations Migration** workflow (`workflow_dispatch`) with
> target `staging` (the DB the deployed app uses — same target as the proven
> Module 2/3/5 migrations) and confirm = `APPLY_MODULE4_OPERATIONS_MIGRATION`.
> Requires the `MIGRATION_DATABASE_URL` secret.

After the migration is applied, the next slice is **Module 4 API + services** —
then UI + command-center integration, deployed runtime proof, and audit.

## 7. Module 1 / proven modules / public-SaaS

Module 1 unchanged. Module 2 finance + Module 3 sales + Module 5 cashflow
untouched. No existing table or route modified. Public/SaaS/billing/marketing
frozen.
