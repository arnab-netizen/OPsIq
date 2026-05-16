# X9C-3: Service Auth Boundary Rules

**Phase:** X9C-3 (Service Auth Boundary Design)  
**Date:** 2026-05-15  
**Status:** BOUNDARY RULES DEFINED

---

## Foundational Principle

**Services must never upgrade weak auth into canonical auth.**

Routes and wrappers enforce auth before services execute. Services trust that auth is already verified and make decisions based on verification facts (actorId, workspaceId, capabilities, etc.), not on performing verification themselves.

---

## What Services MAY Accept

### Acceptable Input Patterns

**Pattern 1: Explicit Verification Parameters (PREFERRED)**
```typescript
// Service accepts explicit verification results from route
export async function getEngagementById(
  engagementId: string,
  workspaceId: string,
  hasInternalAccess: boolean = false
): Promise<Engagement>
```
- Service accepts already-verified facts
- No auth validation in service
- Service trusts route verified the facts
- Clear API contract

**Pattern 2: CanonicalAuthContext for Complex Cases (ALLOWED WITH CAUTION)**
```typescript
export async function createEngagement(
  input: CreateEngagementInput,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<{ id: string }>
```
- Service receives already-canonicalized context
- Service may READ fields (verifiedActorId, verifiedWorkspaceId, etc.)
- Service must NOT call auth-guard functions
- Service must NOT derive canonical auth from weak auth

**Pattern 3: Background/System Actors**
```typescript
export async function getEngagementById(
  engagementId: string,
  workspaceId: string,
  verifiedActorId?: string // Optional: if missing, operation is system-scoped
): Promise<Engagement>
```
- System operations may call services without actor verification
- Must be explicitly documented
- Requires clear audit trail

---

## What Services MUST NOT Accept

### Forbidden Input Patterns

**Forbidden Pattern 1: AuthContext (Legacy)**
```typescript
// ❌ FORBIDDEN
export function doSomething(authContext: AuthContext) {
  // This is the old pattern - never accept raw AuthContext
}
```
- AuthContext is from legacy system
- Contains raw session, may not be verified
- Services should NEVER receive raw AuthContext

**Forbidden Pattern 2: Weak Auth (Non-Canonical)**
```typescript
// ❌ FORBIDDEN
export function doSomething(req: NextRequest) {
  // Service must never access request directly for auth
  const session = await getSession(req);
}
```
- Services must never import auth-guard functions
- Services must never fetch session/policy themselves
- Services must never call withAuth internally

**Forbidden Pattern 3: PolicyContext Directly (Usually)**
```typescript
// ❌ FORBIDDEN (except for policy-specialized services)
export function doSomething(policy: PolicyContext) {
  // Services should not receive policy directly
  // Routes should extract needed decision (hasInternalAccess, roles, etc.)
  // and pass result as parameter
}
```
- Exceptions: Services that explicitly handle policy semantics
- Default: Pass policy decision results, not raw policy object

**Forbidden Pattern 4: Service-Side Canonicalization**
```typescript
// ❌ FORBIDDEN
import { canonicalizeAuthContext } from "@/lib/auth-guard";
export function doSomething(authContext: AuthContext) {
  const canonical = canonicalizeAuthContext(authContext); // NOPE
  // This upgrades weak auth - forbidden
}
```
- Services must NEVER call canonicalizeAuthContext
- Only routes/wrappers do canonicalization
- Only wrappers verify auth

---

## Service Auth Decision Responsibility

### Who Does What

**Route/Wrapper Responsibility (BEFORE service call):**
1. Receive NextRequest with raw headers/cookies
2. Extract and verify identity (who is the actor)
3. Extract and verify workspace (is actor in workspace)
4. Verify capabilities (does actor have required capability)
5. Extract and evaluate policy decisions (is actor internal, has role, etc.)
6. Call service with ONLY the verified results needed

