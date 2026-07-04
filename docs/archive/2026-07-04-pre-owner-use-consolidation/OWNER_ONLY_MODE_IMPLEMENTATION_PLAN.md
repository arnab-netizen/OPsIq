# Owner-Only Mode Implementation Plan

## 1. Decision Chosen

**C. CREATE_SEPARATE_FOUNDER_RECOVERY_MODE** (namespace `founder-recovery`, owner-gated routes `/owner/recovery` and `/api/owner/recovery/*`), **reusing existing owner/internal primitives**.

This is a hybrid of "reuse primitives" + "separate namespace" as the Phase 1 default prescribes for the observed conditions.

## 2. Evidence Supporting the Decision

- `owner-mode` provides reusable primitives (`OWNER_VIEW`/`OWNER_MANAGE`, `withCanonicalEnforcement`, `db`, `emitAuditEvent`, validation helpers, `HealthStatus`) — proven in the reconciliation report → **reuse, do not rebuild infra**.
- `owner-mode`'s feature data model is a read-only portfolio dashboard with hardcoded synthetic metrics → **not suitable to extend for a real recovery loop**.
- The existing `Action` status enum is mismatched/broken and `outcome/verification.ts` is hardcoded to `confidence 0` → **must be bypassed with a correct, separate action+verification model** (Phase 1 rule: "If existing status/action/verification primitives are broken, repair or bypass them safely").
- The existing `Engagement`/`Action` graph is shared with the consultant/public flow → a separate `founder-recovery` namespace avoids confusing public/customer mode (Phase 1 rule).

## 3. Files to Reuse (unchanged)

- `src/lib/canonical-route-enforcement.ts` (`withCanonicalEnforcement`)
- `src/lib/db.ts` (`db`)
- `src/infra/audit.ts` (`emitAuditEvent`)
- `src/lib/validation.ts` (`parseRequestBody`, `parseOrThrow`, `uuidSchema`)
- `src/lib/canonical-json-response.ts` (`canonicalJson`)
- `src/domain/constants/capabilities.ts` (`OWNER_VIEW`, `OWNER_MANAGE`)
- `src/policies/capability-check.ts` (role→capability map)
- `src/ui/shell/sidebar-nav.tsx` (nav pattern) — **modified** to add entry
- `src/app/(authenticated)/layout.tsx` + `src/ui/shell` (app shell)

## 4. Files to Modify

- `prisma/schema.prisma` — add 6 models + back-relations.
- `src/domain/constants/audit-events.ts` — add recovery audit event names.
- `src/ui/shell/sidebar-nav.tsx` — add "Recovery (Owner)" nav entry.

(No existing service/route/test is modified; the broken `Action`/`verification` primitives are bypassed, not edited.)

## 5. New Files to Create

Pure logic (unit-tested, no DB):
- `src/domain/founder-recovery/types.ts`
- `src/domain/founder-recovery/thresholds.ts`
- `src/domain/founder-recovery/metrics.ts` (`calculateMetrics`)
- `src/domain/founder-recovery/diagnosis.ts` (`generateFindings`)
- `src/domain/founder-recovery/recovery-actions.ts` (`buildActionsFromFindings`)
- `src/domain/founder-recovery/verification.ts` (`verifyOutcome`)
- `src/domain/founder-recovery/action-status.ts` (status machine)
- `src/domain/founder-recovery/validation.ts` (Zod schemas)

Services (DB):
- `src/services/founder-recovery/business.service.ts`
- `src/services/founder-recovery/snapshot.service.ts`
- `src/services/founder-recovery/cycle.service.ts`
- `src/services/founder-recovery/action.service.ts`
- `src/services/founder-recovery/verification.service.ts`
- `src/services/founder-recovery/dashboard.service.ts`

API routes:
- `src/app/api/owner/recovery/businesses/route.ts` (GET, POST)
- `src/app/api/owner/recovery/businesses/[businessId]/route.ts` (GET, PATCH)
- `src/app/api/owner/recovery/businesses/[businessId]/snapshots/route.ts` (GET, POST)
- `src/app/api/owner/recovery/businesses/[businessId]/cycles/route.ts` (GET, POST)
- `src/app/api/owner/recovery/cycles/[cycleId]/route.ts` (GET)
- `src/app/api/owner/recovery/actions/[actionId]/route.ts` (PATCH)
- `src/app/api/owner/recovery/actions/[actionId]/verify/route.ts` (POST)
- `src/app/api/owner/recovery/dashboard/route.ts` (GET)

UI:
- `src/app/(authenticated)/owner/recovery/page.tsx`
- `src/components/owner-recovery/*` (client components)

Tests:
- `src/__tests__/founder-recovery/metrics.test.ts`
- `src/__tests__/founder-recovery/diagnosis.test.ts`
- `src/__tests__/founder-recovery/recovery-actions.test.ts`
- `src/__tests__/founder-recovery/verification.test.ts`
- `src/__tests__/founder-recovery/action-status.test.ts`
- `src/__tests__/founder-recovery/validation.test.ts`
- `src/__tests__/founder-recovery/closed-loop.test.ts`

## 6. Prisma Changes Required

New models (all `@db.Uuid` ids, `workspaceId` for isolation, audit columns):
- `OwnerBusiness`
- `OwnerMetricSnapshot`
- `RecoveryCycle`
- `RecoveryFinding`
- `RecoveryAction`
- `RecoveryVerification`

## 7. API Routes Required

`/api/owner/recovery/*` as listed in §5, all gated by `OWNER_VIEW` (reads) / `OWNER_MANAGE` (writes), workspace-isolated.

## 8. UI Routes Required

`/owner/recovery` (single owner dashboard page with business selector, snapshot entry, findings, actions, verification, cycle history, empty state). Nav entry gated for owner/internal users.

## 9. Tests Required

The 16 test areas in Phase 12. Pure-logic areas (metrics, diagnosis, actions, verification, status transitions, validation, two-cycle comparison) run without a DB; DB-backed authorization/persistence tests are written but require PostgreSQL.

## 10. Exact Acceptance Criteria

Mapped to Phase ACCEPTANCE CRITERIA 1–17. The non-DB acceptance items (metric calc from persisted shape, diagnosis from metrics, findings with source/threshold/evidence, before/after verification logic, status machine, two-cycle comparison, prisma validate, build, core unit tests) are provable in this environment; DB-runtime items (live persistence/authz at runtime) are BLOCKED_BY_ENVIRONMENT (no `DATABASE_URL`) and reported explicitly.
