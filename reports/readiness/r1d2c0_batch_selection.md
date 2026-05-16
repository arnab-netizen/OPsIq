# R1-D2-C0: Batch Selection (Source-Verified Analysis)

**Date:** 2026-05-16  
**Phase:** R1-D2-C0 Planning (Seventh Safe Route Batch Selection)  
**Status:** NO SAFE HANDLERS AVAILABLE FOR SELECTION

---

## A. Selection Criteria Applied (Source-Verified)

**Process Improvement from R1-D2-B:**
- ✓ Verify actual exported handler methods from source file
- ✓ Verify actual workspace scoping pattern from source
- ✓ Verify actual service calls from source
- ✓ Do NOT assume handler types based on route name

**Safety Criteria:**
✓ Handler must be verified in actual source file (grep "export const GET =")  
✓ `service_refactor_required = false`  
✓ `new_capability_required = false`  
✓ `entitlement_change_required = false`  
✓ `role_change_required = false`  
✓ `policy_wrapper_required = false`  
✓ `workspace_redesign_required = false`  
✓ `non_standard_workspace_scoping = false` (standard header-based only)  
✓ `response_shape_risk = LOW`  
✓ `business_logic_risk = LOW or MEDIUM`  
✓ NOT webhook/payment route  
✓ NOT run/verify route  

---

## B. Candidate Scan Results

**Total Routes Scanned:** 25  
**Source-Verified GET Routes:** 3  
**Safe GET Routes Found:** 0  

### GET-Only Routes Examined

All 3 GET-only routes found have non-standard workspace scoping patterns:

1. **src/app/api/value/route.ts**
   - Handler: GET ✓
   - Issue: Uses resolveServerRole() - server-side role resolution (non-standard)
   - Status: DEFERRED to R1-WORKSPACE-0

2. **src/app/api/governance/metrics/route.ts**
   - Handler: GET ✓
   - Issue: Uses query parameter "workspaceId" instead of x-workspace-id header
   - Status: DEFERRED to R1-WORKSPACE-0

3. **src/app/api/metrics/control-effectiveness/route.ts**
   - Handler: GET ✓
   - Issue: Uses requireWorkspaceContext() service - service-based context (non-standard)
   - Status: DEFERRED to R1-WORKSPACE-0

### POST/PATCH Routes (Not Eligible for R1-D2-C GET-Only Batch)

**Routes Scanned:** 22  
**Status:** All POST/PATCH handlers excluded per GET-only constraint

---

## C. Expected Outcome

### No Batch Selected

**Handlers to Implement:** 0  
**Expected Violations Fixed:** 0  
**Expected Scanner Change:** 0 (baseline stable at 352)

---

## D. Files for (Empty) R1-D2-C

**Allowed (if handlers existed):**
- None (no safe handlers found)

**Forbidden:**
- All service files
- All wrapper/auth files
- All database/schema files
- All post/patch handlers (GET-only constraint)
- All non-standard-scoping routes

---

## E. Validation Commands (Not Needed)

Since no implementations will be attempted:
- `npm run build` - will pass (no changes)
- `npm test` - will pass (no changes)
- `npx tsx src/governance/auth-shadow-read-scanner.ts` - will show 352 (no changes)

---

## F. Rollback Rule

**Not Applicable** - No implementation attempted

---

## G. Deferred Routes & Next Phases

### R1-WORKSPACE-0 (Design Audit - 3 Routes)

Workspace scoping semantics audit for routes using non-standard patterns:
- Server-side role resolution (resolveServerRole)
- Query parameter workspace sourcing (non-header)
- Service-based context validation (requireWorkspaceContext)

**Routes:** value, governance/metrics, control-effectiveness  
**Expected Violations:** 12  
**Timeline:** Can proceed independently

### R1-SERVICE-0 (Service Boundary Refactoring - 40+ Routes)

Service input contract refactoring for routes with service coupling:
- Services expecting ServiceAuthEnvelope
- Route-only modernization blocked by service signatures

**Routes:** diagnosis, decisions, findings, clients, auth, and 35+ others  
**Expected Violations:** 140  
**Timeline:** Critical path for unlocking most remaining routes

### R1-POLICY-0 (Policy Wrapper Design - 12 Routes)

Policy-specific wrapper enforcement for routes needing policy-scoped operations

**Expected Violations:** 48  
**Timeline:** Can proceed independently

---

**Status: ✓ BATCH SELECTION COMPLETE - ZERO SAFE HANDLERS AVAILABLE**
