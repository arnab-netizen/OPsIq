# Module 8 (Strategy & Scenario Planning) — Slice 4: Persistence + Migration — Report

Status: **MIGRATION GATE — workflow created, awaiting manual run.** Additive Prisma
models + an additive `CREATE TABLE` migration + a manual fail-closed migrate
workflow. Per the migration-gate rule, this slice creates the workflow and
**stops**; the owner (arnab-netizen) runs it. Module 1 + all proven modules
untouched. Public/SaaS frozen.

## 1. What this slice delivers

- **Schema** (`prisma/schema.prisma`, additive only): 5 new models —
  `OwnerStrategySnapshot` (one scenario option's inputs), `OwnerStrategyCycle`,
  `OwnerStrategyFinding`, `OwnerStrategyAction`, `OwnerStrategyVerification` — plus
  5 virtual back-relations on `OwnerBusiness`. Cycle carries
  health/risk/opportunity/dataConfidence + `strategyState`; action carries the
  status-machine fields + completion evidence; verification carries before/after +
  target direction. `prisma validate` → valid; diff is **+169 lines, 0 deletions**.
- **Migration** (`prisma/migrations/20260613190000_module8_strategy/migration.sql`):
  `CREATE TABLE` ×5 + `CREATE INDEX` + `ADD CONSTRAINT` (FK) only. **No ALTER/DROP**
  on any existing table; `owner_businesses` is referenced by FK only.
- **Workflow** (`.github/workflows/module-8-strategy-migrate.yml`): manual
  `workflow_dispatch`, fail-closed confirm phrase `APPLY_MODULE8_STRATEGY_MIGRATION`,
  target `staging`/`production`, secret preflight, strips local `.env`, `prisma
  migrate deploy`, status before/after. Does not deploy the app; runs no
  destructive command.

## 2. Honesty / governance

- Additive only — no existing recovery/finance/cashflow/sales/operations/sop/
  marketing table or any existing model touched (verified by the +169/-0 diff).
- No command-center read of `owner_strategy_*` is introduced in this slice, so
  merging to `main` cannot 500 the proven command center (that read lands in Slice
  6, after the tables exist).
- The migrate workflow is fail-closed (confirm phrase + secret preflight) and
  prints no secrets.

## 3. Verification (local)

| Gate | Result |
|---|---|
| `npx prisma validate` | valid 🚀 |
| `npx prisma generate` | client generated (7.8.0) with the 5 OwnerStrategy* models |
| schema diff | +169 insertions, 0 deletions (additive; no reformat churn) |
| `npx vitest run owner-strategy + founder-recovery` | 73 passed / 8 skipped (strategy 35 + Module 1 38) |
| `npm run build` | REAL_EXIT=0, `.next/BUILD_ID` written |
| workflow YAML parse | valid |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |

## 4. Gate status

**Migration gate reached — stop.** Next: this slice is merged to `main` so the
workflow is visible; the owner runs **Module 8 Strategy Migration** with target
`staging` and confirm `APPLY_MODULE8_STRATEGY_MIGRATION`. Once applied, Slice 5
(API + services) builds the persisted scenario loop. Public/SaaS stays frozen.
