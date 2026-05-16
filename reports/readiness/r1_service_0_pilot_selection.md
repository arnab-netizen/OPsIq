# R1-SERVICE-0: Pilot Selection

**Date:** 2026-05-16  
**Phase:** R1-SERVICE-0 Service Boundary Contract Audit  
**Pilot Status:** SELECTED AND SAFE

---

## A. Pilot Selection Criteria

**Candidate Requirements:**
✓ Currently deferred due to service coupling  
✓ Low complexity (contained within 1 route + 1 service)  
✓ LOW risk (no complex business logic)  
✓ Demonstrates VerifiedServiceContext pattern  
✓ Can be completed and tested in isolation  
✓ Unblocks future similar routes  

---

## B. Pilot Candidates Evaluated

### Candidate 1: actions/[actionId]/PATCH + updateAction
- Service: updateAction
- Service Input Type: CanonicalAuthContext (already aligned)
- Route Handler: PATCH in src/app/api/actions/[actionId]/route.ts
- Current Status: withEnforcementFull + canonicalizeAuthContext()
- Complexity: LOW (just updates action fields)
- Risk: LOW
- Violations Fixed: 4

**Analysis:**
- Service already accepts CanonicalAuthContext (no adapter needed)
- This is the simplest possible modernization
- Route wrapper change only (no service changes)
- No new type needed for this pilot
- Good demonstration of pure wrapper modernization

**Verdict:** ✓ Viable, simplest approach

### Candidate 2: findings/[findingId]/PATCH + updateFinding
- Service: updateFinding
- Service Input Type: ServiceAuthEnvelope (requires adapter)
- Route Handler: PATCH in src/app/api/findings/[findingId]/route.ts
- Current Status: withEnforcementFull + canonicalizeAuthContext()
- Complexity: LOW (just updates finding fields)
- Risk: LOW
- Violations Fixed: 4

**Analysis:**
- Service expects ServiceAuthEnvelope (minimal type)
- Route must create adapter: CanonicalAuthContext → VerifiedServiceContext (or ServiceAuthEnvelope for now)
- Demonstrates the adapter pattern
- Will need VerifiedServiceContext defined first
- Good demonstration of contract adaptation

**Verdict:** ✓ Viable, demonstrates adapter pattern

### Candidate 3: clients/[clientId]/PATCH + updateClient
- Service: updateClient
- Service Input Type: CanonicalAuthContext
- Route Handler: PATCH in src/app/api/clients/[clientId]/route.ts
- Current Status: withEnforcementFull + canonicalizeAuthContext()
- Complexity: MEDIUM (complex client data)
- Risk: LOW (well-tested service)
- Violations Fixed: 4

**Analysis:**
- Service accepts CanonicalAuthContext (aligned)
- Client data is complex (many fields)
- Good for follow-up pilot, not first one
- Slightly higher risk due to complexity

**Verdict:** ✓ Viable, but save for phase 2

### Candidate 4: diagnosis/route.ts POST + diagnoseBusiness
- Service: diagnoseBusiness
- Service Input Type: CanonicalAuthContext
- Route Handler: POST in src/app/api/diagnosis/route.ts
- Current Status: withEnforcementFull + canonicalizeAuthContext()
- Complexity: MEDIUM-HIGH (constructs ServiceAuthEnvelope internally)
- Risk: MEDIUM (complex internal pattern)
- Violations Fixed: 5

**Analysis:**
- Service accepts CanonicalAuthContext but internally constructs ServiceAuthEnvelope for downstream calls
- This is complex internal pattern
- Should wait until simpler pilots complete
- May need service refactoring beyond just wrapper

**Verdict:** ✗ Save for phase 2 (after simpler pilots)

---

## C. Selected Pilot Route/Service Pair

### ✓ FINDINGS: findings/[findingId]/PATCH + updateFinding

**Selected Because:**
1. Demonstrates VerifiedServiceContext adapter pattern
2. Service is simple and well-defined
3. Route handler is straightforward
4. LOW risk (finding updates are isolated)
5. Complete example of wrapper + adapter
6. Will unblock future routes calling findings service
7. Good teaching example (adapter pattern)

---

## D. Exact Files and Changes

### Service File (No Changes Initially)
**File:** src/services/findings.ts
**Current Signature:**
```typescript
export async function updateFinding(
  findingId: string,
  input: UpdateFindingInput,
  auth: ServiceAuthEnvelope
): Promise<{ id: string }>
```
**For Pilot:** KEEP AS-IS (ServiceAuthEnvelope)
**For Future:** Will update to VerifiedServiceContext in follow-up phase
**Status:** NOT MODIFIED IN PILOT

### Route File (Changes Required)
**File:** src/app/api/findings/[findingId]/route.ts

**Line 1-6 (imports):** CHANGE
```typescript
// FROM:
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";

// TO:
import { withCanonicalEnforcement, type CanonicalAuthContext, type ServiceAuthEnvelope } from "@/lib/canonical-route-enforcement";
```

**Line 36-46 (GET handler):** NO CHANGE (already modernized)
```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    // ... already uses ctx.verifiedWorkspaceId
  }
);
```