**Service Responsibility (AFTER receiving verified results):**
1. Execute business logic using verified results
2. Trust that results are accurate (route verified them)
3. Make data access decisions (what data can actor see)
4. Enforce domain rules (what operations are allowed for engagement state, etc.)
5. NEVER re-verify auth (trust route already did)

**What Services NEVER Do:**
- ✗ Import auth-guard functions
- ✗ Call requireCapabilityForService, requireSession, withAuth
- ✗ Fetch PolicyContext internally
- ✗ Verify workspace membership
- ✗ Call canonicalization functions
- ✗ Perform capability checks

---

## Specific Service Input Contract Rules

### Rule 1: Capability Decisions
```typescript
// ❌ WRONG: Service verifies capability internally
export async function createFinding(input, authContext) {
  requireCapabilityForService(authContext, "FINDING_CREATE"); // Service shouldn't do this
}

// ✓ RIGHT: Route verifies, passes result
export async function createFinding(input, hasCreateCapability: boolean) {
  if (!hasCreateCapability) throw new ForbiddenError();
  // do work
}

// ✓ ALSO RIGHT: Route verifies, passes authContext (if needed for complex logic)
export async function createFinding(input, authContext: CanonicalAuthContext) {
  // authContext already verified by wrapper
  // Service may use authContext.verifiedCapabilities
  // Service must NOT call requireCapabilityForService
}
```

### Rule 2: Internal Access Decisions
```typescript
// ❌ WRONG: Service derives from policy
export async function getEngagements(workspaceId, authContext) {
  const hasInternal = authContext.policy ? hasInternalAccess(authContext.policy) : false;
  // Service shouldn't derive this
}

// ✓ RIGHT: Route derives, passes boolean
export async function getEngagements(workspaceId, hasInternalAccess: boolean = false) {
  const visibility = hasInternalAccess ? "all" : "client_visible";
  // Service uses pre-computed decision
}
```

### Rule 3: Workspace Verification
```typescript
// ✓ RIGHT: Service accepts already-verified workspaceId
export async function doSomething(workspaceId: string, item: Item) {
  // Assume workspaceId is already verified by route
  // Service may use it in WHERE clauses
}

// ✗ WRONG: Service re-verifies workspace
export async function doSomething(workspaceId: string, authContext) {
  const membership = await verifyWorkspaceMembership(authContext, workspaceId);
  // Don't do this - route already verified
}
```

### Rule 4: Actor Identity
```typescript
// ✓ RIGHT: Service receives verified actorId
export async function getUserData(userId: string, verifiedActorId: string) {
  if (userId !== verifiedActorId) throw new ForbiddenError();
  // Service enforces rule with verified identity
}

// ✓ ALSO RIGHT: CanonicalAuthContext available
export async function getUserData(userId: string, authContext: CanonicalAuthContext) {
  if (userId !== authContext.verifiedActorId) throw new ForbiddenError();
  // Same effect, using context
}
```

---

## Fail-Closed Rules for Services

### Rule 1: Missing Verification Data
```typescript
// Service must assume missing verification data = deny operation
export async function getDashboard(authContext?: CanonicalAuthContext) {
  if (!authContext) throw new UnauthorizedError();
  // Missing context = no operation
}

// For optional access tiers:
export async function getEngagements(hasInternalAccess = false) {
  // Missing/false = least permissive (client_visible only)
  // Never default to permissive
}
```

### Rule 2: Type Mismatches
```typescript
// Service must reject unexpected data types
export async function doSomething(actorId: string) {
  if (typeof actorId !== "string" || !actorId.length) {
    throw new BadRequest Error("Invalid actorId");
  }
}
```

---

## When Services May Accept CanonicalAuthContext

**Allow in these cases:**
1. Service performs complex multi-permission decision (not just one capability)
2. Service needs both actor identity AND workspace AND capabilities
3. Service structure benefits from grouped context vs many parameters
4. Clear documentation of what fields service uses

**Require in these cases:**
1. Do NOT import auth-guard functions
2. Do NOT call canonicalization
3. Do NOT re-derive capabilities
4. Document which authContext fields are actually used
5. Tests must pass authContext, not raw auth data

