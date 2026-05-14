# PHASE F STEP F1: GLOBAL AUTH READ INVENTORY — SHADOW READ DETECTION

**Status**: IN PROGRESS  
**Date**: 2026-05-14  
**Scope**: Complete audit of all auth reads across entire repository  
**Finding**: SNAPSHOT_HYBRID confirmed - snapshot exists but auth reads continue elsewhere  

---

## Executive Summary

Repository-wide scan reveals critical shadow read pattern:

- **31+ files** call `getSession()` directly
- **3 files** call `requireSession()` directly  
- **4 files** call `getPolicyContext()` directly
- **50+ routes** call `withAuth()` function (shadow read wrapper)
- **Multiple middleware** perform independent auth fetches
- **Helper functions** re-fetch auth independently
- **No enforcement** preventing downstream auth reads

Result: SNAPSHOT_HYBRID classification is correct.
- Snapshot exists (E) ✓
- Snapshot is immutable (E) ✓
- Snapshot is trace-owned (E) ✓
- **Snapshot is NOT exclusive** ✗ ← PROBLEM

Auth reads continue to happen outside snapshot system.

---

## Auth Read Locations Inventory

### Category 1: Direct getSession() Calls (31 files)

#### Canonical (Allowed)
- `src/services/auth.ts:41` — getSession() definition (data provider) ✓
- `src/services/auth.ts:163` — getSessionFact() → calls getSession (PHASE E) ✓
- `src/lib/canonical-route-enforcement.ts:177` — getSessionFact() call in wrapper ✓

#### Legacy (Deprecated after PHASE F)
- `src/services/auth.ts:94` — getPolicyContext() calls getSession() again (REDUNDANT) ⚠️
- `src/services/auth.ts:104` — getServerAuthContext() calls requireSession() ⚠️
- `src/middleware/workspace-enforcement.ts:22` — Direct getSession() in middleware 🔴 SHADOW
- `src/services/workspace/context.ts:16` — getSession() in helper 🔴 SHADOW
- `src/services/workspace/activation-context.ts:15` — getSession() in helper 🔴 SHADOW
- `src/services/auth/server-role.ts:6` — getSession() in helper 🔴 SHADOW
- `src/lib/auth-guard.ts:61` — requireSession() in withAuth() 🔴 SHADOW
- `src/lib/auth-guard.ts:104` — requireSession() in getServerAuthContext() 🔴 SHADOW

#### Routes (50+ withAuth() calls) 🔴 SHADOW
- `src/app/api/engagements/route.ts` — withAuth() calls
- `src/app/api/engagements/[engagementId]/route.ts` — withAuth() calls
- `src/app/api/engagements/[engagementId]/intervention/route.ts` — withAuth() calls
- `src/app/api/engagements/[engagementId]/actions/[actionId]/route.ts` — withAuth() calls
- `src/app/api/engagements/[engagementId]/business-impact/detail/route.ts` — withAuth() calls
- *(Many more routes)*

---

### Category 2: Direct requireSession() Calls (3 files)

**Location**: `src/lib/auth-guard.ts:61, 104, 122`

All call through `requireSession()` directly instead of using snapshot.

---

### Category 3: Direct getPolicyContext() Calls (4 files)

**Location**: `src/services/auth.ts:90, 184`

- `getPolicyContext()` itself calls `getSession()` again (DOUBLE FETCH)
- `getPolicyContextFact()` calls `getPolicyContext()` (redundant)

---

### Category 4: withAuth() Wrapper (50+ routes)

**Location**: `src/lib/auth-guard.ts:118`

```typescript
export async function withAuth(
  options: AuthOptions = {},
  workspaceId: string = "system"
): Promise<AuthContext> {
  const session = await requireSession(workspaceId);  // ← SHADOW READ
  const policy = await requirePolicyContext(workspaceId);  // ← SHADOW READ
  // ... capability checks
  return { session, policy };
}
```

This function is called by 50+ routes after canonical wrapper has already made auth decision and created snapshot.

---

### Category 5: Middleware Auth Reads

**Location**: `src/middleware/workspace-enforcement.ts:22`

Middleware runs BEFORE canonical wrapper, creates its own auth state.

---

### Category 6: Helper Function Auth Reads

**Locations**:
- `src/services/workspace/context.ts` — getSession()
- `src/services/workspace/activation-context.ts` — getSession()
- `src/services/auth/server-role.ts` — getSession()

---

## Shadow Read Risk Analysis

### Risk 1: Double Fetch in getPolicyContext

```typescript
// In getPolicyContext():
const session = await getSession(workspaceId);  // ← FETCH 1
const roleAssignments = await db.userRoleAssignment.findMany(...);  // ← FETCH 2,3
```

Problem: If session is revoked between wrapper call and this call:
- Wrapper allowed based on valid session
- getPolicyContext sees revoked session
- Inconsistency

---

### Risk 2: withAuth() Shadow Reads

```typescript
// In wrapper: creates snapshot at T0
const snapshot = createSnapshot(...)  // T0: session valid

// In route handler: calls withAuth()
const { session, policy } = await withAuth()  // T1: session revoked!
// Now handler has DIFFERENT auth state than decision was made on
```

---

### Risk 3: Middleware Reentry

```typescript
// Before wrapper:
workspace-enforcement middleware → calls getSession()  // T0

// Wrapper:
canonical-wrapper → calls getSessionFact()  // T1

// Possible different auth states visible to different parts of request
```

---

### Risk 4: Helper Function Auth Refreshes

```typescript
// In handler after snapshot created:
const context = await getWorkspaceContext()  // Calls getSession()
// Handler now sees potentially different auth state
```

