# Phase 6C Wave 2 — Final Report: `api/actions` placebo conversion

**Date:** 2026-07-10
**Branch:** `claude/phase-6c-wave-2-actions-placebo-conversion`
**Base:** `110ce29` (Phase 6C-F2, `#214`, on `main`)

## Objective
Convert the `src/__tests__/api/actions.test.ts` placebo cluster (~121 vacuous tests) into real assertions
against the real `createAction`/`listActions` services, backed by real Postgres. Fix minimally any
owner-facing product defect the conversion exposes, and prove it.

## What was done
1. **Replaced 121 placebos** (`expect(true).toBe(true)` + comment-only `TODO_A2_FAKE_TEST_QUARANTINED`)
   with **13 real tests** (4 no-DB fail-closed + 7 `[db]` real create/list) and preserved/tightened
   **2 real schema-contract regression tests**. Removed the module-level `vi.mock` of audit/event/re-eval
   so the governed write path (audit emission included) is exercised for real.
2. **Fixed one confirmed owner-facing product defect**: `listActions` filtered `assignedTo` onto a phantom
   `where.owner` column (Action has no `owner`), raw-500ing every filtered list call. One-line fix in
   `src/services/action.ts` (`where.owner` → `where.assignedTo`), regression-locked.

## Defect: `listActions` phantom `owner` column (CONFIRMED, fixed)
- **Class:** phantom-column raw-500 on a **read/list** path (distinct from the F2 create sweep).
- **Empirical proof (real Postgres):**
  - Fail-before: reverting the single line makes the `assignedTo`-filter test throw
    `PrismaClientValidationError: Unknown argument \`owner\``.
  - Pass-after: the filtered query returns the matching action.
- **Blast radius:** any caller of `GET /api/actions` supplying an `assignedTo` filter — an owner-facing
  execution-item surface — got a 500 instead of a filtered list.
- `createAction` was inspected and is **correct** (sets `id`/`updatedAt`/`status: "draft"` explicitly) —
  a confirmed FALSE_POSITIVE for the raw-500-**create** class, consistent with the Wave 2 brief.

## Verification (all local, pre-push)
| Gate | Result |
|---|---|
| `tsc --noEmit` | exit 0 |
| `TEST_WITH_DB=true vitest actions.test.ts` (real Postgres) | 13 passed |
| `vitest actions.test.ts` (no DB) | 6 passed, 7 skipped (DB block gated) |
| Fail-before proof (revert fix) | assignedTo-filter test fails with `Unknown argument owner` |
| Regression (`actions` + `actions-error-handling` + `re-evaluation-workspace-scope.db`) | 36 passed |
| `governance:scan:strict` | exit 0 — 0 new |
| `governance:scan:auth` | exit 0 — all routes comply |
| `lint:ratchet` | PASS — 0 changed-file errors (error count 2155 → 2081) |
| `prisma validate` | valid |

## Scope & safety
- No Prisma schema change (the create path was already correct; the list bug was a wrong `where` key).
- No test weakening, skipping, deletion, or quarantine. No `expect(true).toBe(true)` remain.
- No mocks counted as DB proof; DB proof is real Postgres. Deferred surfaces documented, not faked.
- No production migration run, no production DB touched, no secrets changed. Authorizing phrase not received.

## Deferred (documented in ACTIONS_PLACEBO_INVENTORY.md)
HTTP header/auth/capability enforcement (route wrappers), Zod body validation, single-get/PATCH/start/
complete/impact-delta routes, `getActionsForEngagement`, the unimplemented `recommendationId` list filter,
and service-boundary DTO redaction — none have a service symbol or HTTP harness at this unit layer, so they
are recorded as deferred rather than faked.

## Follow-up queue (unchanged, no new owner instruction implied)
- Phase 6E-auth: `withAuth` migration + route-wrapper HTTP coverage (would let the deferred header/auth
  placebos become real).
- Phase 6D: approval workflow. Phase 6E: workspace-enforcement drift, invite boolean, `withAuth` migration.
