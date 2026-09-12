# Phase 6C Wave 1 — convert decisions placebo tests (+ fix an owner-facing raw-500 it exposed)

**Date:** 2026-07-10
**Branch:** `claude/phase-6c-placebo-test-conversion-wave-1-decisions` (from `main` @ `046430b`)
**Type:** Test-integrity conversion + one minimal, proven product fix. No schema change, no secrets, no
production migration.

## 1. Phase 6B final main verification

Main `046430b` verified GREEN before starting: `CI - Build & Test #3020` ✅, `CI/CD Foundations #1369` ✅,
`MVP Readiness #1635` ✅ with **Security Baseline HONEST_GREEN** (parser executed in-workflow, 0 critical/high;
no continue-on-error, no `npm audit || true`). Only non-required `Smoke #567` red (known `BLOCKED_SCHEMA_DRIFT`;
not migration approval). **Phase 6B is CLOSED — HONEST_GREEN.**

## 2. Branch and HEAD

`claude/phase-6c-placebo-test-conversion-wave-1-decisions`, from `046430b`.

## 3. Starting placebo count (decisions cluster)

`src/__tests__/api/decisions.test.ts`: ~78 cases, **0 real assertions** (all `expect(true).toBe(true)` / empty
`TODO_A2_FAKE_TEST_QUARANTINED` bodies / constant `.toMatch`). No route/service import. See
`PLACEBO_TEST_INVENTORY.md`.

## 4. Tests converted (8 real, all passing)

Against the real `createDecision` service and the exact `GET /api/decisions/list` query, backed by real
Postgres (no Prisma mocks as DB proof):
- **5 validation (no DB):** rejects empty title, empty type, non-positive impact, confidence outside [0,1],
  missing workspace id — each asserts the specific fail-closed error.
- **3 DB-backed (`[db]`, gated by `TEST_WITH_DB=true`):**
  1. `createDecision` persists a **pending, workspace-scoped** decision with `createdByUserId` = verified actor
     and real impact/problem (regression proof — this call raw-500'd before the fix).
  2. list query returns **only the requesting workspace's** decisions (no cross-workspace leak, real DTO,
     no raw 500).
  3. list **status filter** narrows to matching decisions without leaking other statuses.

## 5. Tests deferred and why

- **approve/block state-machine (~24):** OBSOLETE — reference `/approve` `/block` routes that **don't exist**
  (real transitions are accept/reject/close/execute/verify/fail/…). Documented, not faked.
- **route-wrapper 401/403 + missing-header 400 (~10):** DEFER — route-level auth needs a NextRequest/canonical
  HTTP harness the repo lacks (its own `operator-route.real.test.ts` `it.skip`s exactly this). Isolation is
  instead proven at the query layer.
- **audit-trail emission (~8):** DEFER to Phase 6D (audit/idempotency governance is out of Wave 1 scope).

Not deleted, not skipped-as-green, not faked. Wave 1 replaces the provable subset with real coverage.

## 6. Exact behavior now asserted

Fail-closed input validation; decision created in **pending** state scoped to the **verified workspace** (not
user input) with the **creator recorded from the verified actor**; **tenant isolation** on list (no
cross-workspace leak); **valid select / no raw 500**; **real DTO shape** (`title ← problem`); status-filter
correctness. Each assertion fails on a raw 500, an isolation leak, a wrong status, or a wrong DTO.

## 7. Product defect found & fixed (minimal, in-scope)

Converting the create path proved **`createDecision` raw-500'd on every call** — `POST /api/decisions/create`
was fully broken and the placebo `"should return 201 on success"` hid it. `db.operatorItem.create(...)` was
called with:
- a phantom **`createdBy`** column (real column is `createdByUserId`),
- **no `id`** (OperatorItem.id is required, no default),
- **no `updatedAt`** (required, no default),
- phantom **`decisionType`** and **`problemType`** columns (neither exists; `type` is already stored in
  `action`).

Each triggered `PrismaClientValidationError`. **Fix (one function, `decision-creation-service.ts`):** add
`id: randomUUID()` and `updatedAt: new Date()`, rename `createdBy → createdByUserId`, drop the two phantom
writes, and return `decisionType` from the input `type` (DTO contract unchanged). No schema change. Verified:
`createDecision` now persists a real pending decision (proven by the `[db]` test). The `createDecisionsBulk`
path (which loops `createDecision`) is fixed by the same change.

## 8. Files changed

- `src/services/decisions/decision-creation-service.ts` — minimal create-path fix (product).
- `src/__tests__/api/decisions.test.ts` — placebo cluster → real assertions.
- `docs/audits/2026-07-10-phase-6c-placebo-test-conversion-wave-1/` — inventory, final report, evidence ledger.

## 9. Commands run

```
# defect discovery / fix verification (real Postgres :5433)
npx tsx <probe> createDecision  → before fix: "Invalid db.operatorItem.create()" (createdBy / id / decisionType)
                                → after fix:  OK status=pending wsMatch=true createdByUserId=true
TEST_WITH_DB=true npx vitest run src/__tests__/api/decisions.test.ts   → 8 passed
npx vitest run src/__tests__/api/decisions.test.ts (no DB)             → 5 passed | 3 skipped
npx tsc --noEmit                                                       → exit 0
npx eslint <changed files>                                            → 0 problems
npm run lint:ratchet                                                  → PASS (2081 errors, 0 changed-file)
npm run governance:scan:strict                                        → 0 new findings
```

## 10. Pass/fail/deferred status

Converted: **8 real tests, 8 passing** (5 no-DB + 3 real-DB). Deferred/obsolete: ~42 cases documented. Product
fix: **1**, proven.

## 11. Proof the tests are not placebo

Each converted test fails on real breakage: the create test raw-500'd before the fix (empirically observed);
the isolation test fails if a cross-workspace row leaks or the select is invalid; validation tests fail if
fail-closed checks are removed. No `expect(true).toBe(true)`, no bare `toBeDefined`, no snapshot-only proof.

## 12. Rollback plan

Revert `decision-creation-service.ts` (restores the raw-500 — not recommended) and `decisions.test.ts` (or
`git revert` the merge). No schema/data impact.

## 13. Remaining placebo-test risk

~42 decisions cases remain unconverted (OBSOLETE approve/block; DEFER route-wrapper auth + audit). Hundreds of
`TODO_A2_FAKE_TEST_QUARANTINED` placebos remain across other API route clusters (operator-queue 112,
execution-certainty 111, constraint-checks 108, …) — future waves.

## 14. Recommended Phase 6C Wave 2 cluster

`api/actions` (74 markers) — owner-facing execution items; likely the same class of create-path defects, and
higher owner-facing risk than the high-count operator-queue file. Alternatively `api/recommendations` /
`owner/dashboard` route auth if a route-test HTTP harness is introduced first.
