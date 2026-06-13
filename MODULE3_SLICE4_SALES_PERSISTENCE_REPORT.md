# Module 3 (Sales & Customer Intelligence) — Slice 4: Persistence Schema + Migration — Report

Status: **BUILT + LOCALLY VERIFIED — MIGRATION NOT YET APPLIED (manual gate).**
Additive Prisma schema (5 sales tables) + a fail-closed manual migration
workflow. **No migration was run by the agent** (execution.md §3: never
`prisma migrate deploy` against a real DB locally). Module 1 + Module 2 +
Module 5 + recovery untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Per execution.md §23 (SCHEMA step) the sales domain logic (engine + detector +
planner, Slices 1–3) is complete and unit-proven. The next contract step is
**SCHEMA**. Persisting requires a migration, which is a manual gate — so this
slice creates the schema, the migration SQL, and the manual migration workflow,
then stops for the migration to be applied.

## 2. Files created / changed

- `prisma/schema.prisma` — added 5 models (`OwnerSalesSnapshot`,
  `OwnerSalesCycle`, `OwnerSalesFinding`, `OwnerSalesAction`,
  `OwnerSalesVerification`) + 5 back-relations on `OwnerBusiness`. **Additive
  only** — no existing model altered.
- `prisma/migrations/20260613120000_module3_sales/migration.sql` — additive DDL:
  5 `CREATE TABLE`, indexes, and FKs to `owner_businesses` / sales parents.
  **No ALTER/DROP** on any existing table.
- `.github/workflows/module-3-sales-migrate.yml` — manual `workflow_dispatch`
  migration workflow (mirrors the proven Module 5 cashflow workflow): confirmation
  phrase `APPLY_MODULE3_SALES_MIGRATION`, fail-closed secret preflight, strips
  local `.env*`, informational pre-status, strict `migrate deploy` + post-status,
  no secret printing, no app deploy, no destructive command.

## 3. Schema design (mirrors Module 2/5 for spine uniformity)

- `owner_sales_snapshots` — raw `SalesSnapshotInput` fields (leads, qualifiedLeads,
  orders, revenue, averageOrderValue, newCustomers, repeatCustomers,
  lostCustomers, b2bProspects, b2bPipelineValue, b2bRevenue, b2cRevenue,
  complaints, discountAmount, refundAmount, staffCount) + period/currency/model/
  template + dataConfidenceScore + missingCriticalData(JSON). Unique
  `(business_id, period_start, period_end)`.
- `owner_sales_cycles` — healthScore, riskScore, opportunityScore,
  dataConfidenceScore, salesState, sequenceNumber (unique per business), snapshot
  FK. The engine recomputes derived metrics deterministically from the snapshot,
  so no derived-metric columns are stored (single source of truth).
- `owner_sales_findings` / `owner_sales_actions` / `owner_sales_verifications` —
  match the Spine `OwnerFinding` / `OwnerAction` / `OwnerVerification` shapes,
  workspace- and business-scoped with indexes.
- Every model carries `id` (UUID), `workspaceId`, `businessId`, `createdAt`,
  `updatedAt`, and `status` where relevant (execution.md §23.2).

## 4. Verification (local — no DB writes)

| Gate | Result |
|---|---|
| `npx prisma validate` | valid 🚀 (5 new models) |
| `npx prisma generate` | Prisma Client regenerated, no errors |
| `npm run build` | Compiled successfully |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm test` | full suite — see status report (0 failed) |

`npx prisma migrate status` against a real DB is **not** run locally (no DB env in
the sandbox). It runs inside the migration workflow.

## 5. Additivity / safety proof

- The migration SQL contains only `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, and
  `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` on the **new** sales tables.
- No statement touches `recovery_*`, `owner_metric_snapshots`, `owner_finance_*`,
  `owner_cashflow_*`, or `owner_businesses` columns (back-relations are virtual).
- FKs to `owner_businesses` use `ON DELETE CASCADE`; the cycle→snapshot FK uses
  `ON DELETE RESTRICT`, matching the finance/cashflow precedent.

## 6. MANUAL GATE — STOP

This slice ends here per execution.md (migration gate). To apply (after merging to
`main`, since the workflow must be on the default branch to dispatch):

> Run the **Module 3 Sales Migration** workflow (`workflow_dispatch`) with target
> `staging` (or `production`) and confirm = `APPLY_MODULE3_SALES_MIGRATION`. It
> requires the `MIGRATION_DATABASE_URL` secret (direct, non-pooler Neon URL).

After the migration is applied, the next slice is **Module 3 API + services** —
then UI + command-center integration, deployed runtime proof, and audit.

## 7. Module 1 / proven modules / public-SaaS

Module 1 unchanged (founder-recovery green). Module 2 finance + Module 5 cashflow
untouched. No recovery/finance/cashflow table or route modified. Public/SaaS/
billing/marketing frozen.
