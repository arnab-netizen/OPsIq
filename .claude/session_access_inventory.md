# PHASE E STEP E1: SESSION ACCESS INVENTORY — CONSOLIDATED REQUEST REALITY

**Status**: IN PROGRESS  
**Date**: 2026-05-14  
**Scope**: Complete audit of all auth-related reads and access patterns  
**Risk Assessment**: Split-brain auth reality, multiple fetch points, replay-unsafe patterns  

---

## Executive Summary

Audit of auth access patterns reveals critical fragmentation:
- **24+ routes** perform direct `getSession()` calls (downstream lookups)
- **2 instances** of `hasCapability()` (duplicate logic in different modules)
- **Multiple getSession() calls** in single request path (getPolicyContext calls getSession again)
- **No immutable snapshot** guarantee between auth check and handler execution
- **Replay vulnerability**: Mid-request session state changes not detected

PHASE E consolidates all auth access into ONE immutable snapshot taken at wrapper entry.

---

## Tier 1: Core Auth Access Points

### Access Point 1.1: getSession()

**Location**: `src/services/auth.ts:41`

```typescript
export async function getSession(workspaceId: string = "system"): Promise<SessionInfo | null> {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(SESSION_COOKIE_NAME)?.value;
  const session = await db.session.findUnique({...});
  return session;
}
```

**Type**: CANONICAL (foundational)  
**Calls**: Direct DB query  
**Returns**: SessionInfo | null  
**Used By**: 
- canonical-route-enforcement.ts (line 163)
- workspace-enforcement.ts middleware (line 22)
- Multiple routes directly

**Risk Level**: 🔴 CRITICAL
- Called multiple times in request lifecycle
- No caching
- Each call can see different state
- getPolicyContext() calls getSession() again internally

---

### Access Point 1.2: requireSession()

**Location**: `src/services/auth.ts:82`

```typescript
export async function requireSession(workspaceId: string = "system"): Promise<SessionInfo> {
  const session = await getSession(workspaceId);
  if (!session) throw new UnauthorizedError("Valid session required");
  return session;
}
```

**Type**: LEGACY_THROWING  
**Status**: Deprecated (PHASE F removal)  
**Risk Level**: 🟡 MEDIUM
- Throws errors (legacy semantic)
- Should not be in production new code

---

### Access Point 1.3: getPolicyContext()

**Location**: `src/services/auth.ts:90`

```typescript
export async function getPolicyContext(workspaceId: string = "system"): Promise<PolicyContext | null> {
  const session = await getSession(workspaceId);  // ← CALLS getSession() AGAIN
  const [roleAssignments, engagementMemberships] = await Promise.all([
    db.userRoleAssignment.findMany({...}),
    db.engagementMembership.findMany({...}),
  ]);
  return { userId, roles, engagementMemberships };
}
```

**Type**: DUPLICATE_ACCESS  
**Calls**: 
- getSession() (redundant)
- DB: userRoleAssignment.findMany()
- DB: engagementMembership.findMany()

**Risk Level**: 🔴 CRITICAL
- **DUPLICATE**: Calls getSession() again despite canonical wrapper already fetched it
- **INDEPENDENT DB QUERIES**: Three separate database accesses
- **STATE DIVERGENCE**: If session is revoked between calls, getPolicyContext sees null but canonical wrapper saw valid session

---

### Access Point 1.4: requirePolicyContext()

**Location**: `src/services/auth.ts:130`

```typescript
export async function requirePolicyContext(workspaceId: string = "system"): Promise<PolicyContext> {
  const ctx = await getPolicyContext(workspaceId);
  if (!ctx) throw new UnauthorizedError("Authentication required");
  return ctx;
}
```

**Type**: LEGACY_THROWING  
**Status**: Deprecated (PHASE F removal)  
**Risk Level**: 🟡 MEDIUM

---

## Tier 2: Fact-Based Access (PHASE A)

### Access Point 2.1: getSessionFact()

**Location**: `src/services/auth.ts:162`

```typescript
export async function getSessionFact(workspaceId: string = "system"): Promise<SessionFact> {
  const session = await getSession(workspaceId);
  if (!session) {
    return buildSessionFact(null, "not_found");
  }
  return buildSessionFact(session, undefined);
}
```

**Type**: CANONICAL (PHASE A)  
**Used By**: canonical-route-enforcement.ts  
**Calls**: getSession()  

**Risk Level**: 🟡 MEDIUM
- Better than legacy (non-throwing)
- Still calls getSession() which can drift
- Fact built from single snapshot (good)

---

### Access Point 2.2: getPolicyContextFact()

**Location**: `src/services/auth.ts:183`

```typescript
export async function getPolicyContextFact(workspaceId: string = "system"): Promise<PolicyFact> {
  const policy = await getPolicyContext(workspaceId);
  if (!policy) {
    return buildPolicyFact(null, "not_found");
  }
  return buildPolicyFact(policy, undefined);
}
```

