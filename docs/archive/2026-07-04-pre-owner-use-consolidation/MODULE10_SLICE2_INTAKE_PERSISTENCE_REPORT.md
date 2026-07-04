# Module 10 (Connectors & Data Intake) — Slice 2: Persistence + Migration — Report

Status: **MIGRATION GATE — workflow created, awaiting manual run.** Additive Prisma
model + an additive `CREATE TABLE` migration + a manual fail-closed migrate
workflow. Per the migration-gate rule, this slice creates the workflow and
**stops**; the owner (arnab-netizen) runs it. Module 1 + all proven modules
untouched. Public/SaaS frozen.

## 1. What this slice delivers

- **Schema** (`prisma/schema.prisma`, additive only): 1 new model
  `OwnerDataIntake` — stores the deterministic intake candidate (source,
  targetDomain, rowCount, validation/normalization status, mappedFields,
  unmappedColumns, normalized records JSON, error report JSON) plus the
  owner-confirmation fields (`ownerConfirmed` default false, confirmedAt,
  confirmedBy). Plus 1 virtual `OwnerBusiness.dataIntakes` back-relation. Encodes
  the §17 requirement that connector data is held as a candidate until the owner
  confirms. `prisma validate` → valid; diff is **+36 lines, 0 deletions**.
- **Migration** (`prisma/migrations/20260613210000_module10_data_intake/migration.sql`):
  `CREATE TABLE` + `CREATE INDEX` + `ADD CONSTRAINT` (FK) only. **No ALTER/DROP**
  on any existing table; `owner_businesses` is referenced by FK only.
- **Workflow** (`.github/workflows/module-10-data-intake-migrate.yml`): manual
  `workflow_dispatch`, fail-closed confirm phrase
  `APPLY_MODULE10_DATA_INTAKE_MIGRATION`, target `staging`/`production`, secret
  preflight, strips local `.env`, `prisma migrate deploy`, status before/after.

## 2. Honesty / governance

- Additive only — no existing table or model touched (verified by the +36/-0 diff).
- `ownerConfirmed` defaults to false in the schema — the persistence layer cannot
  auto-confirm connector data (execution.md §17).
- The migrate workflow is fail-closed (confirm phrase + secret preflight) and
  prints no secrets.

## 3. Verification (local)

| Gate | Result |
|---|---|
| `npx prisma validate` | valid 🚀 |
| `npx prisma generate` | client generated with the OwnerDataIntake model |
| schema diff | +36 insertions, 0 deletions (additive) |
| `npx vitest run owner-intake + founder-recovery` | 52 passed / 8 skipped (intake 14 + Module 1 38) |
| `npm run build` | REAL_EXIT=0, `.next/BUILD_ID` written |
| workflow YAML parse | valid |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |

## 4. Gate status

**Migration gate reached — stop.** Next: this slice is merged to `main` so the
workflow is visible; the owner runs **Module 10 Data Intake Migration** with target
`staging` and confirm `APPLY_MODULE10_DATA_INTAKE_MIGRATION`. Once applied, Slice 3
(API + services: upload → candidate → owner confirm) builds the persisted intake
loop. Public/SaaS stays frozen.
