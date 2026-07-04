# Module 7 (SOP, Process & Execution Accountability) — Slice 4: Persistence + Migration — Report

Status: **MIGRATION GATE — workflow created, awaiting manual run.** Additive
Prisma models + an additive `CREATE TABLE` migration + a manual fail-closed
migrate workflow. Per the migration-gate rule, this slice creates the workflow and
**stops**; the owner (arnab-netizen) runs it (the GitHub App is 403-blocked from
`workflow_dispatch`). Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. What this slice delivers

- **Schema** (`prisma/schema.prisma`, additive only): 5 new models —
  `OwnerSopSnapshot`, `OwnerSopCycle`, `OwnerSopFinding`, `OwnerSopAction`,
  `OwnerSopVerification` — plus 5 virtual back-relations on `OwnerBusiness`. They
  mirror the proven operations persistence shape (cycle carries
  health/risk/opportunity/dataConfidence + `executionState`; action carries the
  status machine fields + completion evidence; verification carries before/after +
  target direction). `prisma validate` → valid; diff is **+169 lines, 0 deletions**
  (no reformat churn; no change to any existing model).
- **Migration** (`prisma/migrations/20260613150000_module7_sop/migration.sql`):
  `CREATE TABLE` ×5 + `CREATE INDEX` + `ADD CONSTRAINT` (FK) only. **No
  ALTER/DROP** on any existing table; `owner_businesses` is referenced by FK only.
- **Workflow** (`.github/workflows/module-7-sop-migrate.yml`): manual
  `workflow_dispatch`, fail-closed confirm phrase `APPLY_MODULE7_SOP_MIGRATION`,
  target `staging`/`production`, secret preflight, strips local `.env` so the
  `MIGRATION_DATABASE_URL` secret is the sole datasource, `prisma migrate deploy`,
  status before/after. Does not deploy the app; runs no destructive command.

## 2. Honesty / governance

- Additive only — no existing recovery/finance/cashflow/sales/operations table or
  any existing model touched (verified by the +169/-0 schema diff).
- No command-center read of `owner_sop_*` is introduced in this slice, so merging
  to `main` cannot 500 the proven command center (that read lands in Slice 6,
  after the tables exist).
- The migrate workflow is fail-closed (confirm phrase + secret preflight) and
  prints no secrets.

## 3. Verification (local)

| Gate | Result |
|---|---|
| `npx prisma validate` | valid 🚀 |
| `npx prisma generate` | client generated (7.8.0) with the 5 OwnerSop* models |
| schema diff | +169 insertions, 0 deletions (additive; no reformat churn) |
| `npx vitest run owner-sop + founder-recovery` | 72 passed / 8 skipped (owner-sop 34 + Module 1 38) |
| `npm run build` | REAL_EXIT=0, `.next/BUILD_ID` written |
| `npm run lint:ratchet` | see status (schema-only change; TS lint unaffected) |

## 4. Gate status

**Migration gate reached — stop.** Next: this slice is merged to `main` so the
workflow is visible; the owner runs **Module 7 SOP Migration** with target
`staging` and confirm `APPLY_MODULE7_SOP_MIGRATION`. Once applied, Slice 5 (API +
services) builds the persisted execution loop. Public/SaaS stays frozen.
