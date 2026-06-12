# Module 5 (Cashflow Intelligence) — Slice 4: Persistence Schema + Migration — Report

Status: **BUILT + LOCALLY VERIFIED — MIGRATION NOT YET APPLIED (manual gate).**
Additive Prisma schema (5 cashflow tables) + a fail-closed manual migration
workflow. **No migration was run by the agent** (execution.md §3: never
`prisma migrate deploy` against a real DB locally). Module 1 + Module 2 + recovery
untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Per execution.md §22 Phase 6 (Cashflow) and §23 per-module build contract
(SPEC → SCHEMA → DOMAIN LOGIC → API → UI → …), the Cashflow domain logic
(engine + detector + planner, Slices 1–3) is complete and unit-proven. The next
contract step is **SCHEMA**. Persisting requires a migration, which is a manual
gate — so this slice creates the schema, the migration SQL, and the manual
migration workflow, then stops for the migration to be applied.

## 2. Files created / changed

- `prisma/schema.prisma` — added 5 models (`OwnerCashflowSnapshot`,
  `OwnerCashflowCycle`, `OwnerCashflowFinding`, `OwnerCashflowAction`,
  `OwnerCashflowVerification`) + 5 back-relations on `OwnerBusiness`. **Additive
  only** — no existing model altered.
- `prisma/migrations/20260612120000_module5_cashflow/migration.sql` — additive
  DDL: 5 `CREATE TABLE`, indexes, and FKs to `owner_businesses` /
  cashflow parents. **No ALTER/DROP** on any existing table.
- `.github/workflows/module-5-cashflow-migrate.yml` — manual `workflow_dispatch`
  migration workflow (mirrors the proven Module 2 finance workflow): confirmation
  phrase `APPLY_MODULE5_CASHFLOW_MIGRATION`, fail-closed secret preflight, strips
  local `.env*`, informational pre-status, strict `migrate deploy` + post-status,
  no secret printing, no app deploy, no destructive command.

## 3. Schema design (mirrors Module 2 finance for spine uniformity)

- `owner_cashflow_snapshots` — raw `CashflowSnapshotInput` fields (cashInHand,
  bankBalance, dailyCollections, receivables, receivablesOverdue, payables,
  payablesOverdue, upcomingEmi, rentDue, salaryDue, vendorDue, taxDue,
  ownerWithdrawal) + period/currency/model/template + dataConfidenceScore +
  missingCriticalData(JSON). Unique `(business_id, period_start, period_end)`.
- `owner_cashflow_cycles` — healthScore, dangerScore, opportunityScore,
  dataConfidenceScore, cashflowState, sequenceNumber (unique per business),
  snapshot FK. Engine recomputes derived metrics deterministically from the
  snapshot, so no derived-metric columns are stored (no duplicate source of truth).
- `owner_cashflow_findings` / `owner_cashflow_actions` /
  `owner_cashflow_verifications` — match the Spine `OwnerFinding` / `OwnerAction` /
  `OwnerVerification` shapes (same columns as finance), all workspace- and
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
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npx vitest run src/__tests__/founder-recovery/` | Module 1 green (unchanged) |
| `npx vitest run src/__tests__/owner-cashflow/` | 41 cashflow domain tests green |
| `npm test` | full suite — see status report (0 failed) |

`npx prisma migrate status` against a real DB is **not** run locally (no DB env in
sandbox; would require the migration target). It runs inside the migration
workflow.

## 5. Additivity / safety proof

- The migration SQL contains only `CREATE TABLE`, `CREATE [UNIQUE] INDEX`, and
  `ALTER TABLE … ADD CONSTRAINT … FOREIGN KEY` on the **new** cashflow tables.
- No statement touches `recovery_*`, `owner_metric_snapshots`, `owner_finance_*`,
  or `owner_businesses` columns (the back-relations are virtual Prisma fields and
  emit no DDL).
- FKs to `owner_businesses` use `ON DELETE CASCADE`; the cycle→snapshot FK uses
  `ON DELETE RESTRICT` (a snapshot with a cycle cannot be silently dropped),
  matching the finance precedent.

## 6. MANUAL GATE — STOP

This slice ends here per execution.md (migration gate). To apply:

> Run the **Module 5 Cashflow Migration** workflow (`workflow_dispatch`) with
> target `staging` (or `production`) and confirm =
> `APPLY_MODULE5_CASHFLOW_MIGRATION`. It requires the `MIGRATION_DATABASE_URL`
> secret (direct, non-pooler Neon URL). **Rotate the previously-exposed Neon
> credential first if not already done.**

After the migration is applied, the next slice is **Module 5 API + services**
(snapshot intake, diagnosis-cycle persistence, action status machine,
verification) — then UI + command-center integration, deployed runtime proof,
and audit.

## 7. Module 1 / proven modules / public-SaaS

Module 1 unchanged (founder-recovery green). Module 2 finance untouched. No
recovery/finance table or route modified. Public/SaaS/billing/marketing remain
frozen.
