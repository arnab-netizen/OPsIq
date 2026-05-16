# X9E-6: Pre-Implementation Confirmation

**Date:** 2026-05-16  
**Status:** PRE-IMPLEMENTATION INSPECTION COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## File Inspection Results

### src/app/api/decisions/[decisionId]/accept/route.ts

**Status:** ✓ CONFIRMED - Correct capability usage

**Current state:**
- Line 38: `{ requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }`

**Handler:** `POST /api/decisions/[decisionId]/accept`

**Service called:** `acceptDecision` → emits `DECISION_ACCEPTED` audit event

**Expected:** DECISION_ACCEPT ✓

**Status:** CORRECT - No changes needed

---

### src/app/api/decisions/[decisionId]/reject/route.ts

**Status:** ✓ CONFIRMED - Target route contains wrong capability

**Current state:**
- Line 39: `{ requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }`

**Handler:** `POST /api/decisions/[decisionId]/reject`

**Service called:** `rejectDecision` → emits `DECISION_REJECTED` audit event

**Expected:** DECISION_REJECT ✗ Currently uses DECISION_ACCEPT

**Status:** BUG CONFIRMED - Needs change

---

### src/domain/constants/capabilities.ts

**Status:** ✓ CONFIRMED - Both capabilities exist

**Current state:**
- Line 103: `DECISION_ACCEPT: "decision:accept"`
- Line 104: `DECISION_REJECT: "decision:reject"`

**Both capabilities:**
- ✓ Properly exported
- ✓ Follow domain:action format
- ✓ Available for use

---

## Target Replacement Specification

**String to replace:** `"DECISION_ACCEPT"` (1 instance in reject route)

**Location:** `src/app/api/decisions/[decisionId]/reject/route.ts:39`

```typescript
// BEFORE:
{ requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }

// AFTER:
{ requireCapabilities: ["DECISION_REJECT"], requireWorkspace: true }
```

**Required import:** `CAPABILITIES` already imported at line 2 - NO CHANGE NEEDED

---

## Service Refactor Required

**Answer:** NO

**Reason:**
- Route only calls rejectDecision()
- Service does not validate DECISION_REJECT capability
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
- Only capability string replaced with correct constant
- rejectDecision logic unchanged
- Entitlement tier configs unchanged
- Quota enforcement unchanged
- Rejection logic unchanged

---

## Expected Scanner Effect

**Before change:** 448 violations (283 critical, 165 block-build)

**Expected after change:** 448 violations (0 reduction expected)

**Why no reduction expected:**
- Pattern change only (capability check requirement change)
- Scanner pattern detects function calls (assertCapability, withAuth), not capability parameters
- Reject route still uses same wrapper (withCanonicalEnforcement)
- No legacy pattern migration (this is a bug fix, not pattern upgrade)

**Type of change:** Safe capability parameter correction (not new code, authorization fix)

---

## Pre-Implementation Checklist

| Item | Status | Evidence |
|------|--------|----------|
| Reject route uses DECISION_ACCEPT | ✓ YES | Line 39 confirmed |
| DECISION_REJECT exists | ✓ YES | Line 104 of capabilities.ts |
| Accept route uses DECISION_ACCEPT | ✓ YES | Line 38 correct |
| No service refactor required | ✓ YES | Services unchanged |
| No response shape change | ✓ YES | Response building unchanged |
| No business logic change | ✓ YES | Logic stays same |
| CAPABILITIES already imported | ✓ YES | Line 2 already imports CAPABILITIES |
| Expected scanner effect clear | ✓ YES | 0 reduction expected (stable) |

---

## Ready for Implementation: YES

**Conditions met:**
- ✓ Target route verified
- ✓ Target capability identified
- ✓ Replacement capability confirmed
- ✓ Import already present
- ✓ No service changes needed
- ✓ No behavior changes except authorization
- ✓ Expected scanner effect clear
- ✓ Accept route remains unchanged

**Proceed with phase B (implement bug fix):** YES
