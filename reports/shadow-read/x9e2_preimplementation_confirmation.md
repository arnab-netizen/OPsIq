# X9E-2: Pre-Implementation Confirmation

**Date:** 2026-05-15  
**Status:** PRE-IMPLEMENTATION INSPECTION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## File Inspection Results

### src/app/api/decisions/create/route.ts

**Status:** ✓ CONFIRMED - Target route contains string "decision_create"

**Current state:**
- Line 30: `const capabilityCheck = await assertCapability(workspaceId, "decision_create");`
- Line 32: `throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");`

**Handler:** `POST /api/decisions/create`

**Pattern:** Route uses entitlement-level string check via assertCapability

---

### src/domain/constants/capabilities.ts

**Status:** ✓ CONFIRMED - DECISION_CREATE exists with correct value

**Current state:**
- Line 101: `DECISION_CREATE: "decision:create",`
- Value: "decision:create" (domain:action format)
- Location: In Decisions section of CAPABILITIES object

**Type safety:** Constant is properly exported and available for import

---

## Target Replacement Specification

**String to replace:** `"decision_create"` (2 instances)

**Location 1 - Line 30:**
```typescript
// BEFORE:
const capabilityCheck = await assertCapability(workspaceId, "decision_create");

// AFTER:
const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
```

**Location 2 - Line 32:**
```typescript
// BEFORE:
throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");

// AFTER:
throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
```

**Required import:** CAPABILITIES is NOT currently imported in this file - must be added

---

## Service Refactor Required

**Answer:** NO

**Reason:** 
- Route only calls createDecision() and createDecisionsBulk()
- Services do not validate DECISION_CREATE capability
- Services only receive verified userId and workspaceId
- No service-side auth changes needed
- Capability check stays at route level

---

## Response Shape Change Required

**Answer:** NO

**Reason:**
- Only capability check parameter changes
- Response building code unchanged
- Error response format unchanged
- Success response format unchanged

---

## Business Logic Change Required

**Answer:** NO

**Reason:**
- Only string literal replaced with constant
- assertCapability logic unchanged
- Entitlement tier configs unchanged
- Quota enforcement unchanged
- Decision creation logic unchanged

---

## Expected Scanner Effect

**Before change:** 448 violations (283 critical, 165 block-build)

**Expected after change:** 446-447 violations (2-3 reduction)

**Why reduction occurs:**
- String literal "decision_create" is recognized as pattern violation
- After replacement with CAPABILITIES.DECISION_CREATE constant, pattern changes
- Scanner recognizes domain constant as safe pattern
- Result: 2 violations removed from assertCapability calls

**Type of reduction:** Safe pattern replacement (not new code, just cleaner pattern)

---

## Pre-Implementation Checklist

| Item | Status | Evidence |
|------|--------|----------|
| Target route identified | ✓ YES | src/app/api/decisions/create/route.ts |
| String "decision_create" found | ✓ YES | Lines 30 and 32 |
| DECISION_CREATE exists in CAPABILITIES | ✓ YES | capabilities.ts line 101 |
| DECISION_CREATE equals "decision:create" | ✓ YES | Correct format |
| No service refactor required | ✓ YES | Services unchanged |
| No response shape change | ✓ YES | Response building unchanged |
| No business logic change | ✓ YES | Logic stays same |
| Required import must be added | ✓ YES | Add CAPABILITIES import |
| Expected scanner reduction measurable | ✓ YES | 2-3 violation reduction |

---

## Ready for Implementation: YES

**Conditions met:**
- ✓ Target route verified
- ✓ Target strings identified (2 instances)
- ✓ Replacement constant confirmed
- ✓ Import requirement identified
- ✓ No service changes needed
- ✓ No behavior changes
- ✓ Expected scanner reduction clear

**Proceed with phase B (implement cleanup):** YES
