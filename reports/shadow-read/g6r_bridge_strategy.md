# PHASE G6R: Canonical Auth Bridge Strategy

**Generated**: 2026-05-14T12:12:00Z  
**Classification**: RUNTIME_ENFORCED_HYBRID  
**Status**: Strategy documented, ready for implementation

---

## SELECTED STRATEGY: MINIMAL CANONICAL CONTEXT

### Why NOT Tier B

This is **not** Tier B because:
- No new adapters introduced
- No "accept both types" pattern
- No relaxation of type requirements
- Instead: Upstream source (AuthContext → CanonicalAuthContext) is formalized
- Services remain strictly typed to CanonicalAuthContext
- Bridge is a **conversion**, not an adaptation layer

Tier B would be: "services accept AuthContext OR CanonicalAuthContext"  
This strategy is: "AuthContext is converted to CanonicalAuthContext before service calls"

### The Problem Precisely

**Current Flow**:
```
Route calls withAuth()
  ↓ returns AuthContext { session, policy }
  ↓
Route calls service(authContext)
  ↓ expects CanonicalAuthContext
  ✗ TYPE ERROR
```

**Root Cause**: Services require `CanonicalAuthContext.verifiedSessionSnapshot.user.id`  
But `AuthContext` has `session.user` (different structure)

**Solution**: Make CanonicalAuthContext fields compatible with AuthContext sources

---

## IMPLEMENTATION APPROACH

### Step 1: Make CanonicalAuthContext Fields More Flexible

File: `src/lib/canonical-route-enforcement.ts`

Make these fields optional (they're not used by services, only by logging/observability):
- `traceId` → `traceId?: string`
- `executionTrace` → `executionTrace?: Readonly<any>`
- `request` → `request?: NextRequest`
- `correlationId` → `correlationId?: string`
- `requestId` → `requestId?: string`

Keep these REQUIRED (services depend on them):
- `verifiedActorId: string`
- `verifiedActor: AuthenticatedUser`
- `verifiedWorkspaceId: string`
- `verifiedCapabilities: Set<string>`
- `verifiedSessionSnapshot: {...}`

### Step 2: Create AuthContext → CanonicalAuthContext Helper

File: `src/lib/auth-guard.ts` (extend existing file)

```typescript
export function canonicalizeAuthContext(
  authContext: AuthContext,
  workspaceId: string
): CanonicalAuthContext {
  const userId = authContext.session.user.id;
  const capabilities = extractCapabilities(authContext.policy);
  
  return {
    verifiedActorId: userId,
    verifiedActorType: "user",
    verifiedActor: authContext.session.user,
    verifiedWorkspaceId: workspaceId,
    verifiedCapabilities: capabilities,
    verifiedSessionSnapshot: {
      snapshotId: `snapshot-${userId}`,
      snapshotTimestamp: new Date(),
      snapshotHash: "", // TODO: compute if needed
      actorId: userId,
      workspaceId,
      capabilities: Array.from(capabilities),
    },
    // Optional fields (not used by services)
    // Intentionally omitted: traceId, executionTrace, request, correlationId, requestId
  };
}

function extractCapabilities(policy: PolicyContext): Set<string> {
  // Extract capability set from policy context
  // Implementation depends on PolicyContext structure
  return new Set(policy.roles?.map(r => r.role) || []);
}
```

### Step 3: Routes Use Helper at Service Call Boundary

**Pattern**: When a withAuth() route calls a service:

Before (breaks):
```typescript
const auth = await withAuth();
await updateUser(userId, input, auth, workspaceId);  // ✗ TYPE ERROR
```

After (with bridge):
```typescript
const auth = await withAuth();
const ctx = canonicalizeAuthContext(auth, workspaceId);
await updateUser(userId, input, ctx, workspaceId);  // ✓ OK
```

**Note**: Routes don't need to change everywhere, only at service call sites where CanonicalAuthContext is required.

---

## FILES TO MODIFY

1. **src/lib/canonical-route-enforcement.ts**
   - Make optional: traceId, executionTrace, request, correlationId, requestId
   - Rationale: These are logging/observability only, not used by services

2. **src/lib/auth-guard.ts**
   - Add `canonicalizeAuthContext()` helper
   - Add `extractCapabilities()` helper
   - Rationale: Convert legacy AuthContext to new CanonicalAuthContext

---

## RISKS & MITIGATIONS

| Risk | Severity | Mitigation |
|------|----------|-----------|
| Optional fields weaken tracing | MEDIUM | Wrapper still provides full context; legacy routes just get minimal |
| Capability extraction incorrect | MEDIUM | Test thoroughly against all role types |
| Performance (conversion overhead) | LOW | Single object construction per request |
| Missed conversion at some call site | MEDIUM | Compiler will catch most; code review for remainder |

---

## VALIDATION REQUIRED

1. **TypeScript Compilation**: Must pass with CanonicalAuthContext fields optional
2. **Service Tests**: Verify services work with canonicalized context
3. **Wrapper Tests**: Verify canonical wrapper still produces full context
4. **Legacy Route Tests**: Verify withAuth() routes can call services via bridge
5. **Permission Tests**: Verify capabilities extracted correctly

---

## Why This is NOT Tier B

- **Tier B Definition**: Multiple implementations handling one semantic (e.g., "accept both AuthContext and CanonicalAuthContext")
- **This Approach**: Single semantic (CanonicalAuthContext), with one source (AuthContext) converted to it
- **Location**: Bridge in auth layer, not scattered across routes/services
- **Scope**: Affects only auth-to-service boundary, not application logic

---

## Classification Preservation

**Before G6R**: RUNTIME_ENFORCED_HYBRID  
**After G6R**: RUNTIME_ENFORCED_HYBRID  

Bridge does NOT change:
- Runtime enforcement behavior
- Shadow read checking
- Workspace scoping
- Permission semantics
- Immutability guarantees

Bridge ONLY resolves:
- Type-contract mismatch between legacy withAuth() and new services

---

## No Route Migration Required

**Critical**: This bridge enables routes to work WITHOUT MIGRATION.

Routes continue using:
- `withAuth()`
- `requireAuth()`
- `requireAuthForCapability()`

Routes gain:
- Ability to call services via `canonicalizeAuthContext()` helper
- Compile-time type safety
- Path to gradual migration (no forced refactor)

---

## Next Steps

1. Implement strategy above
2. Run tests (phase-d, phase-e, phase-f)
3. Verify TypeScript compilation
4. Document in G6R-C implementation
