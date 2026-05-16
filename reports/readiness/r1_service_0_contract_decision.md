# R1-SERVICE-0: Service Contract Strategy Decision

**Date:** 2026-05-16  
**Phase:** R1-SERVICE-0 Contract Design Audit  
**Decision:** CREATE_VERIFIED_SERVICE_CONTEXT

---

## A. Selected Strategy

### ✓ Option C: Create Minimal VerifiedServiceContext Type

**Core Decision:**
- Define new `VerifiedServiceContext` type as the stable service boundary
- Services transition from ServiceAuthEnvelope → VerifiedServiceContext
- Routes create adapters from CanonicalAuthContext → VerifiedServiceContext at call sites

---

## B. Service Contract Definition

### VerifiedServiceContext Interface

```typescript
/**
 * Minimal verified context for service layer
 *
 * All fields are readonly and guaranteed by wrapper layer.
 * Services receive only verified decisions.
 * Services NEVER call auth functions or re-verify.
 */
export interface VerifiedServiceContext {
  // Mandatory: Core verified identity and scope
  readonly verifiedActorId: string;
  readonly verifiedWorkspaceId: string;
  
  // Mandatory: Verified capability decision
  readonly verifiedCapabilities: ReadonlySet<string>;
}
```

**Why Minimal?**
1. Services need only these 3 fields for business decisions
2. No `hasInternalAccess`, no policy, no actor details
3. If service needs policy/actor context, it's a design smell (policy should be in route)
4. Minimalism enforces correct responsibility boundary

**What Services DO Get:**
- Guaranteed verified actor ID
- Guaranteed verified workspace ID
- Guaranteed verified capabilities (from policy evaluation)

**What Services DO NOT Get:**
- Raw session data (should be in route decision)
- Raw policy context (should be evaluated at route level)
- Actor object details (should be in route decision)
- Request data (should be route's responsibility)

---

## C. Route Adapter Pattern

### Adapter Creation Rule

Routes using `withCanonicalEnforcement` create VerifiedServiceContext from CanonicalAuthContext:

```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const findingId = params.findingId;
    
    // 1. Validate input
    const input = parseOrThrow(updateFindingSchema, body);
    
    // 2. Create service context (required for services accepting VerifiedServiceContext)
    const serviceCtx: VerifiedServiceContext = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities
    };
    
    // 3. Call service with verified context
    const result = await updateFinding(findingId, input, serviceCtx);
    
    return Response.json(result);
  },
  { requireCapabilities: ["FINDING_UPDATE"], requireWorkspace: true }
);
```

**Adapter Pattern Rules:**
1. Always in route handler (not extracted to helper initially)
2. Always immediately before service call
3. Only 3 fields (same every time)
4. TypeScript enforces completeness
5. If more than 3 routes call same service, extract helper function

---

## D. Service Responsibility Boundary

### Services MUST:
✓ Use verified context fields for access control  
✓ Validate business inputs  
✓ Emit audit events with verified actorId  
✓ Query databases filtered by verifiedWorkspaceId  
✓ Check capabilities against verifiedCapabilities set  
✓ Assume all context fields are guaranteed verified  

### Services MUST NOT:
✗ Call auth functions (getSession, requireSession, etc.)  
✗ Re-verify capabilities (already verified)  
✗ Re-verify workspace membership (already verified)  
✗ Accept raw request data (route's job)  
✗ Construct or modify verified context  
✗ Call PolicyContext functions (already evaluated)  

---

## E. Route Responsibility Boundary

### Routes MUST:
✓ Authenticate (via withCanonicalEnforcement wrapper)  
✓ Verify capabilities (via requireCapabilities option)  
✓ Verify workspace membership (via requireWorkspace option)  
✓ Parse and validate request input  
✓ Create VerifiedServiceContext adapter  
✓ Call services with verified context  
✓ Handle service errors  
✓ Return responses  

### Routes MUST NOT:
✗ Call auth functions (wrapper does this)  
✗ Fetch session data (wrapper provides verified snapshot)  
✗ Construct ServiceAuthEnvelope manually  
✗ Skip capability checks (declare in options)  
✗ Modify verified context  

---

## F. Audit and Event Responsibility

### Routes Responsible For:
- Initial request logging
- Request validation errors
- Authorization decision errors
- Route-level audit events (if needed)

### Services Responsible For:
- Business operation audit events
- Service-level errors
- State change logging
- Mutation recording

### Example:
```typescript
// Route logs: "Received PATCH /findings/{id}"
// Service logs: "Updated finding {id} from {old} to {new}"
// Service emits: "FINDING_UPDATED" audit event with verifiedActorId
```

---

## G. Capability Responsibility

### Routes Declare Required Capabilities:
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx, params) => { /* ... */ },
  { requireCapabilities: ["FINDING_UPDATE"] }  // Route declares
);
```

### Services Assume Capabilities Are Verified:
```typescript
// In updateFinding() service:
// - Assumes verifiedCapabilities includes "FINDING_UPDATE"
// - Does NOT call hasCapability() or checkCapability()
// - Uses capability context only for advanced filtering if needed
```

---

## H. Workspace Responsibility

### Routes Declare Workspace Requirement:
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx, params) => { /* ... */ },
  { requireWorkspace: true }  // Route declares
);
```

