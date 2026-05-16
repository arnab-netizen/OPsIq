# R1-D2-A: Wrapper Signature Confirmation

**Date:** 2026-05-16  
**Phase:** R1-D2-A (Implementation)

---

## A. Canonical Enforcement Wrapper Signature

### Function Signature
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

**Status:** ✓ CONFIRMED

---

## B. Handler Signature
```typescript
export type CanonicalHandler = (ctx: CanonicalAuthContext, params: Record<string, string>) => Promise<any>;
```

**Status:** ✓ CONFIRMED

---

## C. CanonicalAuthContext Interface

### Mandatory Fields
- `verifiedActorId: string` - Actor ID (always present if handler called)
- `verifiedActorType: "user" | "service"` - Actor type
- `verifiedActor: AuthenticatedUser` - Full actor object
- `verifiedWorkspaceId: string` - Workspace ID (if workspace-scoped)
- `verifiedCapabilities: Set<string>` - Verified capabilities

### Session Snapshot (Phase E)
- `verifiedSessionSnapshot: { snapshotId, snapshotTimestamp, snapshotHash, actorId, workspaceId, capabilities }`

### Optional Fields
- `traceId?: string` - Execution trace ID
- `executionTrace?: Readonly<any>` - Read-only trace reference
- `correlationId?: string` - Request correlation ID
- `requestId?: string` - Request ID
- `request?: NextRequest` - Raw request object
- `session?: SessionInfo` - Session info
- `policy?: PolicyContext` - Policy context

**Status:** ✓ CONFIRMED

---

## D. Capability Check Helper

### Function Pattern (from R1-A/B/C/D successful routes)
```typescript
// Option 1: At wrapper level
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // handler logic
  },
  { requireCapabilities: ["CAPABILITY_NAME"] }
);

// Option 2: At handler level (less common, wrapper level preferred)
if (!ctx.verifiedCapabilities.has("CAPABILITY_NAME")) {
  throw new UnauthorizedError("Insufficient capabilities");
}
```

**Verified Pattern:** ✓ WORKS IN PREVIOUS PHASES

---

## E. Field Access Verification

### Verified Safe Fields
- ✓ `ctx.verifiedActorId` - Direct access, always present
- ✓ `ctx.verifiedWorkspaceId` - Direct access, always present (for workspace-scoped routes)
- ✓ `ctx.verifiedCapabilities` - Set type, safe membership testing
- ✓ `ctx.verifiedSessionSnapshot.actorId` - Safe, snapshot is immutable
- ✓ `ctx.verifiedSessionSnapshot.workspaceId` - Safe, snapshot is immutable

**All Fields Safe:** ✓ YES

---

## F. Service Integration

### ServiceAuthEnvelope Pattern (When Calling Services)

**DO:**
```typescript
// Create envelope for service call
const serviceEnvelope = {
  verifiedActorId: ctx.verifiedActorId,
  verifiedActorType: ctx.verifiedActorType,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,
  verifiedCapabilities: ctx.verifiedCapabilities,
  hasInternalAccess: /* check policy */,
};

// Call service with envelope
const result = await service.doSomething(id, envelope, workspaceId);
```

**DON'T:**
- ✗ Pass raw ctx to service
- ✗ Modify envelope fields
- ✗ Create new envelope without verified context
- ✗ Call auth services from handler

**Status:** ✓ PATTERN SAFE

---

## G. Wrapper Signature Status

### Is Wrapper Signature Clear and Safe?

**Answer: ✓ YES - CLEAR AND PROVEN SAFE**

**Verification:**
1. ✓ Signature matches previous successful phases (R1-A, R1-B, R1-C, R1-D)
2. ✓ Handler receives only verified context
3. ✓ Capability checking works at wrapper level
4. ✓ Context fields are safe and immutable
5. ✓ Service integration pattern is proven
6. ✓ Zero type errors in previous phases

**Authorization:** ✓ PROCEED WITH IMPLEMENTATION

---

**Status: ✓ WRAPPER SIGNATURE CONFIRMED - READY FOR ROUTE IMPLEMENTATION**

