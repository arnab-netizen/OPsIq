# Duplicate Work Avoidance Matrix
**Date:** 2026-07-12  
**Purpose:** Prevent re-implementing systems that already exist; identify canonical sources for each concern.

---

## Canonical Authority Map

| Concern | Canonical Implementation | Location | Do NOT Duplicate |
|---------|------------------------|----------|-----------------|
| Route authentication + workspace enforcement | `withCanonicalEnforcement` | `src/lib/canonical-route-enforcement.ts` | withEnforcementFull, withAuth, enforceWorkspaceScoping, withRequestContext |
| Workspace identity (verified) | `VerifiedWorkspaceId` branded type | `src/lib/workspace-identity.ts` | string workspace IDs in route handlers |
| Workspace identity (claimed) | `ClaimedWorkspaceId` branded type | `src/lib/workspace-identity.ts` | Direct header reads without branding |
| Audit event writing | `emitAuditEvent` | `src/infra/audit.ts` | logAuditEvent (deleted), db.auditEvent.create (gated) |
| Error sanitization for logs | `classifyOperatorError` | `src/lib/operator-error-governance.ts` | Custom error formatters, toString(), template literals |
| Session role lookup | `resolveServerRole` | `src/services/auth/server-role.ts` | getSession() in routes, body.role |
| DB workspace context (activation) | `requireWorkspaceContext` | `src/services/workspace/activation-context.ts` | context.ts version (orphan), direct DB membership query |
| Service auth validation | `requireServiceAuth`, `requireServiceContext` | `src/lib/service-auth.ts` | Direct authContext null checks in services |
| Permission checking | `hasPermission(role, action)` | `src/services/auth/access.ts` | Inline role string comparisons |
| Capability enforcement | `CAPABILITIES.*` constants | `src/domain/constants/capabilities.ts` | String literals for capabilities |
| State machine transitions | Authoritative maps in 3 files | `src/domain/constants/`, `src/services/` | New TRANSITIONS objects in route files or services |
| Request deduplication | `isDuplicateRequest`, `getRequestHash` | (import from dedup module) | Manual Map<requestId, result> caches in route handlers |
| Idempotency key storage | CAS `updateMany` with state guard | Pattern in Phase 6I | Optimistic lock via `findFirst` then `update` |

---

## Previously Built Systems — Do Not Rebuild

### Auth Systems

| System | Status | Files |
|--------|--------|-------|
| `withCanonicalEnforcement` | ACTIVE (branch) | `src/lib/canonical-route-enforcement.ts` |
| `withEnforcementFull` | LEGACY — do not add new usages | Multiple; DC-03 gate prevents new uses |
| `enforceWorkspaceScoping` | LEGACY — do not add new usages | `src/middleware/workspace-enforcement.ts` |
| Capability map | ACTIVE | `src/domain/constants/capabilities.ts` |
| RBAC / hasPermission | ACTIVE | `src/services/auth/access.ts` |

### Audit Systems

| System | Status | Files |
|--------|--------|-------|
| `emitAuditEvent` (hash-chained, tx-bound) | ACTIVE | `src/infra/audit.ts` |
| `logAuditEvent` | DELETED in A7.7 | `src/services/audit/audit-log.ts` — gone |
| `AUDIT_EVENTS` typed constants | ACTIVE (branch) | `src/domain/constants/audit-events.ts` |

### Workspace Context Systems

| System | Status | Notes |
|--------|--------|-------|
| `activation-context.ts::requireWorkspaceContext` | ACTIVE — DB-backed | Returns workspaceId from DB membership |
| `context.ts::requireWorkspaceContext` | ORPHAN — session-based | No callers; delete this file |
| `service-auth.ts::requireWorkspaceContext` | ACTIVE — string validation | Takes workspaceId string, validates non-empty; unrelated to session |

**NOTE:** Three functions with the same name exist in three files. When searching "requireWorkspaceContext" the results can be misleading. See DATABASE_PROOF_LANE_RECONCILIATION.md and REPEATED_DEFECT_ROOT_CAUSES.md RC-3 for details.

### Error Handling Systems

| System | Status | Files |
|--------|--------|-------|
| `classifyOperatorError` | ACTIVE | `src/lib/operator-error-governance.ts` |
| `UnauthorizedError`, `ForbiddenError` | ACTIVE | `src/infra/errors.ts` |

---

## Prior Phase Work — What NOT to Redo

| Phase | What It Did | Do NOT Repeat |
|-------|------------|---------------|
| Phase 6F | CAS + atomic audit on F1-F4 | Fixed: decision creation, status change, role access, deliverable review |
| Phase 6H | Fail-closed audit on decisions/intake and operator POST | These routes already correct on main |
| Phase 6I | Idempotency on 8 decision routes | All 8 routes have idempotency on main |
| Phase 6J | Diagnosis workspace tenant isolation | diagnoseBusiness workspace enforcement on main |
| A7.7 Batch 14 | logAuditEvent → emitAuditEvent (19 sites) | All 19 migrated; legacy module deleted |
| A7.7 Batch 12 | requireWorkspaceContext callers removed | 6 callers removed; don't add new ones |
| A7.7 Batches 1-12 | 311 routes migrated to withCanonicalEnforcement | All migrated; don't use legacy wrappers |

---

## Green Fields — Work Not Yet Done

| Work Item | Notes |
|-----------|-------|
| DC-19 gate: fail-open post-mutation audit detection | New gate needed |
| `auth-governance-scanner.ts` update | Needs `withEnforcementFull` → `withCanonicalEnforcement` guidance |
| Delete `context.ts` | Orphan removal |
| Wire `governance:scan:a77` into CI | CI wiring needed |
| Enable `noUnusedLocals` in tsconfig | tsconfig change |
| Merge branch to main | The big one |

---

## Deduplication Rule for Future Work

Before implementing any new auth wrapper, workspace resolver, audit writer, state-machine definition, or error sanitizer:

1. Search the canonical authority map above
2. Verify the canonical implementation exists and is accessible
3. If not found, search `src/lib/`, `src/infra/`, `src/services/auth/`
4. If still not found, check `execution_state.json` for prior work
5. Only if nothing exists: implement new canonical implementation with proper DC gate

**Never implement a second copy of a system that already has a canonical implementation.**