### Services Assume Workspace Is Verified:
```typescript
// In updateFinding() service:
// - Assumes verifiedWorkspaceId is the user's actual workspace
// - Filters all queries by verifiedWorkspaceId
// - Does NOT re-check workspace membership
// - Does NOT accept workspace ID from request params
```

---

## I. Rollback Rule

**If VerifiedServiceContext Implementation Breaks:**

1. Revert service signatures: `VerifiedServiceContext` → `ServiceAuthEnvelope`
2. Remove adapters from routes
3. Restore `canonicalizeAuthContext()` calls in legacy routes
4. No service logic rollback needed (none changed)
5. Cost: Low (mostly signature reversions)

**If Specific Service Fails:**
- Revert that service only
- Keep VerifiedServiceContext type defined
- Other services continue with new contract

---

## J. Type Removal Sequence

**Phase 1 (now - R1-SERVICE-0):**
- Define VerifiedServiceContext
- ServiceAuthEnvelope still exists (used by legacy routes)

**Phase 2 (R1-D2-B onwards):**
- All routes accepting ServiceAuthEnvelope updated to VerifiedServiceContext
- ServiceAuthEnvelope no longer used in route handlers
- ServiceAuthEnvelope may still exist for internal service use

**Phase 3 (future cleanup):**
- Remove ServiceAuthEnvelope entirely if no service uses it
- Update documentation

---

## K. Contract Summary Table

| Aspect | Responsibility | Details |
|--------|----------------|---------|
| Authentication | Route wrapper (withCanonicalEnforcement) | Verify actor identity before handler runs |
| Authorization (Capabilities) | Route declaration + wrapper | Route declares required capabilities, wrapper verifies, service assumes verified |
| Authorization (Workspace) | Route declaration + wrapper | Route declares requireWorkspace, wrapper verifies, service assumes verified |
| Context Verification | Route wrapper | Guarantees all CanonicalAuthContext fields are verified before handler |
| Service Context Adapter | Route handler | Creates minimal VerifiedServiceContext from CanonicalAuthContext |
| Business Logic | Service layer | Assumes context is verified, executes business operations |
| Audit Events | Service + Route | Route logs request, service logs operations with verifiedActorId |
| Input Validation | Route + Service | Route validates request format, service validates business rules |

---

## L. Exactly Which Fields in Contract

### VerifiedServiceContext (in service boundary):
```typescript
{
  readonly verifiedActorId: string;         // Who
  readonly verifiedWorkspaceId: string;     // Scope
  readonly verifiedCapabilities: ReadonlySet<string>;  // What
}
```

### CanonicalAuthContext (in route handler):
```typescript
{
  verifiedActorId: string;
  verifiedActorType: "user" | "service";
  verifiedActor: AuthenticatedUser;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  verifiedSessionSnapshot: { /* */ };
  session?: SessionInfo;
  policy?: PolicyContext;
  // ... trace/correlation IDs
}
```

### Mapping:
```
CanonicalAuthContext.verifiedActorId 
  → VerifiedServiceContext.verifiedActorId

CanonicalAuthContext.verifiedWorkspaceId 
  → VerifiedServiceContext.verifiedWorkspaceId

CanonicalAuthContext.verifiedCapabilities 
  → VerifiedServiceContext.verifiedCapabilities
```

---

## M. Safety Guarantees

**Authorization Safety:** ✓ PRESERVED
- Routes declare required capabilities
- Wrapper verifies before handler runs
- Services assume verification done
- No weakening possible

**Workspace Safety:** ✓ PRESERVED
- Routes declare workspace requirement
- Wrapper verifies workspace membership
- Services query only by verifiedWorkspaceId
- Cross-workspace access impossible

**Type Safety:** ✓ STRONG
- VerifiedServiceContext is minimal, strongly typed
- No optional fields (all guaranteed)
- No `any` types
- TypeScript enforces adapter completeness

**Audit Trail:** ✓ PRESERVED
- Services receive verifiedActorId
- All mutations audited with correct actor
- Policy decisions logged at route level
- Blame chain clear

---

## N. Decision Rationale

**Why Option C over alternatives:**

1. **vs Option A (Inline Adapter):** Option C is better organized with a named type, but if emergent complexity suggests Option A, we can fall back
2. **vs Option B (Full Refactor):** Option B is higher risk and slower; Option C gives same long-term benefit with lower immediate cost
3. **vs Option D (Dual Format):** Option D is unsafe; Option C avoids dual-path complexity
4. **vs Option E (Helper Functions):** Option C is slightly cleaner with a named type

**Why now:**
- 40+ routes are blocked waiting for service contract clarity
- Decision must be made before implementation can proceed
- No further service analysis will change the core issue: inconsistent input types

---

## O. Final Verdict

**DECISION: ✓ CREATE_VERIFIED_SERVICE_CONTEXT**

Service boundary contract selected: `VerifiedServiceContext`

Route adapter pattern: Create inline from CanonicalAuthContext at each service call

Implementation ready to proceed to: R1-SERVICE-0 pilot selection

Expected scanner reduction: 140 violations (phased across 40+ routes)

---

**Status: SERVICE BOUNDARY STRATEGY DECIDED - READY FOR PILOT SELECTION**