---

## When Services Must NOT Accept PolicyContext

**Never pass PolicyContext directly to service unless:**
- Service explicitly handles policy semantics (role resolution, engagement membership, etc.)
- Design document explicitly authorizes it
- Route has already extracted needed decision

**Preferred:** Route extracts decision, passes result
```typescript
// ❌ Avoid
const roles = service.getRoles(policy);

// ✓ Prefer
const hasAdminRole = policy?.roles.some(r => r.role === "admin") ?? false;
const roles = service.getRoles(hasAdminRole);
```

---

## Background/System Actor Rules

### System Operations
```typescript
// System may call services without actor context
export async function processScheduledReview(engagementId: string) {
  // No authContext needed
  // Must be explicitly scoped
  // Must log as system action
}

// Service may accept optional actorId
export async function getEngagement(id: string, actorId?: string) {
  if (actorId) {
    // Actor-scoped operation: visibility filtering
  } else {
    // System operation: return all data
  }
}
```

### Job Processing
```typescript
// Background jobs run as system, not as user
// Services should accept "system" marker if needed
export async function processQueue(workspaceId: string, systemScoped: boolean = false) {
  if (systemScoped) {
    // System-wide operation, skip actor-level filtering
  }
}
```

---

## Test Fixture Rules

### Test Service Calls

**Correct Test Pattern:**
```typescript
test("should filter by internal access", async () => {
  const result = await getEngagements(
    "workspace-123",
    true  // hasInternalAccess - explicit boolean
  );
  expect(result.some(e => e.visibility === "internal")).toBe(true);
});

test("should restrict to client_visible for non-internal", async () => {
  const result = await getEngagements(
    "workspace-123",
    false  // hasInternalAccess = false
  );
  expect(result.every(e => e.visibility === "client_visible")).toBe(true);
});
```

**Wrong Test Pattern:**
```typescript
// ❌ Don't construct CanonicalAuthContext in tests
const ctx = {
  verifiedActorId: "user-123",
  // ... manually constructed context
};
const result = await getEngagements(ctx);

// This bypasses the wrapper verification - tests should verify
// service behavior assuming auth is already verified
```

---

## Service Refactoring Recipe

**When refactoring a service:**

1. **Identify current auth input**: Does it call requireCapabilityForService? Accept authContext? Derive policy?

2. **Determine needed verification facts**: What does the service actually need to make decisions?
   - Just workspaceId? (workspace-scoped)
   - ActorId + workspaceId? (actor verification needed)
   - Capability result? (as boolean)
   - Internal access decision? (as boolean)

3. **Design new signature**: Accept only verified results
   ```typescript
   // Before
   async function doSomething(input, authContext) {
     requireCapabilityForService(authContext, "CREATE");
   }
   
   // After
   async function doSomething(input, hasCreateCapability: boolean) {
     // Trust route verified capability
   }
   ```

4. **Update all callers**: Routes must now verify before calling
5. **Update tests**: Tests pass verification results, not raw context
6. **Validate**: Service no longer imports auth-guard

---

## Boundary Rules Summary

| Aspect | Allowed | Forbidden |
|--------|---------|-----------|
| Auth-guard imports | ✗ NEVER | ✗ ALL |
| CanonicalAuthContext | ✓ Only read fields | ✗ No calls to auth functions |
| PolicyContext | ✗ Usually | ✓ Only if explicitly designed |
| Capability checks | ✗ In service | ✓ In route/wrapper |
| Workspace verification | ✗ In service | ✓ In route/wrapper |
| Policy deriving | ✗ In service | ✓ In route/wrapper |
| Canonicalization | ✗ In service | ✓ In wrapper only |
| Parameter-based auth | ✓ PREFERRED | - |
| Fail-closed defaults | ✓ REQUIRED | ✗ Permissive defaults |

---

**Status:** ✓ SERVICE AUTH BOUNDARY RULES DEFINED
