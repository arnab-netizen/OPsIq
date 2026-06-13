# Module 6 (Marketing & Growth Intelligence) — Slice 4: Persistence + Migration — Report

Status: **MIGRATION GATE — workflow created, awaiting manual run.** Additive Prisma
models + an additive `CREATE TABLE` migration + a manual fail-closed migrate
workflow. Per the migration-gate rule, this slice creates the workflow and
**stops**; the owner (arnab-netizen) runs it (the GitHub App is 403-blocked from
`workflow_dispatch`). Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. What this slice delivers

- **Schema** (`prisma/schema.prisma`, additive only): 5 new models —
  `OwnerMarketingSnapshot`, `OwnerMarketingCycle`, `OwnerMarketingFinding`,
  `OwnerMarketingAction`, `OwnerMarketingVerification` — plus 5 virtual
  back-relations on `OwnerBusiness`. They mirror the proven sales/sop persistence
  shape (cycle carries health/risk/opportunity/dataConfidence + `marketingState`;
  action carries the status-machine fields + completion evidence; verification
  carries before/after + target direction). `prisma validate` → valid; diff is
  **+172 lines, 0 deletions** (no reformat churn; no change to any existing model).
- **Migration** (`prisma/migrations/20260613170000_module6_marketing/migration.sql`):
  `CREATE TABLE` ×5 + `CREATE INDEX` + `ADD CONSTRAINT` (FK) only. **No ALTER/DROP**
  on any existing table; `owner_businesses` is referenced by FK only.
- **Workflow** (`.github/workflows/module-6-marketing-migrate.yml`): manual
  `workflow_dispatch`, fail-closed confirm phrase `APPLY_MODULE6_MARKETING_MIGRATION`,
  target `staging`/`production`, secret preflight, strips local `.env`, `prisma
  migrate deploy`, status before/after. Does not deploy the app; runs no
  destructive command.

## 2. Honesty / governance

- Additive only — no existing recovery/finance/cashflow/sales/operations/sop table
  or any existing model touched (verified by the +172/-0 schema diff).
- No command-center read of `owner_marketing_*` is introduced in this slice, so
  merging to `main` cannot 500 the proven command center (that read lands in Slice
  6, after the tables exist).
- The migrate workflow is fail-closed (confirm phrase + secret preflight) and
  prints no secrets.

## 3. Verification (local)

| Gate | Result |
|---|---|
| `npx prisma validate` | valid 🚀 |
| `npx prisma generate` | client generated (7.8.0) with the 5 OwnerMarketing* models |
| schema diff | +172 insertions, 0 deletions (additive; no reformat churn) |
| `npx vitest run owner-marketing + founder-recovery` | 74 passed / 8 skipped (marketing 36 + Module 1 38) |
| `npm run build` | REAL_EXIT=0, `.next/BUILD_ID` written |
| workflow YAML parse | valid |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 4. Gate status

**Migration gate reached — stop.** Next: this slice is merged to `main` so the
workflow is visible; the owner runs **Module 6 Marketing Migration** with target
`staging` and confirm `APPLY_MODULE6_MARKETING_MIGRATION`. Once applied, Slice 5
(API + services) builds the persisted marketing loop. Public/SaaS stays frozen.
