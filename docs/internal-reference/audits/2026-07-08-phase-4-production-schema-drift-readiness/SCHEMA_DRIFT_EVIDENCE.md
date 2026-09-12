# SCHEMA DRIFT EVIDENCE — Phase 4 Item 1

**Date:** 2026-07-08 · **Branch:** `claude/phase-4-production-schema-drift-readiness`

## 1. The production observation (main `725998a4`, smoke run 28982236484)
```
0️⃣ A GET /api/internal/build-info            → 200 (Environment: production; deployed commit matches)
0️⃣ B GET /api/internal/engagements-route-proof→ 200
1️⃣  POST /api/auth/login                      → 200  ✓ Session established   ← Phase 3 login fix works
2️⃣  GET /                                      → 200  ✓ Dashboard page loaded
2️⃣·5️⃣ GET /api/internal/demo-permission-proof → 500  ❌ PERMISSION_PROOF_ENDPOINT_FAILED
```
The failure moved from login (Phase 3) to `demo-permission-proof` — the next default-select
`workspace_memberships` read.

## 2. The failing read
`src/app/api/internal/demo-permission-proof/route.ts` (GET) runs:
```ts
const membership = await db.workspaceMembership.findFirst({
  where: { userId: user.id, isActive: true },
  orderBy: { addedAt: "asc" },
});   // bare findFirst → selects EVERY column
```
A bare `findFirst` selects all columns. When the deployed DB is missing any newer column, Prisma throws.

## 3. Which migration is required
Migration **`20260625120000_owner_mode_execution_tables`** (present in-repo) adds these
`workspace_memberships` columns (additive; `ADD COLUMN IF NOT EXISTS`, nullable/defaulted):
```
accepted_at, allowed_task_types, authority_limits, created_by_owner_id, designation,
invitation_status, invited_at, manager_id, offboarded_at, primary_auth_method, suspended_at
```
The repo Prisma schema (`model WorkspaceMembership`) declares all of these — so **app code assumes the
migration**. If production has not applied it, every default-select read of the table throws.

## 4. Real-DB reproduction of the error class (no mocks)
Against a real Postgres, seeding a membership and dropping one such column to simulate the deployed
drift, then running the bare `findFirst`:
```
CODE: P2022 | name: PrismaClientKnownRequestError
meta: { modelName: "WorkspaceMembership",
        driverAdapterError: { cause: { originalCode: "42703",
          originalMessage: "column workspace_memberships.primary_auth_method does not exist",
          kind: "ColumnNotFound",
          column: "workspace_memberships.primary_auth_method" } } }
```
This is Prisma `P2022` / PostgreSQL `42703` / `ColumnNotFound` — the exact drift signature.

## 5. Why the old signal was misleading
`demo-permission-proof`'s catch returned `classification: "membership_missing"` for **any** error —
so a schema-drift 500 was reported as a permission/membership problem. That is a false classification:
the membership row exists; a *column* is missing because a migration is unapplied.

## 6. What Phase 4 Item 1 adds (honest classification)
- A pure classifier `src/lib/schema-drift.ts` that recognises the `P2022` / `42703` / `ColumnNotFound`
  signature, extracts the missing `table.column`, and maps it to the introducing migration.
- `demo-permission-proof` now classifies a caught drift error as `schema_drift` (with an operator-safe
  `schemaDrift` summary: table, column, `introducedByMigration`), instead of `membership_missing`.
- The production smoke now recognises a `schema_drift` classification and prints a
  `BLOCKED_SCHEMA_DRIFT` result (distinct exit code 2), never a fake pass and never a misleading
  generic FAIL.

## 7. Proof the classifier works on the REAL error
`src/lib/__tests__/schema-drift.db.test.ts` drops `workspace_memberships.primary_auth_method`, captures
the actual thrown Prisma error, and asserts `classifyDbRuntimeError(err)` →
`{ kind: "schema_drift", table: "workspace_memberships", column: "primary_auth_method",
introducedByMigration: "20260625120000_owner_mode_execution_tables" }`. Unit tests
(`schema-drift.test.ts`) cover the error shapes and the manifest. **19 tests pass** locally.

## 8. Classification contract (truthful smoke)
- **PASS** — only when the runtime DB contract is satisfied (endpoints return their expected 2xx).
- **BLOCKED_SCHEMA_DRIFT** — a required column is missing (deployed DB behind on a migration). Exit 2.
- **FAIL** — genuine product/logic failure. Exit 1.
Schema drift never yields PASS; the smoke stays non-green until the migration is applied.
