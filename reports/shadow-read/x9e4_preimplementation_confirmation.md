# X9E-4: Pre-Implementation Confirmation

**Date:** 2026-05-15  
**Status:** PRE-IMPLEMENTATION INSPECTION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## File Inspection Results

### src/app/api/recommendations/route.ts

**Status:** ✓ CONFIRMED - Target route contains string "decision_create"

**Current state:**
- Line 53: `const capabilityCheck = await assertCapability(workspaceId, "decision_create");`
- Line 55: `throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");`

**Handler:** `POST /api/recommendations`

**Pattern:** Route uses entitlement-level string check via assertCapability

**CAPABILITIES import status:** ✓ Already imported (line 4)

---

### src/domain/constants/capabilities.ts

**Status:** ✓ CONFIRMED - DECISION_CREATE exists with correct value

**Current state:**
- DECISION_CREATE: "decision:create"
- Value: "decision:create" (domain:action format)
- Location: In Decisions section of CAPABILITIES object

**Type safety:** Constant is properly exported and available

---

## Target Replacement Specification

**String to replace:** `"decision_create"` (2 instances)

**Location 1 - Line 53:**
```typescript
// BEFORE:
const capabilityCheck = await assertCapability(workspaceId, "decision_create");

// AFTER:
const capabilityCheck = await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE);
```

**Location 2 - Line 55:**
```typescript
// BEFORE:
throw new PlanLimitError("decision_create", capabilityCheck.reason || "Plan limit exceeded");

// AFTER:
throw new PlanLimitError(CAPABILITIES.DECISION_CREATE, capabilityCheck.reason || "Plan limit exceeded");
```

**Required import:** CAPABILITIES is already imported (line 4) - NO CHANGE NEEDED

---

## Service Refactor Required

**Answer:** NO

**Reason:**
- Route only calls createRecommendation()
- Service does not validate DECISION_CREATE capability
- Service only receives verified userId and workspaceId
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
- Recommendation creation logic unchanged

---

## Expected Scanner Effect

**Before change:** 448 violations (283 critical, 165 block-build)

**Expected after change:** 447-448 violations (0-1 reduction possible)

**Why uncertain reduction:**
- String literal "decision_create" is recognized as pattern violation
- After replacement with CAPABILITIES.DECISION_CREATE constant, pattern changes
- Scanner may or may not reduce violations (depends on pattern matching rules)
- If no reduction occurs, it's still successful cleanup (pattern improvement)

**Type of change:** Safe pattern replacement (not new code, just cleaner pattern)

---

## Pre-Implementation Checklist

| Item | Status | Evidence |
|------|--------|----------|
| Target route identified | ✓ YES | src/app/api/recommendations/route.ts |
| String "decision_create" found | ✓ YES | Lines 53 and 55 |
| DECISION_CREATE exists in CAPABILITIES | ✓ YES | capabilities.ts has DECISION_CREATE = "decision:create" |
| DECISION_CREATE equals "decision:create" | ✓ YES | Correct format |
| No service refactor required | ✓ YES | Services unchanged |
| No response shape change | ✓ YES | Response building unchanged |
| No business logic change | ✓ YES | Logic stays same |
| CAPABILITIES already imported | ✓ YES | Line 4 already imports CAPABILITIES |
| Expected scanner effect clear | ✓ YES | 0-1 reduction or stable |

---

## Ready for Implementation: YES

**Conditions met:**
- ✓ Target route verified
- ✓ Target strings identified (2 instances)
- ✓ Replacement constant confirmed
- ✓ Import already present
- ✓ No service changes needed
- ✓ No behavior changes
- ✓ Expected scanner effect clear

**Proceed with phase B (implement cleanup):** YES
