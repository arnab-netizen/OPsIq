# Phase 6C Wave 2 — `src/__tests__/api/actions.test.ts` placebo inventory

**Date:** 2026-07-10
**Branch:** `claude/phase-6c-wave-2-actions-placebo-conversion`
**Target file:** `src/__tests__/api/actions.test.ts`
**Prior state:** ~121 placebo tests — comment-only `TODO_A2_FAKE_TEST_QUARANTINED` bodies (assert nothing) and
`expect(true).toBe(true)` — plus 3 real schema-contract regression tests. The file imported the real
`createAction`/`listActions` symbols but never called them, so real breakage stayed green.

## Product defect uncovered while converting (fixed in this PR)

| Site | Defect | Class | Fix | Proof |
|---|---|---|---|---|
| `src/services/action.ts` `listActions` (line 515) | `assignedTo` filter mapped onto `where.owner`; the Action model has no `owner` column → every call with an `assignedTo` filter threw `PrismaClientValidationError` (raw 500) | phantom-column raw-500 (read path) | `where.owner` → `where.assignedTo` | Fail-before: reverting the one line makes the `assignedTo`-filter test throw `Unknown argument \`owner\``. Pass-after: filtered result returned. Both against real Postgres. |

Scope note: this is the same phantom-column class as Phase 6C-F2 (createAction was already correct — a
confirmed FALSE_POSITIVE for the raw-500-**create** class; it explicitly sets `id`/`updatedAt`/`status`).
The `owner` bug is a **read/list** phantom column, distinct from the create sweep.

## Converted to real assertions (13 tests)

Backed by the real services; DB tests gated by `TEST_WITH_DB=true` (real Postgres, no Prisma mocks; audit
and event emission left **un-mocked** so the governed write path is exercised end to end).

### No-DB, fail-closed input validation (4)
- `createAction` rejects missing auth context (`requireServiceContext` → UnauthorizedError, before any DB).
- `createAction` rejects missing workspace context (before any DB).
- `listActions` rejects missing/invalid workspace id (`enforceWorkspaceId`).
- `listActions` requires `engagementId` (Action has no direct workspace column → ValidationError).

### `[db]` real create + list (7)
- `createAction` persists a real **draft** action scoped to engagement/workspace; asserts persisted row
  (status `draft` set by service, `engagementId`, `recommendationId`, `updatedAt`) **and** a real
  `ACTION_CREATED` audit event with the correct `actorId`.
- `createAction` rejects an engagement in another workspace → `NotFoundError` (tenant isolation).
- `createAction` replays a duplicate idempotency key → same action id, exactly one row (no duplicate).
- `listActions` returns a real `items` + `pagination` DTO shape scoped to the engagement.
- `listActions` does not leak another workspace's engagement actions; a spoofed foreign `engagementId`
  under my workspace returns zero rows (relation filter `engagement.workspaceId`).
- `listActions` `status` filter narrows without leaking other statuses.
- `listActions` `assignedTo` filter returns the matching action — **regression proof for the `owner` fix**.

### Real schema-contract regression tests (2, preserved/tightened)
- `dueDate` (API) → `dueAt` (Prisma) mapping.
- `priority` is not an Action column; extended to also assert `owner` is not a column (the phantom the bug used).

## Deferred — NOT faked here (documented, not converted)

These placebos reference surfaces with no service symbol imported here and no HTTP/middleware harness in
this repo's unit layer. Faking them would reproduce exactly the vacuous-green problem this phase removes.

| Placebo group (original) | Why deferred |
|---|---|
| HTTP header enforcement (`x-workspace-id`, `Idempotency-Key` required), auth 401 / capability 403 | Enforced in `withCanonicalEnforcement` / `withAuth` route wrappers. No HTTP request harness at the unit layer; the repo's own "real route test" skips these. Route-wrapper coverage tracked separately (Phase 6E-auth `withAuth` migration). |
| Zod body validation (UUID/enum/min-length 400s) | Lives in the route handler schema, not the service. No route invocation here. |
| `GET /api/actions/[actionId]` (single get, 404, cross-ws 403) | No service symbol imported; single-get service path out of Wave 2 scope. |
| `PATCH /api/actions/[actionId]` (update, optimistic-lock 409, state machine) | `updateActionStatus` state machine is covered by `action-lifecycle` tests; HTTP wrapper deferred. |
| `POST .../start`, `.../complete`, `.../impact-delta` | Separate lifecycle/outcome services, out of the create/list Wave 2 scope. |
| `GET /api/engagements/[engagementId]/actions` | `getActionsForEngagement` — separate route/service; not the `api/actions` cluster. |
| `listActions` `recommendationId` filter | `listActions` does not implement a `recommendationId` filter (only `engagementId`/`status`/`assignedTo`). Not faked; noted as an unimplemented filter (route-level concern, no defect in scope). |
| DTO internal-field redaction | `listActions` returns raw rows; a `PublicActionDTO` redaction layer does not exist at the service boundary. No behavior to assert without inventing it. |

## Result
121 placebos → 13 real assertions + 2 preserved real contract tests; 0 `expect(true).toBe(true)` remain;
0 `TODO_A2_FAKE_TEST_QUARANTINED` remain. One confirmed owner-facing product defect fixed and regression-locked.
