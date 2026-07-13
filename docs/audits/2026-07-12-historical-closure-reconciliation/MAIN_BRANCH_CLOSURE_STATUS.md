# Main Branch Closure Status
**Date:** 2026-07-12  
**origin/main HEAD:** `8aef45a5`  
**Purpose:** What is actually closed on `origin/main` right now, without the A7.7 branch.

---

## What IS Closed on `origin/main`

### Security Fixes (Verified Merged)

| Fix | Merged Via | Status on Main |
|----|-----------|----------------|
| F1: Decision creation audit event | Phase 6F (`8a16d1fa`) | CLOSED ON MAIN |
| F2: Atomic CAS on changeDecisionStatus | Phase 6F | CLOSED ON MAIN |
| F3: CAS + audit in PrivateModeRoleAccessService | Phase 6F | CLOSED ON MAIN |
| F4: Version guard in updateDeliverableReviewStatus | Phase 6F | CLOSED ON MAIN |
| Fail-closed audit on decisions/intake | Phase 6H (`c8c85c3d`) | CLOSED ON MAIN |
| Fail-closed audit on operator POST | Phase 6H | CLOSED ON MAIN |
| Idempotency on 8 decision routes | Phase 6I (`f2bd5e0d`) | CLOSED ON MAIN |
| Duplicate submitDecision call fix | Phase 6I | CLOSED ON MAIN |
| Auth inventory + RBAC quarantine reduction | Phase 5D + 6I | CLOSED ON MAIN |
| High CVE dependency patches | Phase 6B (`bb15a3fa`) | CLOSED ON MAIN |
| getPolicyContext workspace_memberships fix | Phase 5C | CLOSED ON MAIN |
| diagnoseBusiness workspace isolation | Phase 6J (`80a30870`) | CLOSED ON MAIN |
| Workspace invite hardening | Phase 6E | CLOSED ON MAIN |
| Approval workflow governance | Phase 6D | CLOSED ON MAIN |
| Raw 500 defects fixed | Phase 6A, 6C-F1, 6C-F2 | CLOSED ON MAIN |

### Prevention Gates on Main

| Gate | Type | In CI? |
|------|------|--------|
| `governance:scan:strict` | Lint/UX patterns | YES |
| `governance:scan:auth` | Auth wrapper patterns | YES (stale) |
| TypeScript strict mode | Type safety | YES |
| `npx tsc --noEmit` | Compilation | YES |

---

## What Is OPEN on `origin/main`

### Critical Open Items (A7.7 Not Merged)

| Defect | State on Main |
|--------|--------------|
| DC-01: x-workspace-id as authoritative workspace identity | **OPEN** — no branded types on main |
| DC-02: requireWorkspaceContext callers still present in operator/store | **OPEN** — pre-Batch 12 state |
| DC-03: Routes use `withEnforcementFull`/`enforceWorkspaceScoping` not `withCanonicalEnforcement` | **OPEN** — pre-migration state |
| DC-06: `logAuditEvent` (legacy module) still exists on main | **OPEN** — `src/services/audit/audit-log.ts` confirmed present on main |
| DC-07/DC-15: proof/review accepts `body.requiredPermission` | **OPEN** — client-controlled permission elevation |
| DC-18: Raw auditError in value/scenario/alerts routes | **OPEN** — 3 routes have unmitigated log injection |
| `scripts/a77-prevention-gates.ts` | **DOES NOT EXIST** on main |
| `src/lib/workspace-identity.ts` (branded types) | **DOES NOT EXIST** on main |
| `governance:scan:a77` wired into CI | **DOES NOT EXIST** on main |

### Detailed State of Key Files on Main

| File | State on `origin/main` |
|------|----------------------|
| `src/services/audit/audit-log.ts` | EXISTS — `logAuditEvent` callable |
| `scripts/a77-prevention-gates.ts` | DOES NOT EXIST |
| `src/lib/workspace-identity.ts` | DOES NOT EXIST |
| `src/lib/canonical-route-enforcement.ts` | EXISTS (Phase 6 era) |
| `src/app/api/decisions/evaluate/route.ts` | Has `.catch()` on post-mutation audit (Batch 15 fix not on main) |
| `src/app/api/value/route.ts` | Has raw `${auditError}` in console.error (DC-18 fix not on main) |
| `src/app/api/scenario/route.ts` | Has raw `${auditError}` in console.error (DC-18 fix not on main) |

---

## Main Branch Risk Classification

| Risk | Severity | Evidence |
|------|----------|---------|
| Log injection via raw audit error interpolation | MEDIUM | 3 routes on main have `console.error(\`${auditError}\`)` |
| Client-controlled permission elevation via proof/review | HIGH | `body.requiredPermission` accepted on main |
| x-workspace-id used as authoritative workspace identity (in some routes) | HIGH | No branded types on main; enforcement depends on route-specific code |
| logAuditEvent callable in services (inconsistent with emitAuditEvent) | MEDIUM | Legacy module present; some callers may be using it |
| No recurrence prevention gates for DC-01 through DC-18 | HIGH | Gates script doesn't exist on main |
| auth-governance-scanner recommends stale pattern | MEDIUM | Stale guidance in CI |

---

## Action: What Merging the Branch Would Fix on Main

| After Merge | Fixed |
|-------------|-------|
| All 311 routes use `withCanonicalEnforcement` | YES |
| `logAuditEvent` module deleted | YES |
| 18 DC prevention gates installed | YES |
| Branded workspace identity types | YES |
| DC-18 log sanitization on 3 routes | YES |
| DC-15 proof/review permission fix | YES |
| `governance:scan:a77` runnable | YES — but CI wiring still needed |

**Wiring `governance:scan:a77` into CI would additionally fix:**
- Prevention of all DC-01 through DC-18 regressions on future PRs

---

## Conclusion

`origin/main` has significant Phase 6A–6J security hardening but lacks all A7.7 work. The 48-commit branch represents the delta between "hardened" (Phase 6 era) and "closure with systematic prevention" (A7.7 era). Both matter; neither replaces the other.

Current main is not exploitably insecure for common attacks (auth wrappers exist, most routes validate workspace), but it has specific high-risk patterns (client-controlled permission, raw audit error logging, no recurrence prevention) that A7.7 eliminates.
