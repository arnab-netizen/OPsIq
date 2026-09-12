# Phase 6I — Duplicate Auth Route Inventory

**Date:** 2026-07-10  
**Branch:** claude/phase-6i-idempotency-auth-cleanup  
**Scope:** Inventory only — no broad migration in Phase 6I per hard rules

---

## Pattern Classification

### Pattern A — Clean: `withCanonicalEnforcement`
Single session resolution. Auth context passed as `CanonicalAuthContext`. No `withAuth()` call inside handler.

| Route | Status |
|-------|--------|
| `POST /api/decisions/[id]/accept` | ✓ CLEAN |
| `POST /api/decisions/[id]/reject` | ✓ CLEAN |
| `POST /api/decisions/[id]/close` | ✓ CLEAN |
| `POST /api/operator` | ✓ CLEAN |
| `GET /api/decisions` (list) | ✓ CLEAN (presumed from Phase 6D audit) |

### Pattern B — Legacy: `withEnforcementFull` + inner `withAuth()`
Dual session resolution: outer wrapper resolves session, inner `withAuth()` resolves it again. Redundant DB call per request. Not a security bug — both calls resolve the same session — but wastes one round-trip and obscures auth flow.

| Route | Idempotency | Priority for Migration |
|-------|-------------|----------------------|
| `POST /api/decisions/create` | ✓ Fixed Phase 6I | Low (works correctly) |
| `POST /api/decisions/intake` | ✓ Fixed Phase 6I | Low |
| `POST /api/decisions/[id]/execute` | Pre-existing | Low |
| `POST /api/decisions/[id]/fail` | ✓ Fixed Phase 6I | Low |
| `POST /api/decisions/[id]/verify` | ✓ Fixed Phase 6I | Low |
| `POST /api/decisions/[id]/record-outcome` | ✓ Fixed Phase 6I | Low |
| `POST /api/operator` (update path) | N/A | Low |

### Pattern C — Dead/Unused imports
Some routes import `getSession` from `@/services/auth` but never call it. These were cleaned up in Phase 6I (removed from `fail/route.ts` and `record-outcome/route.ts`).

---

## Migration Plan (deferred)

The 20+ routes using Pattern B should be migrated to `withCanonicalEnforcement` in a dedicated phase. The migration must:
1. Import `withCanonicalEnforcement` and `CanonicalAuthContext`
2. Remove inner `withAuth()` call
3. Replace `session.user.id` with `ctx.verifiedActorId`
4. Replace `request.nextUrl.searchParams.get("workspaceId")` with `ctx.verifiedWorkspaceId` where applicable
5. Add per-route tests confirming session resolution is unchanged

**Not in Phase 6I scope** per hard rule: "Do not rewrite auth architecture / Do not broad-migrate 20+ routes."

---

## Security Assessment

The duplicate `withAuth()` pattern is **not a security defect**:
- Both calls use the same session token from the same request
- The same user identity is resolved in both calls
- Authorization checks (workspace enforcement, capability checks) run after both resolutions
- A forged/swapped session cannot produce a different result on the inner `withAuth()` call

The redundancy is a performance and code-clarity issue, not a security baseline risk.
