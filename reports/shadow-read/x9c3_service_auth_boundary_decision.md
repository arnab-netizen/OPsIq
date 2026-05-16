# X9C-3 Phase D: Service Auth Boundary Design Decision

**Phase:** X9C-3 (Service Auth Boundary Design)  
**Date:** 2026-05-15  
**Status:** DESIGN SELECTED - READY FOR IMPLEMENTATION PLANNING

---

## Decision Summary

**SELECTED DESIGN: Option D (ServiceAuthEnvelope)**

This document finalizes the service auth boundary design for all subsequent service refactoring work.

---

## Selection Rationale

### Why ServiceAuthEnvelope

**Strengths:**
1. **Type Safety:** ServiceAuthEnvelope is an explicit TypeScript interface, not a loose object. Prevents field access misuse at compile time.
2. **Readonly:** All fields are `readonly`, preventing accidental mutation or re-assignment. TypeScript enforces immutability.
3. **Clear Contract:** Service function signatures explicitly declare what auth data is expected. Reading the signature tells the story.
4. **Phased Migration:** Routes and services can be refactored independently and in phases. No mass cutover required.
5. **Minimal Risk:** ServiceAuthEnvelope is a single new type definition. Services adopt it incrementally.
6. **Flexible:** Supports mandatory fields (verifiedActorId, verifiedWorkspaceId, verifiedCapabilities, hasInternalAccess) and optional fields (verifiedActor, policy) for complex cases.
7. **Testable:** Clear semantics for test fixture construction. Tests explicitly pass verified decisions, not raw auth data.
8. **Auditable:** Which services use which auth fields becomes clear through code review. Easy to track policy dependencies.
9. **Fails Closed:** Missing envelope fields default to denied access (falsy capabilities, no policy). No permissive defaults.

### Why Not Other Options

**Option A (All Services Accept CanonicalAuthContext):**
- ✗ Too permissive - services could access optional fields (policy, session) they shouldn't
- ✗ Unclear what fields services should use - design intent rather than type enforcement
- ✗ Doesn't force the refactoring that improves service design
- ✗ Discipline-based rather than type-system based

**Option B (Services Accept Minimal Explicit Parameters Only):**
- ✗ Implementation complexity extremely high - 27+ services, all callers, all tests must change
- ✗ Disruptive - mass refactor with high failure risk
- ✗ Risk of breaking non-migrating routes during transition

**Option C (Split Service Contracts):**
- ✗ Multiple contract categories creates confusion
- ✗ Requires strong discipline to prevent context misuse
- ✗ Categories unclear and hard to audit

**Option E (Service-Side Canonicalization):**
- ✗✗ **ABSOLUTELY REJECTED** - Violates fundamental security principle
- ✗✗ Services must NEVER upgrade weak auth into canonical auth
- ✗✗ Only routes/wrappers perform canonicalization

---

## ServiceAuthEnvelope Interface Specification

```typescript
/**
 * ServiceAuthEnvelope: Type-safe auth decisions for service layer
 * 
 * Services receive ONLY verified decisions from routes/wrappers.
 * All fields are readonly to prevent mutation.
 * Services must never construct or modify this object.
 * 
 * Usage:
 *   Services accept this as a parameter
 *   Services read fields for decisions
 *   Services NEVER call auth functions
 *   Services NEVER re-verify auth
 */
export interface ServiceAuthEnvelope {
  // Mandatory: Core verified identity and scope
  readonly verifiedActorId: string;
  readonly verifiedActorType: "user" | "service";
  readonly verifiedWorkspaceId: string;

  // Mandatory: Verified capability decision
  readonly verifiedCapabilities: ReadonlySet<string>;
  readonly hasInternalAccess: boolean;

  // Optional: Actor details for complex cases
  readonly verifiedActor?: Readonly<{
    id: string;
    email?: string;
    name?: string;
  }>;

  // Optional: Policy context for policy-aware services ONLY
  // Only included if service explicitly handles policy semantics
  readonly policy?: Readonly<PolicyContext>;
}
```

---

## How Routes Construct ServiceAuthEnvelope

**Location:** In route handlers or middleware wrappers  
**Responsibility:** Route verifies auth, then constructs envelope  
**Never in:** Services (services receive envelope, never construct it)

