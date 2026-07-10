# Phase 6H Wave 1 — Final Report
## Route-Level Audit Pattern Hardening

**Date:** 2026-07-10
**Branch:** `claude/phase-6h-wave1-audit-pattern-hardening`
**Base:** `main` @ `89b44217` (Phase 6G, CI green)

---

## A. Files Created

- `src/__tests__/api/audit-pattern-hardening-6h.test.ts`
- `docs/audits/2026-07-10-phase-6h-wave1-audit-pattern-hardening/ROUTE_AUDIT_PATTERN_INVENTORY.md`
- `docs/audits/2026-07-10-phase-6h-wave1-audit-pattern-hardening/SMOKE_PRODUCTION_CLASSIFICATION.md`
- `docs/audits/2026-07-10-phase-6h-wave1-audit-pattern-hardening/EVIDENCE_LEDGER.json`
- `docs/audits/2026-07-10-phase-6h-wave1-audit-pattern-hardening/FINAL_REPORT.md`

## B. Files Changed

| File | Change |
|------|--------|
| `src/app/api/decisions/intake/route.ts` | Removed `.catch()` from `logAuditEvent` call; updated comment |
| `src/app/api/operator/route.ts` | Removed `.catch()` from `logAuditEvent` call; added explicit `workspaceId`; updated comment |

## C. Schema Changes

None.

## D. Backend Logic Implemented

**`decisions/intake` POST:**
- `logAuditEvent` is now called without `.catch()`. The function internally re-throws on DB error;
  removing the route-level catch means audit failures propagate and the route returns 500 rather
  than silently succeeding with an ungoverned decision record.

**`operator` POST:**
- Same pattern. Additionally, `workspaceId` is now passed explicitly to `logAuditEvent` rather than
  relying on `requireWorkspaceContext()` falling back from context — more explicit and testable.
- The misleading comment "fail-closed if audit fails" that contradicted the `.catch()` behavior
  has been corrected to accurately describe the now-correct behavior.

## E. Frontend Logic Implemented

None.

## F. Acceptance Criteria

- [x] All 14 `logAuditEvent` route callers are classified
- [x] FIX_NOW routes (`decisions/intake`, `operator` POST) no longer swallow audit failures
- [x] `workspaceId` is explicit on the `operator` POST audit call
- [x] FALSE_POSITIVE routes confirmed correct (no `.catch()`, already fail-closed)
- [x] DEFER routes documented with rationale
- [x] Smoke dashboard failure modes classified and documented
- [x] Tests added proving audit failure propagates for both fixed routes
- [x] No production migration performed
- [x] No DB touched
- [x] No secrets altered
- [x] No `withCanonicalEnforcement` migration
- [x] No transaction rewrite

## G. Known Limitations

1. **`decisions/[decisionId]/evaluate/route.ts`** — governed mutation with swallowed audit. Cannot
   be fixed safely in Wave 1 because it has a separate hardcoded `http://localhost:3000/api/run`
   fetch defect. Both must be fixed together in a scoped follow-up.

2. **`run/route.ts`** — core decision engine with ~1100 lines and multiple audit call sites. Error
   paths (rejected/blocked decisions) use best-effort audit by design. The success path
   (`RUN_APPROVED`) already re-throws. A comprehensive fix requires a dedicated harness.

3. **`logAuditEvent` itself** — the legacy function does not produce a hash-chained audit event
   (unlike `emitAuditEvent`). Migrating all route callers to `emitAuditEvent` is a separate
   wave beyond this scope.

4. **Duplicate `withAuth()` calls** — `metrics/control-effectiveness` and
   `metrics/decision-latency` both call `withAuth()` twice. Separate defect; not in scope.

## H. Manual Verification Steps

1. `npx tsc --noEmit` — verify no type errors
2. `npx vitest run src/__tests__/api/phase-6h-audit-pattern-hardening.test.ts` — confirm 5+ tests pass
3. Confirm `decisions/intake/route.ts` has no `.catch()` after `logAuditEvent`
4. Confirm `operator/route.ts` has no `.catch()` after `logAuditEvent` and has `workspaceId` in the call

## I. Trigger Map

No new triggers. The existing audit emission path is unchanged except that failures now propagate
rather than being swallowed, causing the route to return 500 (the enforcement wrapper converts
unhandled errors to 500 responses via `withEnforcementFull` / `withCanonicalEnforcement`).

## J. Failure Modes Covered

| Failure mode | Coverage |
|-------------|---------|
| `decisions/intake` creates DB record but audit silently fails | Eliminated — error now propagates |
| `operator` POST mutates status but audit silently fails | Eliminated — error now propagates |
| Misleading "fail-closed" comment contradicting behavior | Fixed in comment |
| `operator` POST uses implicit workspaceId context lookup for audit | Fixed — explicit `workspaceId` now passed |

## K. Events Emitted

No new event types. Existing `DECISION_INTAKE` and `COMPLETE`/`UPDATE` events are unchanged;
they now fail-close when the `logAuditEvent` DB write fails.

## L. Automated Tests Added

**File:** `src/__tests__/api/audit-pattern-hardening-6h.test.ts`

| Test | Route | Assertion |
|------|-------|-----------|
| succeeds when logAuditEvent resolves (happy path) | `decisions/intake` | Returns `{ decisionId, status: "pending" }` |
| propagates logAuditEvent failure | `decisions/intake` | Rejects with audit error (no longer swallowed) |
| logAuditEvent called with decision id and workspaceId | `decisions/intake` | Verifies call shape |
| succeeds when logAuditEvent resolves (happy path) | `operator` POST | Returns `{ success: true }` |
| propagates logAuditEvent failure | `operator` POST | Rejects with audit error (no longer swallowed) |
| logAuditEvent called with entityId, workspaceId, eventName | `operator` POST | Verifies call shape |
| COMPLETE eventName when status is done | `operator` POST | Documents event name assignment logic |