---

## Classification Matrix: Auth Read Locations

| File/Function | Auth Read Type | Classification | Risk Level | Replacement |
|---------------|---|---|---|---|
| `getSession()` def | DATA PROVIDER | CANONICAL | Low | Keep |
| `getSessionFact()` | WRAPPER | CANONICAL | Low | Keep |
| `getPolicyContextFact()` | WRAPPER | CANONICAL | Low | Keep |
| `withCanonicalEnforcement()` | WRAPPER | CANONICAL | Low | Keep |
| `getPolicyContext()` | DOUBLE FETCH | LEGACY | HIGH | Consolidate |
| `getServerAuthContext()` | HELPER SHADOW | LEGACY | CRITICAL | Eliminate |
| `withAuth()` | SHADOW WRAPPER | LEGACY | CRITICAL | Eliminate |
| `workspace-enforcement` middleware | MIDDLEWARE | SHADOW | CRITICAL | Move to wrapper |
| Route `withAuth()` calls | ROUTE SHADOW | SHADOW | CRITICAL | Use `ctx` snapshot |
| Helper getSession() calls | HELPER SHADOW | SHADOW | CRITICAL | Use snapshot param |

---

## Current Architecture (SNAPSHOT_HYBRID)

```
Request Enter
  │
  ├─ workspace-enforcement middleware
  │   └─ calls getSession()  [SHADOW READ 1]
  │
  ├─ canonical-wrapper
  │   ├─ calls getSessionFact()  [CANONICAL]
  │   ├─ calls getPolicyContextFact()
  │   │   └─ calls getPolicyContext()
  │   │       └─ calls getSession()  [SHADOW READ 2]
  │   ├─ creates snapshot (T0)
  │   └─ pass snapshot to handler
  │
  └─ Handler execution
      └─ calls withAuth()  [SHADOW READ 3]
          ├─ calls requireSession()
          └─ calls requirePolicyContext()
              └─ calls getSession()  [SHADOW READ 4]
      
Result: 4+ independent auth fetches in single request
        Multiple auth states possible
        Snapshot non-exclusive
```

---

## Shadow Read Classification Codes

| Code | Meaning | Example | Action |
|------|---------|---------|--------|
| CANONICAL | Required auth read (only source) | `getSessionFact()` in wrapper | KEEP |
| LEGACY | Deprecated but harmless today | Helper functions | REMOVE after F |
| SHADOW_ROUTE | Route calls auth directly | `withAuth()` in handlers | REPLACE with ctx |
| SHADOW_HELPER | Helper re-fetches auth | `getWorkspaceContext()` | ELIMINATE |
| SHADOW_MIDDLEWARE | Middleware auth access | workspace-enforcement | BLOCK |
| DUPLICATE | Multiple fetches same thing | getPolicyContext calls getSession | CONSOLIDATE |
| RECURSIVE | Auth read within auth read | nested policy checks | ELIMINATE |
| REPLAY_UNSAFE | Auth re-fetch during request | withAuth() during handler | BLOCK |

---

## Mandatory Changes for Phase F

### 1. Auth Ownership Allowlist

Only CANONICAL sources allowed to read auth:
- `CanonicalVerifiedSessionBuilder` (create snapshot)
- `CanonicalExecutionTraceManager` (own snapshot)
- `canonical-route-enforcement.ts` (orchestrate)
- `getSessionFact()` / `getPolicyContextFact()` (wrapper support)

Everything else FORBIDDEN.

### 2. Static Detection

Build-time scanner must detect:
- Direct `getSession()` calls outside allowlist
- Direct `requireSession()` calls outside allowlist
- Direct `getPolicyContext()` calls outside allowlist
- `withAuth()` function calls (all routes)
- Middleware auth reads

### 3. Runtime Detection

Runtime enforcement must detect:
- Auth reads after snapshot finalized
- Helper auth re-fetches
- Route-level auth access
- Nested auth calls
- Middleware reentry

### 4. Auto-Remediation

Replace all shadow reads with:
```typescript
// BEFORE:
const { session, policy } = await withAuth();
const role = session.user.role;

// AFTER:
const { verifiedSessionSnapshot } = ctx;
const role = verifiedSessionSnapshot.roles[0].role;
```

---

## Next Steps: PHASE F2-F7

### F2: Auth Ownership Allowlist
- Explicit list of allowed auth readers
- CI gate enforcement

### F3: Static Shadow Read Detector
- Build-time scanning
- Block build on shadow reads

### F4: Runtime Shadow Read Detector
- Detect auth reads after snapshot
- Fail requests immediately

### F5: Auto-Remediation
- Replace shadow reads with snapshot access

### F6: CI Governance
- Build gate on shadow read detection
- Prevent regression

### F7: Adversarial Tests
- Test GROUP 1: Route-local getSession() blocked
- Test GROUP 2: Helper auth access blocked
- Test GROUP 3: Middleware auth reentry blocked
- Test GROUP 4-6: Various bypass attempts

---

## Final Goal

After PHASE F:

```
Request Enter
  │
  ├─ canonical-wrapper
  │   ├─ calls getSessionFact()  [ONLY SOURCE]
  │   ├─ calls getPolicyContextFact()  [ONLY SOURCE]
  │   ├─ creates snapshot (T0)
  │   └─ pass snapshot to handler
  │
  └─ Handler execution
      └─ uses ctx.verifiedSessionSnapshot  [ONLY SOURCE]
      
Result: Single auth source (snapshot)
        Snapshot is EXCLUSIVE
        Classification: TRUE_REQUEST_REALITY
```

---

**Next**: PHASE F2 — Auth Ownership Allowlist

