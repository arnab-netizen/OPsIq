# X9F-2: Pre-Implementation Confirmation

**Date:** 2026-05-16  
**Status:** PRE-IMPLEMENTATION INSPECTION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## File Inspection Results

### src/services/decisions/decision-creation-service.ts

**Status:** ✓ CONFIRMED - Safe to refactor

**Current Pattern:**
- Function: `export async function createDecision(input: CreateDecisionInput)`
- Auth imports: NONE (no auth-guard, no AuthContext imports)
- Service-side auth checks: NONE (all auth done at route level)
- userId usage: Passed as input parameter, used for ownerUserId, createdBy, lastUpdatedBy
- Response shape: CreateDecisionResult (id, title, problem, decisionType, impactExpected, confidence, createdAt)

**Current Input:**
```typescript
interface CreateDecisionInput {
  title: string;
  type: string;
  impact: number;
  confidence: number;
  workspaceId: string;
  userId: string;  // ← Currently weak input (not marked as verified)
  problemType?: string;
  expectedOutcome?: string;
}
```

**Service Is Clean:** ✓ YES
- No AuthContext accepted
- No CanonicalAuthContext accepted
- No auth-guard imports
- No service-side auth or canonicalization
- Only business logic + input validation

---

### src/app/api/decisions/create/route.ts

**Status:** ✓ CONFIRMED - Route provides verified data

**Current Pattern:**
- Wrapper: `withEnforcementFull` (legacy wrapper)
- Auth method: `await withAuth()` (shadow read pattern)
- Workspace enforcement: Manual via enforceWorkspaceScoping
- Capability check: `await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE)`
- Capability constant: ✓ DECISION_CREATE (X9E-2 cleaned)
- Route provides: userId (from session.user.id), workspaceId
- Service called: `createDecision({ title, type, impact, confidence, workspaceId, userId, ... })`

**Route Has Verified Data:** ✓ YES
- session.user.id is verified by withAuth()
- workspaceId is verified by enforceWorkspaceScoping()
- DECISION_CREATE capability is verified by assertCapability()

---

## Refactoring Assessment

### Current Auth Boundary
**Weak Point:** Service receives userId and workspaceId as plain input fields, not explicitly marked as verified

**Desired State:** Service receives verified auth metadata (ServiceAuthEnvelope or structured auth input)

---

## ServiceAuthEnvelope Feasibility

**Can be constructed from legacy route?** ✓ YES

**Required fields:**
- verifiedActorId ← session.user.id
- verifiedActorType ← "user"
- verifiedWorkspaceId ← request.headers.get("x-workspace-id")
- verifiedCapabilities ← ReadonlySet([CAPABILITIES.DECISION_CREATE])
- hasInternalAccess ← true (user passed auth checks)

**Construction is safe:** ✓ YES
- All data points already verified at route level
- No new auth checks needed
- No fabrication required

---

## DECISION_CREATE Capability

**Defined:** ✓ YES
- Location: src/domain/constants/capabilities.ts:101
- Value: "decision:create"
- Usage in tests: ✓ Verified
- Usage in route: ✓ Already uses CAPABILITIES.DECISION_CREATE

---

## No Other Service Changes Required

**acceptDecision:** ✓ NOT CHANGING (different pilot, X9F-3 candidate)
**rejectDecision:** ✓ NOT CHANGING (different pilot, X9F-4 candidate)
**closeDecision:** ✓ NOT CHANGING (governance blocked, X9G candidate)

---

## Expected Scanner Effect

**Before X9F-2:** 448 violations (283 critical, 165 block-build)

**Expected after X9F-2:** 448 violations (0 reduction expected)

**Why no reduction?**
- Pattern change only (input structure, not route wrapper)
- Route still uses legacy wrapper (withEnforcementFull)
- No migration from legacy pattern to canonical enforcement
- Scanner detects legacy pattern, not input structure
- Full reduction would require route modernization to canonical enforcement

**Type of change:** Service boundary strengthening (auth encapsulation, not pattern migration)

---

## Route Modernization Decision

**Should route be modernized to withCanonicalEnforcement?**
- X9F-1 plan suggested: "Route can construct envelope from CanonicalAuthContext"
- Current reality: Route uses withEnforcementFull (legacy pattern)
- Minimal scope approach: Update only what's needed for service refactor

**Decision:** Construct ServiceAuthEnvelope from legacy route's verified data
- Keep route wrapper as-is (minimizes scope)
- Add envelope construction at service call point
- Full route modernization deferred (would be separate phase)

---

## Pre-Implementation Checklist

| Item | Status | Evidence |
|------|--------|----------|
| createDecision is safe to refactor | ✓ YES | No auth imports, no service-side auth |
| createDecision accepts no AuthContext | ✓ YES | Input is plain CreateDecisionInput |
| Route provides verified data | ✓ YES | withAuth(), enforceWorkspaceScoping(), assertCapability() |
| ServiceAuthEnvelope can be constructed | ✓ YES | All required fields available at route |
| DECISION_CREATE exists | ✓ YES | capabilities.ts:101 |
| DECISION_CREATE is used in route | ✓ YES | Line 31 uses CAPABILITIES.DECISION_CREATE |
| No accept/reject/close changes needed | ✓ YES | Different services, different pilots |
| Expected scanner effect clear | ✓ YES | 0 reduction (service refactor, not pattern migration) |

---

## Implementation Approach

**Refactor Strategy:**

1. **Service Change:**
   - Create new interface: CreateDecisionServiceInput (combines CreateDecisionInput + verified auth metadata)
   - Refactor createDecision to accept new input structure
   - Replace userId parameter with verifiedActorId from envelope
   - Preserve all business logic and response shape

2. **Route Change:**
   - Construct verified auth object from route's context
   - Build input combining business data + verified auth
   - Pass to createDecision
   - No wrapper or handler signature changes

3. **Test Changes:**
   - No new tests required (existing integration tests will verify)
   - Service behavior unchanged, only input structure

---

## Ready for Implementation: YES

**Conditions met:**
- ✓ Service is clean (no auth dependencies)
- ✓ Route provides verified data
- ✓ ServiceAuthEnvelope can be constructed safely
- ✓ No other services affected
- ✓ Expected scanner effect clear
- ✓ Scope is well-defined
- ✓ Minimal impact (2 files, ~20 lines)

**Proceed with phase B (implement service refactor):** YES