```typescript
// Example: In a route handler wrapped with withCanonicalEnforcement
export async function POST(
  request: NextRequest,
  context: CanonicalRouteContext
) {
  const ctx = context.canonicalAuth; // Verified by wrapper
  
  // Route extracts needed decisions and constructs envelope
  const authEnvelope: ServiceAuthEnvelope = {
    verifiedActorId: ctx.verifiedActorId,
    verifiedActorType: ctx.verifiedActorType,
    verifiedWorkspaceId: ctx.verifiedWorkspaceId,
    verifiedCapabilities: ctx.verifiedCapabilities,
    hasInternalAccess: ctx.policy ? hasInternalAccess(ctx.policy) : false,
    verifiedActor: ctx.verifiedActor,
    // Omit policy unless service explicitly handles policy semantics
  };

  // Call service with envelope
  const result = await findingService.createFinding(input, authEnvelope);
  return NextResponse.json(result);
}
```

**Key Rules:**
1. Route verifies auth completely BEFORE calling service
2. Route extracts only needed decisions (boolean flags, IDs, capabilities)
3. Route constructs envelope with extracted values
4. Route does NOT pass CanonicalAuthContext directly to service
5. Optional `policy` field only included if service explicitly needs policy semantics

---

## How Services Use ServiceAuthEnvelope

**Location:** In service functions  
**Responsibility:** Service reads verified decisions, makes business decisions  
**Never in:** Services don't construct, don't modify, don't verify

```typescript
// Example: Service function signature
export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope,
  workspaceId: string
): Promise<Finding> {
  // Service reads readonly fields for decisions
  
  // Visibility filtering based on internal access decision
  if (auth.hasInternalAccess) {
    // Can see internal findings
  } else {
    // Only client-visible findings
  }

  // Enforce capability decision
  if (!auth.verifiedCapabilities.has("FINDING_CREATE")) {
    throw new ForbiddenError("FINDING_CREATE capability required");
  }

  // Use actor ID for audit
  const finding = await db.finding.create({
    data: {
      ...input,
      workspaceId: auth.verifiedWorkspaceId,
      createdBy: auth.verifiedActorId,
    },
  });

  return finding;
}
```

**Key Rules:**
1. Service receives envelope as parameter
2. Service reads fields for business decisions
3. Service NEVER modifies envelope (readonly prevents this)
4. Service NEVER imports auth-guard functions
5. Service NEVER calls canonicalization
6. Service NEVER re-verifies auth (trusts route)
7. Service NEVER constructs ServiceAuthEnvelope

---

## Service Input Parameters During Transition

**Phase 1 (refactored services):**
```typescript
// After refactoring to use ServiceAuthEnvelope
export async function createFinding(
  input: CreateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<Finding>
```

**Phase 2 (non-refactored services - still call auth-guard):**
```typescript
// Before refactoring (still in codebase)
export async function createLead(
  input: CreateLeadInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<Lead>
```

**During transition (co-existence rules):**
- Refactored services receive ServiceAuthEnvelope
- Non-refactored services receive CanonicalAuthContext (deprecated)
- Routes determine which pattern to use based on service signature
- No mixing: a service signature uses ONE pattern, not both
- Gradual migration: refactor services incrementally

---

## Service Auth Boundary Rules Summary

### What Services MAY Do
- ✓ Accept ServiceAuthEnvelope as parameter
- ✓ Accept explicit parameters (boolean flags, IDs)
- ✓ Accept CanonicalAuthContext during transition (deprecated)
- ✓ READ from readonly envelope fields
- ✓ Make business decisions based on verified facts
- ✓ Enforce domain rules (state transitions, business logic)
- ✓ Filter data visibility based on capabilities/access level
- ✓ Create audit events with verified actor ID
- ✓ Trust that route already verified all facts

### What Services MUST NOT Do
- ✗ Import auth-guard functions
- ✗ Call requireCapabilityForService, withAuth, requireSession
- ✗ Fetch or verify policy/session themselves
- ✗ Re-verify workspace membership or capabilities
- ✗ Perform canonicalization
- ✗ Construct or modify ServiceAuthEnvelope
- ✗ Accept raw AuthContext (legacy pattern)
- ✗ Perform auth checks in service (route responsibility)
- ✗ Default to permissive behavior (fail-closed required)

---

## Migration Path: Three Phases

### Phase 1: Design & Pilot Selection (X9C-3, Weeks 1-2)
- ✓ Create ServiceAuthEnvelope type
- ✓ Design test fixtures
- ✓ Select 1-2 pilot services
- ✓ Plan refactoring sequence
- **Deliverable:** x9c3_service_refactor_implementation_plan.md