**Type**: CANONICAL (PHASE A)  
**Used By**: canonical-route-enforcement.ts  
**Calls**: getPolicyContext() → getSession() (REDUNDANT)  

**Risk Level**: 🔴 CRITICAL
- getPolicyContext() calls getSession() again
- Canonical wrapper already called getSessionFact()
- **DOUBLE FETCH**: Two independent session fetches in single request

---

## Tier 3: Downstream Route Access

### Access Point 3.1-3.24: Direct getSession() in Routes

**Pattern Found**: 24+ routes call `getSession()` directly

```typescript
// Examples:
src/app/api/value/route.ts:8 - const session = await getSession();
src/app/api/operator/route.ts:16 - const session = await getSession();
src/app/api/governance/alerts/route.ts:8 - const session = await getSession();
src/app/api/operator/myday/route.ts:6 - const session = await getSession();
src/app/api/decisions/[decisionId]/fail/route.ts:5 - const session = await getSession();
src/app/api/scenario/route.ts:7 - const session = await getSession();
src/app/api/onboarding/invite/route.ts:6 - const session = await getSession();
... (18+ more)
```

**Type**: DOWNSTREAM_LOOKUP  
**Pattern**: Route handler calls getSession() directly AFTER wrapper auth check  
**Risk Level**: 🔴 CRITICAL
- Wrapper already verified auth and created trace
- Handler re-fetches session from DB (REDUNDANT)
- Handler sees potentially DIFFERENT session state (mid-request changes not detected)
- Violates single-snapshot principle

---

### Access Point 3.2: Middleware getSession()

**Location**: `src/middleware/workspace-enforcement.ts:22`

```typescript
const session = await getSession();
```

**Type**: MIDDLEWARE_ACCESS  
**Risk Level**: 🔴 CRITICAL
- Middleware runs BEFORE canonical wrapper
- Creates auth state BEFORE wrapper traces it
- Wrapper then creates DIFFERENT auth snapshot
- Result: Two auth realities exist for same request

---

## Tier 4: Capability Checks

### Access Point 4.1: hasCapability() in entitlement.ts

**Location**: `src/services/entitlement.ts:212`

```typescript
export function hasCapability(workspaceId: string, capability: Capability): boolean {
  // Inline capability check logic
}
```

**Type**: DUPLICATE_LOGIC  
**Used By**: Lines 287, 325, 363 (internal to service)  
**Risk Level**: 🟡 MEDIUM
- Duplicate of hasCapability in member-enforcement.ts
- No single canonical source

---

### Access Point 4.2: hasCapability() in member-enforcement.ts

**Location**: `src/services/workspace/member-enforcement.ts:202`

```typescript
export function hasCapability(workspaceId: string, userId: string, capability: CapabilityName): boolean {
  // Different signature, different logic
}
```

**Type**: DUPLICATE_LOGIC  
**Used By**: Lines 227, 358, 371  
**Risk Level**: 🟡 MEDIUM
- Duplicate logic, different signature
- No synchronization

---

## Access Classification Matrix

