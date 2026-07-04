# Module 2 — Slice 5 — Finance Persistence (Schema + Manual Migration) — Report

Status: **Slice 5 COMPLETE (schema + additive migration + manual workflow + DB-gated
test).** No real/staging/production migration was run. Module 1 unchanged.
Public/SaaS frozen.

## 1. Models added (additive, finance-specific)

`prisma/schema.prisma` — 5 new models (own `@@map` snake_case tables), all reusing
`OwnerBusiness` via FK:
- `OwnerFinancialSnapshot` (`owner_financial_snapshots`) — period + currency +
  businessModelType/industryTemplate + all SPEC §3 finance inputs (nullable) +
  `dataConfidenceScore` + `missingCriticalData` (Json). Unique
  `[businessId, periodStart, periodEnd]`; indexes on workspaceId, businessId,
  periodEnd.
- `OwnerFinanceCycle` (`owner_finance_cycles`) — sequenceNumber, status, health/
  survivalRisk/growthOpportunity/dataConfidence scores, survivalState, generatedAt.
  Unique `[businessId, sequenceNumber]`; indexes workspaceId/businessId/snapshotId.
- `OwnerFinanceFinding` (`owner_finance_findings`) — findingType/code/title/summary/
  sourceMetric/sourceValue/threshold/severity/confidence/impactScore/urgencyScore/
  evidence(Json)/missingData(Json)/verificationMetric. Indexes workspaceId/
  businessId/cycleId/code/severity.
- `OwnerFinanceAction` (`owner_finance_actions`) — recommendationCode/findingCode/
  status/priorityScore/effortScore/expectedImpactScore/confidence/verification*/
  expectedTimeframeDays/dueAt/assignedTo/completedAt/completionNotes/
  completionEvidence(Json). Indexes workspaceId/businessId/cycleId/status/
  priorityScore.
- `OwnerFinanceVerification` (`owner_finance_verifications`) — verificationMetric/
  beforeValue/afterValue/targetDirection/targetValue/status/confidence/
  evidence(Json)/verifiedAt. Indexes workspaceId/businessId/actionId/status.

`OwnerBusiness` gained **5 virtual back-relation fields** only (`financeSnapshots`,
`financeCycles`, `financeFindings`, `financeActions`, `financeVerifications`) — these
emit **no DDL** (no column change to `owner_businesses`); Prisma requires them for the
declared FKs, which the task explicitly permits ("read-only relation field required by
Prisma and safe").

Design notes: `businessModelType`/`industryTemplate` are nullable (SPEC §15/§16 treat
them optional; missing data must be representable). `verifiedAt` is nullable (pending
verifications have none, mirroring Module 1). Counts use `DOUBLE PRECISION` matching
`owner_metric_snapshots`. No `version` column (not in the required field list).

## 2. Migration path

`prisma/migrations/20260611120000_module2_finance/migration.sql` — hand-authored
(matching Module 1's style) because the sandbox cannot reach a shadow DB to run
`prisma migrate dev` (TCP 5432 blocked). It creates the 5 tables, all indexes/unique
constraints, and all FKs.

## 3. Workflow path

`.github/workflows/module-2-finance-migrate.yml` — "Module 2 Finance Migration":
manual `workflow_dispatch` only; inputs `target` (staging/production) + `confirm`
(must equal `APPLY_MODULE2_FINANCE_MIGRATION`, fail-closed); uses
`MIGRATION_DATABASE_URL`; removes local `.env*`; `prisma validate`; **informational**
pre-deploy `migrate status` (non-zero pending is expected, doesn't abort); **strict**
`prisma migrate deploy`; **strict** post-deploy `migrate status`. No app deploy, no
destructive commands, no secrets printed.

## 4. Confirmation: additive only

Confirmed. The migration contains **5 `CREATE TABLE`**, index/constraint creates, and
**10 `ADD CONSTRAINT ... FOREIGN KEY`** — all on the new finance tables. **No DROP**,
no column alter. FKs reference `owner_businesses`/finance tables as targets without
altering them.

## 5. Confirmation: no recovery table mutation

Confirmed. No `ALTER TABLE`/`DROP` targets `recovery_*` or `owner_metric_snapshots`
or `owner_businesses` (verified by grep). `owner_businesses` gets only virtual Prisma
back-relations (no DDL).

## 6. Confirmation: no real DB migration run

Confirmed. No `prisma migrate deploy`/`db push`/`migrate reset` was run locally or
against any real/staging/production DB. Only offline `prisma validate` + `prisma
generate`.

## 7. Tests added

`src/__tests__/owner-finance/persistence.db.test.ts` — `[db]`-gated (skipped by normal
`npm test`; runs only under `TEST_WITH_DB=true` against a migrated DB). Writes
snapshot → cycle → finding → action → verification directly via the `db` proxy and
asserts: FK relations resolve, the unique period constraint rejects duplicates,
workspace-scoping columns persist, `action.status="proposed"`,
`verification.status="unverified"`, and business-delete cascades the finance rows.
(No finance service layer yet — that is Slice 6 — so the test writes directly.)

## 8. Verification commands and results

| Command | Result |
|---|---|
| `npx prisma validate` | valid 🚀 |
| `npx prisma generate` | Generated Prisma Client 7.8.0 |
| additive-only grep (no ALTER/DROP on existing tables) | confirmed |
| YAML parse (workflow) | OK |
| `npx eslint` (new test) | clean |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500; `changed_file_lint_errors: 0`) |
| `npm run build` | Compiled successfully |
| owner-finance + spine + founder-recovery suites | 115 passed |
| `npm test` | 197 files passed, **0 failed**; 5550 passed; `[db]` finance test skipped (16 skipped) |

The DB-gated persistence test was **not** run locally (no reachable DB — out of
scope). CI test workflows apply all migrations (incl. this one) to an ephemeral
Postgres, so it runs there under `TEST_WITH_DB=true`.

## 9. Manual migration run instructions

GitHub → Actions → **"Module 2 Finance Migration"** → **Run workflow** → branch
`main` → `target: staging` (recommended first) → `confirm:
APPLY_MODULE2_FINANCE_MIGRATION`. Precondition: `MIGRATION_DATABASE_URL` secret =
rotated Neon **direct (non-pooler)** URL. The job validates, shows pending status
(informational), runs `migrate deploy`, then strict post-status. It does not deploy
the app.

## 10. Whether Slice 6 can start

**Slice 6 (API routes) implementation can start now** — the schema + generated client
exist, and CI test workflows auto-apply this migration to their ephemeral Postgres, so
DB-backed route/persistence tests work in CI immediately. The **deployed-app runtime
proof** (Slice 9) must wait until the **manual finance migration is applied to
staging** via the workflow above. Recommended: apply the staging migration before/at
Slice 6's integration step.

## 11. Public/SaaS frozen confirmation

Confirmed — no public/SaaS/billing/marketing files touched.
