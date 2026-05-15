# X9C-1: Contract Confirmation

**Phase:** X9C-1 (Policy Wrapper Foundation Implementation)  
**Date:** 2026-05-15  
**Status:** CONTRACT CONFIRMED

---

## Contract Confirmation Findings

### Location: withCanonicalEnforcement Implementation
**File:** `src/lib/canonical-route-enforcement.ts`
**Type:** Exported function wrapper
**Signature:**
```typescript
export function withCanonicalEnforcement(
  handler: CanonicalHandler,
  options?: {
    requireWorkspace?: boolean;
    requireCapabilities?: string[];
    requireActorType?: "user" | "service" | ("user" | "service")[];
  }
): (req: NextRequest, context: { params: Promise<Record<string, string>> }) => Promise<NextResponse>
```
**Behavior:** Enforces identity, workspace, and capability checks BEFORE handler execution (fail-closed)
**Handler Call:** Line 380: `const result = await handler(verifiedContext, params);`
**Result:** Returns NextResponse with handler result (200) or error response (500)

### Location: CanonicalAuthContext Definition
**File:** `src/lib/canonical-route-enforcement.ts`
**Type:** Exported interface
**Fields:**
- `verifiedActorId: string` - Verified user/service ID
- `verifiedActorType: "user" | "service"` - Actor type
- `verifiedActor: AuthenticatedUser` - Full user object
- `verifiedWorkspaceId: string` - Verified workspace
- `verifiedCapabilities: Set<string>` - Pre-computed capabilities
- `policy?: PolicyContext` - Optional policy from auth system (line 88)
- `session?: SessionInfo` - Session info
- `request?: NextRequest` - Raw request
- `correlationId, requestId, traceId` - Tracing info

### Location: PolicyContext Definition
**File:** `src/policies/capability-check.ts` (line 241)
**Type:** Exported interface
**Fields:**
```typescript
export interface PolicyContext {
  userId: string;
  roles: Array<{
    role: RoleName;
    scope?: string | null;
    scopeId?: string | null;
  }>;
  engagementMemberships?: Array<{
    engagementId: string;
    role: RoleName;
  }>;
}
```

### Location: hasInternalAccess Helper
**File:** `src/policies/capability-check.ts` (line 328)
**Type:** Exported function
**Signature:**
```typescript
export function hasInternalAccess(ctx: PolicyContext): boolean
```
**Logic:** Returns true if any role is non-client role

### Location: Policy Context Sourcing
**File:** `src/lib/canonical-route-enforcement.ts`
**Step:** STEP 3 (around line 200-250) - Fetches policy
**Function:** `getPolicyContextFact(sessionSnapshot.actor.id, workspaceId)`
**Source:** `src/services/auth.ts`
**Behavior:** Fetches fresh policy per request

### Contract Requirements Confirmed

✓ **withCanonicalEnforcement is foundational**
- All auth checks happen here
- Policy is already being fetched (line 3: getPolicyContextFact import)
- Policy is already in CanonicalAuthContext (line 88)
- Handler only called AFTER all checks pass

✓ **PolicyContext is trustworthy**
- Comes from auth system (not user-provided)
- Immutable by handler (passed as readonly)
- Accessible to routes via ctx.policy (optional)

✓ **hasInternalAccess is available**
- Exported from capability-check.ts
- Takes PolicyContext as input
- Returns boolean based on role check

✓ **New wrapper must:**
- Layer on top of withCanonicalEnforcement (not replace)
- Apply policy-specific checks AFTER identity checks
- Fail-closed if policy missing/stale/invalid
- NOT modify verified context
- NOT weaken existing auth guarantees

---

## Implementation Strategy

### Wrapper Architecture
```
withCanonicalPolicyEnforcement
    └─ calls withCanonicalEnforcement
        └─ returns async function
            ├─ Receives: NextRequest, params
            ├─ Wraps handler with policy checks
            │   ├─ Call withCanonicalEnforcement wrapper
            │   ├─ If succeeds: receives CanonicalAuthContext
            │   ├─ Apply policy checks (fail-closed)
            │   ├─ If checks pass: call handler
            │   └─ Return result
            └─ Returns: NextResponse
```

### Key Design Points
1. **Layering:** Wrapper on top (not replacement)
2. **Fail-Closed:** Policy checks return 403 if fail
3. **No Weakening:** Existing auth checks still enforced
4. **Type Safety:** No any/as any
5. **Immutability:** No mutation of context

---

## Contract Verification

**All contract points confirmed and ready for implementation:**
- ✓ withCanonicalEnforcement location and behavior understood
- ✓ CanonicalAuthContext structure confirmed
- ✓ PolicyContext definition understood
- ✓ hasInternalAccess availability confirmed
- ✓ Policy sourcing mechanism confirmed
- ✓ No unauthorized files will be changed
- ✓ No features will be added beyond wrapper
- ✓ No capabilities will be changed
- ✓ No any/as any will be introduced

**Ready for implementation.**

---

**Status:** ✓ Contract Confirmed