| Access Point | Type | Location | Risk | Status |
|--------------|------|----------|------|--------|
| getSession() | CANONICAL | services/auth.ts | CRITICAL | Primary source |
| requireSession() | LEGACY | services/auth.ts | MEDIUM | Deprecated |
| getPolicyContext() | DUPLICATE_CALL | services/auth.ts | CRITICAL | Calls getSession again |
| requirePolicyContext() | LEGACY | services/auth.ts | MEDIUM | Deprecated |
| getSessionFact() | CANONICAL | services/auth.ts | MEDIUM | Good (PHASE A) |
| getPolicyContextFact() | CANONICAL_BUT_DUPE | services/auth.ts | CRITICAL | Calls getSession via getPolicyContext |
| Direct route getSession() | DOWNSTREAM | app/api/*/route.ts | CRITICAL | 24+ locations |
| Middleware getSession() | MIDDLEWARE_REENTRY | middleware/ | CRITICAL | Before wrapper |
| hasCapability() (entitlement) | DUPLICATE_LOGIC | services/entitlement.ts | MEDIUM | Duplicate |
| hasCapability() (member) | DUPLICATE_LOGIC | services/workspace/ | MEDIUM | Duplicate |

---

## Split-Brain Risks Identified

### Risk 1: Double Session Fetch

```
Request Enter
  ├─ canonical-wrapper calls getSessionFact()
  │   └─ getSessionFact() calls getSession()  ← DB FETCH 1
  │
  ├─ canonical-wrapper calls getPolicyContextFact()
  │   └─ getPolicyContextFact() calls getPolicyContext()
  │       └─ getPolicyContext() calls getSession()  ← DB FETCH 2 (different state!)
  │
  └─ Handler execution
      └─ Route calls getSession() directly  ← DB FETCH 3
```

**Impact**: Three independent database queries, each can see different session state

---

### Risk 2: Middleware Reentry

```
Request Enter
  ├─ workspace-enforcement middleware
  │   └─ calls getSession()  ← DB FETCH (untraced)
  │
  ├─ canonical-wrapper enters
  │   └─ calls getSessionFact()  ← DB FETCH 2 (different trace)
  │
  └─ Auth decision made on WRAPPER state, not MIDDLEWARE state
```

**Impact**: Two auth states exist for same request, with no lineage connection

---

### Risk 3: Downstream Handler Lookups

```
Wrapper decides: ALLOW (based on snapshot S1 at T1)
  │
  └─ Handler execution starts
      └─ Handler calls getSession() directly
          └─ Fetches from DB at T2
          
If session revoked between T1 and T2:
  - Wrapper allowed based on S1 (valid)
  - Handler operates with different state
  - Result: Inconsistent request semantics
```

**Impact**: Handler operates on different auth reality than wrapper decision

---

### Risk 4: Capability Check Fragmentation

```
Wrapper checks: hasCapability(AUDIT_READ)
  ├─ Uses capability resolver (canonical-capability-resolver.ts)

Handler later checks: hasCapability(AUDIT_READ)
  └─ Uses different hasCapability() in member-enforcement.ts
  
If capability definitions differ:
  - Wrapper allowed, handler forbids (or vice versa)
  - Request semantic is inconsistent
```

**Impact**: Capability interpretation drifts

---

## Replay Vulnerability

### Scenario: Replay with Session Revocation

**Original Request at T0**:
```
Request arrives with correlationId: corr-123
Wrapper: getSessionFact() → sessionValid: true
Wrapper: getPolicyContextFact() → policyValid: true
Handler: executes with verified snapshot
Decision: ALLOW (200)
```

**Replayed Request at T0 + 1 hour with correlationId: corr-123**:
```
Request arrives with correlationId: corr-123 (linked replay)
Wrapper: getSessionFact() → sessionValid: false (session expired)
Wrapper: getPolicyContextFact() → policyValid: false
Handler: never executes
Decision: DENY (401)
```

**Issue**: Same correlation ID, completely different auth interpretation (replay-unsafe)

PHASE E solution: Snapshot at entry, immutable for request lifetime, logged in trace.

---

## Consolidation Strategy

### Current (Fragmented)
```
getSession() [3+ calls]
  ├─ canonical-auth-facts wrapper
  ├─ getPolicyContext() internal call
  └─ route-level direct call

Result: Multiple auth realities
```

### After PHASE E (Consolidated)
```
CanonicalVerifiedSession [1 snapshot, immutable]
  ├─ Created at wrapper entry
  ├─ Owned by CanonicalExecutionTrace
  ├─ Passed to handler as read-only
  └─ No downstream lookups allowed

Result: Single request reality
```

---

## Mandatory Changes for PHASE E2-E4

### 1. Create CanonicalVerifiedSession Type

Must capture:
- Actor identity (immutable)
- Session identity and validity state
- Workspace membership snapshot
- Role assignments snapshot
- Engagement memberships snapshot
- Entitlement snapshot
- Policy snapshot
- Capability snapshot
- Revocation state
- Snapshot timestamp
- Trace lineage binding
- Immutability seal

### 2. Consolidate getSessionFact() + getPolicyContextFact()

Combined into single snapshot function:
```typescript
async function createCanonicalVerifiedSession(
  workspaceId: string,
  correlationId: string,
  requestId: string,
): Promise<CanonicalVerifiedSession>
```

**Single call**: One DB fetch for all auth state

### 3. Trace Ownership

CanonicalExecutionTrace contains:
```typescript
canonicalVerifiedSession: CanonicalVerifiedSession;
sessionSnapshotId: string;  // immutable reference
sessionSnapshotHash: string;  // integrity check
```

### 4. Eliminate Downstream Lookups

Routes forbidden from calling:
- ❌ getSession()
- ❌ getPolicyContext()
- ❌ hasCapability() (use ctx.verifiedCapabilities)
- ❌ Any auth re-fetch

---

## Inventory Summary

| Category | Count | Risk | Action |
|----------|-------|------|--------|
| CANONICAL access points | 2 | MEDIUM | Consolidate into single snapshot |
| LEGACY access points | 2 | MEDIUM | Deprecate (PHASE F) |
| DUPLICATE calls | 1 | CRITICAL | Eliminate getPolicyContext call in getSessionFact |
| DOWNSTREAM routes | 24+ | CRITICAL | Forbid, use ctx snapshot |
| MIDDLEWARE reentry | 1 | CRITICAL | Move to wrapper |
| Duplicate hasCapability() | 2 | MEDIUM | Consolidate |

---

## Conclusion

Current system has SPLIT-BRAIN auth reality with 26+ independent auth access points. PHASE E consolidates to ONE immutable snapshot taken at wrapper entry, owned by trace, immutable for request lifetime.

---

**Next**: PHASE E2 — Create CanonicalVerifiedSession type