### Phase 2: Refactor Pilot Services (X9C-4, Weeks 3-4)
- Refactor selected services to use ServiceAuthEnvelope
- Update callers (routes, tests)
- Add tests for envelope-based services
- Validate against baseline
- Establish patterns for remaining services

### Phase 3: Rollout Remaining Services (X9C-4+, Weeks 5+)
- Refactor remaining services incrementally
- Update callers in phases
- No mass changes
- Maintain service stability

---

## ServiceAuthEnvelope Location in Codebase

**Type Definition:**
```
src/lib/auth-types.ts
```
Add ServiceAuthEnvelope interface definition and export.

**Service Usage Examples:**
```
src/services/findings.ts (Pilot 1)
src/services/deliverable.ts (Pilot 2)
src/services/stage.ts
src/services/engagement.ts (already uses similar pattern)
... and 20+ more services
```

**Route Callers:**
```
src/app/api/findings/route.ts
src/app/api/findings/[id]/route.ts
src/app/api/deliverables/route.ts
... and 20+ more route files
```

---

## Test Strategy for ServiceAuthEnvelope

### Service Tests
```typescript
// Test that service enforces capability decisions
test("should deny access if capability missing", async () => {
  const auth: ServiceAuthEnvelope = {
    verifiedActorId: "user-123",
    verifiedActorType: "user",
    verifiedWorkspaceId: "workspace-456",
    verifiedCapabilities: new Set(), // Empty - no capabilities
    hasInternalAccess: false,
  };

  expect(() => createFinding(input, auth)).rejects.toThrow(ForbiddenError);
});

// Test that service uses internal access decision
test("should filter by internal access", async () => {
  const auth: ServiceAuthEnvelope = {
    verifiedActorId: "user-123",
    verifiedActorType: "user",
    verifiedWorkspaceId: "workspace-456",
    verifiedCapabilities: new Set(["FINDING_VIEW"]),
    hasInternalAccess: false, // Non-internal user
  };

  const result = await listFindings(auth);
  expect(result.every(f => f.visibility === "client_visible")).toBe(true);
});
```

**Key Test Rules:**
1. Tests construct ServiceAuthEnvelope explicitly
2. Tests pass verified decisions as parameters
3. Tests never pass raw auth context
4. Tests verify service uses envelope fields correctly
5. Tests verify fail-closed behavior

---

## Implementation Safety Rules

### DO NOT Change These During Service Refactoring
- ✗ Route middleware (withCanonicalEnforcement unchanged)
- ✗ Auth wrapper functions (unchanged)
- ✗ Capability definitions (unchanged)
- ✗ Policy context structure (unchanged)
- ✗ Workspace verification logic (unchanged)

### DO Change Only These
- ✓ Service function signatures (add ServiceAuthEnvelope parameter)
- ✓ Route callers (construct envelope before calling service)
- ✓ Service implementations (use envelope fields instead of auth-guard calls)
- ✓ Service tests (pass envelope instead of context)

---

## Co-Existence During Transition

**Mixed Pattern Handling:**
- Some services refactored to use ServiceAuthEnvelope
- Some services still use CanonicalAuthContext (not yet refactored)
- Both patterns can coexist in same codebase during transition

**Route Caller Responsibility:**
- Route checks service signature
- If service expects ServiceAuthEnvelope: construct and pass envelope
- If service expects CanonicalAuthContext: pass context (deprecated)
- No service should accept both patterns

**Gradual Migration Timeline:**
- Week 1-2: Design, pilot selection, planning
- Week 3-4: Refactor 1-2 pilot services, dependent routes
- Week 5-6: Refactor 3-4 medium-complexity services
- Week 7-8: Refactor 5-6 complex services
- Week 9+: Cleanup and final validation

---

## Success Criteria for Design

✓ ServiceAuthEnvelope type is explicit and readonly  
✓ All service boundaries use envelope or equivalent pattern  
✓ No service imports auth-guard functions  
✓ All services fail-closed by default  
✓ Type system prevents field misuse (readonly)  
✓ Routes construct envelopes before service calls  
✓ Tests explicitly construct test envelopes  
✓ Documentation clear on what each field means  
✓ Phased migration plan documented  

---

## Next Steps

**Phase E:** Select 1-2 lowest-risk service refactor pilots  
**Phase F:** Create detailed implementation plan  
**Phase G:** Validation and authorization  

---

**Decision Status:** ✓ APPROVED - SERVICEAUTHENVELOPE SELECTED

**Next Phase:** X9C-3 Phase E - Pilot Selection