**Line 48-??? (PATCH handler):** CHANGE
```typescript
// FROM:
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.FINDING_UPDATE,
    internalOnly: true,
  });
  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  // ... rest of legacy pattern

// TO:
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const { findingId } = params;
    parseOrThrow(uuidSchema, findingId);
    
    const body = await parseRequestBody(request);
    const input = parseOrThrow(updateFindingSchema, body);
    
    // Create ServiceAuthEnvelope adapter (temporary, will be VerifiedServiceContext)
    const authEnvelope: ServiceAuthEnvelope = {
      verifiedActorId: ctx.verifiedActorId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedCapabilities: ctx.verifiedCapabilities,
      hasInternalAccess: true,  // Evaluate from policy if needed
      verifiedActor: ctx.verifiedActor,
      policy: ctx.policy
    };
    
    const result = await updateFinding(findingId, input, authEnvelope);
    return Response.json(result);
  },
  { requireCapabilities: [CAPABILITIES.FINDING_UPDATE], requireWorkspace: true }
);
```

### Allowed Files:
- src/app/api/findings/[findingId]/route.ts (ONLY for PATCH handler modernization)

### Forbidden Files:
- src/services/findings.ts (NO changes - test service coupling only)
- src/lib/canonical-route-enforcement.ts (types already exist, don't modify)
- src/lib/enforced-route.ts (don't modify wrapper)
- src/lib/auth-guard.ts (don't modify legacy)
- Any other service files
- Any database files
- Any middleware files

---

## E. Expected Scanner Reduction

**Before Pilot:** 352 violations (baseline)  
**After Pilot:** 348 violations (expected -4)

**Violations Fixed by PATCH Handler Modernization:**
- 1 x withEnforcementFull (CRITICAL)
- 1 x withAuth() call (CRITICAL)
- 1 x canonicalizeAuthContext() (CRITICAL)
- 1 x auth-guard import (BLOCK_BUILD)

**Violations Not Fixed (outside pilot scope):**
- POST handlers on other routes
- Other service-coupled routes
- Service files themselves

---

## F. Required Tests

### Route Tests to Verify (Must Pass)
1. **GET findings/[id]** - Already passing, no regression expected
2. **PATCH findings/[id]** - Must pass after modernization
3. Test with valid capability: PASS
4. Test without capability: FAIL (403) 
5. Test with wrong workspace: FAIL (403)
6. Test with valid update: PASS, finding updated
7. Test version conflict: FAIL (409 or 400)
8. Test idempotency: Works correctly if service supports

### Service Tests (No Changes Expected)
- updateFinding() continues to work
- All existing service tests pass
- No service logic changed

### Wrapper Tests (No Changes Expected)
- withCanonicalEnforcement wrapper already tested in R1-A/B/C/D/D2-A
- Route handler integration works

---

## G. Rollback Rule

**If Pilot Fails:**

1. Revert src/app/api/findings/[findingId]/route.ts PATCH handler
   - Remove withCanonicalEnforcement wrapper change
   - Restore withEnforcementFull + withAuth() pattern
2. Cost: 5 minutes, 1 file revert
3. Violations return to 352 (no net change)

---

## H. Pilot Success Criteria

**All Must Pass:**
✓ TypeScript compiles (npm run build)
✓ All 402 tests pass (npm test)
✓ Scanner shows -4 violations (352 → 348)
✓ GET findings/[id] handler works
✓ PATCH findings/[id] handler works
✓ Capability checks enforced (403 when unauthorized)
✓ Workspace scoping enforced (403 when wrong workspace)
✓ Version conflict handled (409 when stale)
✓ Finding actually updates in database
✓ No regressions in other routes

---

## I. Pilot Implementation Notes

**Critical Steps:**
1. Remove withEnforcementFull wrapper
2. Add withCanonicalEnforcement wrapper with requireCapabilities and requireWorkspace
3. Update handler signature: (ctx: CanonicalAuthContext, params) instead of (request, context, params)
4. Remove await withAuth() and enforceWorkspaceScoping() calls
5. Create ServiceAuthEnvelope adapter
6. Pass adapter to updateFinding()
7. Return response.json(result)

**Common Mistakes to Avoid:**
- ✗ Don't forget requireCapabilities in options
- ✗ Don't forget requireWorkspace in options
- ✗ Don't try to create ServiceAuthEnvelope without all required fields
- ✗ Don't call withAuth() inside handler (wrapper does this)
- ✗ Don't re-check workspace (wrapper does this)
- ✗ Don't remove GET handler (it's fine as-is)

---

## J. Pilot Impact on R1-D2-B/C/D Gates

**Pilot Success Unlocks:**
- Permission to modernize similar findings routes (createFinding next)
- Confidence that VerifiedServiceContext will work (bridge to Option C decision)
- Proof that ServiceAuthEnvelope routes can be modernized safely

**Pilot Failure:**
- Signals deeper issue with wrapper pattern (but unlikely - pattern proven in R1-A/B/C/D)
- May indicate service coupling issue not captured in analysis
- Would require design audit restart

---

## K. Next Pilots (If First Succeeds)

**Phase 2 Pilots (After findings PATCH succeeds):**
1. findings/route.ts POST (createFinding) - similar pattern
2. actions/[actionId]/route.ts PATCH (updateAction) - CanonicalAuthContext direct
3. clients/[clientId]/route.ts PATCH (updateClient) - CanonicalAuthContext direct

---

## Final Verdict

### ✓ PILOT SELECTED: findings/[findingId]/PATCH + updateFinding

**Risk Level:** LOW  
**Complexity:** LOW  
**Expected Violations Fixed:** 4  
**Files Changed:** 1 (route only)  
**Services Changed:** 0  
**Tests Impacted:** 0 (no regressions expected)  
**Rollback Cost:** 5 minutes  
**Pattern Demonstrated:** ServiceAuthEnvelope adapter for VerifiedServiceContext migration  

**Ready for implementation:** YES

---

**Status: PILOT SELECTION COMPLETE - READY FOR IMPLEMENTATION PLAN**
