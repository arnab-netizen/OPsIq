# Phase 4 — Item 1: Production schema-drift detection + migration runbook

**Date:** 2026-07-08
**Branch:** `claude/phase-4-production-schema-drift-readiness`
**Commit subject:** `Phase 4: add production schema drift readiness`
**Classification:** readiness/runtime work — honest drift detection + truthful smoke classification +
owner-run migration runbook. **No production migration run; no production DB touched; no secrets read
or changed; no Prisma schema change; no membership-read sweep.**

---

## A. Files created
- `src/lib/schema-drift.ts` — pure schema-drift classifier.
- `src/lib/__tests__/schema-drift.test.ts` — unit tests (no DB).
- `src/lib/__tests__/schema-drift.db.test.ts` — real-DB proof on an actual Prisma P2022.
- `docs/audits/2026-07-08-phase-4-production-schema-drift-readiness/FINAL_REPORT.md` (this)
- `docs/audits/2026-07-08-phase-4-production-schema-drift-readiness/SCHEMA_DRIFT_EVIDENCE.md`
- `docs/audits/2026-07-08-phase-4-production-schema-drift-readiness/MIGRATION_RUNBOOK.md`
- `docs/audits/2026-07-08-phase-4-production-schema-drift-readiness/EVIDENCE_LEDGER.json`

## B. Files changed
- `src/app/api/internal/demo-permission-proof/route.ts` — the GET catch now classifies a caught
  schema-drift error as `schema_drift` (with an operator-safe `schemaDrift` summary) instead of the
  misleading `membership_missing`; the `PermissionProofResponse` type gains a `schema_drift`
  classification and an optional `schemaDrift` detail object.
- `scripts/smoke-production-dashboard.ts` — the permission-proof failure branch now recognises a
  `schema_drift` classification and reports `BLOCKED_SCHEMA_DRIFT` (distinct exit code 2) with the
  missing column + introducing migration, instead of a bare generic failure. Never a fake pass.

## C. Schema changes
None. The repo Prisma schema is correct (it declares the columns). The drift is that the **deployed**
database is behind on migration `20260625120000_owner_mode_execution_tables`. No migration was added,
altered, or run.

## D. Drift detection added (backend logic)
`src/lib/schema-drift.ts` (pure; no DB, no fs, no secrets):
- `isSchemaDriftError(error)` — true for Prisma `P2022`, PostgreSQL `42703`, driver-adapter
  `ColumnNotFound`, or a `"column … does not exist"` message.
- `extractMissingColumn(error)` — `{ table, column }` from `meta.column`, the driver-adapter cause, or
  the message.
- `classifyDbRuntimeError(error)` — `{ kind: "schema_drift" | "other", table?, column?,
  introducedByMigration?, summary }`, mapping the missing column to the migration via
  `COLUMN_TO_MIGRATION` (the `workspace_memberships` columns added by `20260625120000`).
- `isSchemaDriftResponseBody(body)` — single source of truth for "does this proof response signal drift".

Wiring: `demo-permission-proof` GET catch calls `classifyDbRuntimeError` and returns `schema_drift`
truthfully. The summary is a constructed, secret-free string (no raw `error.message`, governance-safe).

## E. Truthful smoke classification
The smoke's classification contract is now: **PASS** only when the runtime DB contract is satisfied;
**BLOCKED_SCHEMA_DRIFT** (exit 2) when a required column is missing; **FAIL** (exit 1) on genuine
product failure. Schema drift never yields PASS and never fakes green — the run stays non-green until
the migration is applied, but now says *why* (missing column + migration) instead of mislabelling it.

## F. Acceptance criteria checklist
- [x] Inspected the production smoke failure path (`demo-permission-proof`, default-select membership read).
- [x] Identified the exact table/columns and the required migration (`20260625120000_owner_mode_execution_tables`).
- [x] Confirmed the migration is already in repo migrations, and is additive/non-destructive.
- [x] Confirmed app code (Prisma schema) assumes that migration.
- [x] Added a drift classifier distinguishing SCHEMA_DRIFT from product failure.
- [x] Made the smoke output truthful (PASS / BLOCKED_SCHEMA_DRIFT / FAIL); no silent pass on drift.
- [x] Produced an owner-run migration runbook.
- [x] Did not run the migration; no production creds required in CI; no secrets printed; no auth
      bypass; no membership check weakened; no `demo-permission-proof` faked success; no broad deploy
      tooling; no unrelated business logic; no Prisma schema change; no destructive/altered migration.
- [x] Tests: unit drift classifier + real-DB P2022 proof (19 tests pass locally).
- [x] Local validation: `tsc --noEmit` clean; `eslint` (0 new errors); governance scan (0 new);
      lint ratchet PASS.

## G. Known limitations
- The classifier's `COLUMN_TO_MIGRATION` manifest currently covers the `workspace_memberships` columns
  from `20260625120000` (the confirmed drift). It is a readiness signal, not an exhaustive schema map;
  extend it as new drift is diagnosed. Unmapped drift is still classified `schema_drift` (without a
  specific migration name).
- Only the `demo-permission-proof` GET path (the confirmed residual) was wired to emit `schema_drift`.
  Other default-select membership reads (e.g. `getPolicyContext`, other proof endpoints) will still
  surface the same drift; the same one-line wiring can be applied if/when they become the failing step.
  This is intentional minimal scope — not a sweep — and the true remediation for all of them is the
  single owner-run migration.
- The endpoint wiring is validated by the classifier tests (proving the exact error it receives is
  classified correctly) + `tsc`; the endpoint itself is gated by `OPSIQ_DIAGNOSTIC_KEY` + session and
  is exercised end-to-end by the production smoke, not by a unit test.

## H. Manual verification steps
1. `TEST_WITH_DB=true npx vitest run src/lib/__tests__/schema-drift.test.ts src/lib/__tests__/schema-drift.db.test.ts` → 19 passed.
2. `npx tsc --noEmit` → clean; `npm run governance:scan:strict` → 0 new; `npm run lint:ratchet` → PASS.
3. Drift reproduction: seed a membership, `ALTER TABLE workspace_memberships DROP COLUMN primary_auth_method`,
   run a bare `findFirst` → P2022; `classifyDbRuntimeError(err)` → `schema_drift` mapped to
   `20260625120000_owner_mode_execution_tables`; restore the column.

## I. Trigger map
Deployed DB missing a `workspace_memberships` column → default-select read (`demo-permission-proof`,
`getPolicyContext`, …) throws P2022 → `classifyDbRuntimeError` → `demo-permission-proof` returns
`schema_drift` → smoke prints `BLOCKED_SCHEMA_DRIFT` (exit 2) with the missing column + migration.

## J. Failure modes covered
- Drift-induced 500 mislabelled as `membership_missing` — fixed (now `schema_drift`).
- Smoke reporting drift as a generic FAIL or (worse) hiding it — fixed (distinct, truthful state).
- Faking green on drift — prevented (drift never yields PASS; exit non-zero).

## K. Events emitted
None. Classification is a read-only diagnostic; no audit/canonical events added or changed.

## L. Automated tests added
- `src/lib/__tests__/schema-drift.test.ts` (unit) — error-shape detection, column extraction, migration
  mapping, response-body helper, manifest coverage.
- `src/lib/__tests__/schema-drift.db.test.ts` (real DB) — drops a column, classifies the ACTUAL P2022.

## M. Next
After merge + main green → Phase 4 Item 2 (`claude/phase-4-post-migration-proof-plan`): a
verification-only post-migration proof plan + owner approval gate. **No production migration runs
without the owner's explicit approval.**
