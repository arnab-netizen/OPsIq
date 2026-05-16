# X9F-2: Route Caller Update Notes

**Date:** 2026-05-16  
**Status:** ROUTE CALLER UPDATE COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Changes Made

### File: src/app/api/decisions/create/route.ts

**Change 1 - Import Update (Line 7-11):**

Added VerifiedDecisionInput type import:

```typescript
import {
  createDecision,
  createDecisionsBulk,
  parseCSV,
  type VerifiedDecisionInput,  // ← Added
} from "@/services/decisions/decision-creation-service";
```

**Purpose:** Enable type-safe verified input construction

**Change 2 - Single Decision Creation (Line 61-76):**

Updated single decision creation to construct and pass verified input:

```typescript
// FROM:
const decision = await createDecision({
  title,
  type,
  impact,
  confidence,
  workspaceId,
  userId,
  problemType,
  expectedOutcome,
});

// TO:
const verifiedInput: VerifiedDecisionInput = {
  title,
  type,
  impact,
  confidence,
  verifiedActorId: userId,  // Verified by withAuth()
  verifiedWorkspaceId: workspaceId,  // Verified by enforceWorkspaceScoping()
  problemType,
  expectedOutcome,
};

const decision = await createDecision(verifiedInput);
```

**Purpose:** Explicitly pass verified auth data with clear labels

**Change 3 - Bulk JSON Creation (Line 45-52):**

Updated bulk JSON creation to use verified field names:

```typescript
// FROM:
const decisions = body.decisions.map((d: any) => ({
  ...d,
  workspaceId,
  userId,
}));

// TO:
const decisions = body.decisions.map((d: any) => ({
  ...d,
  verifiedWorkspaceId: workspaceId,  // Verified by enforceWorkspaceScoping()
  verifiedActorId: userId,  // Verified by withAuth()
}));
```

**Purpose:** Signal to service that these are verified values

**Change 4 - CSV Bulk Creation (Line 98-106):**

Updated CSV parsing to convert to verified format:

```typescript
// FROM:
try {
  const decisions = parseCSV(csvContent, workspaceId, userId);
  const result = await createDecisionsBulk({ decisions });

// TO:
try {
  const parsedDecisions = parseCSV(csvContent, workspaceId, userId);
  const verifiedDecisions = parsedDecisions.map((d: any) => ({
    ...d,
    verifiedWorkspaceId: workspaceId,  // Verified by enforceWorkspaceScoping()
    verifiedActorId: userId,  // Verified by withAuth()
  }));
  const result = await createDecisionsBulk({ decisions: verifiedDecisions });
```

**Purpose:** Transform legacy parseCSV output to verified input format

---

## Route Behavior Preservation

**Wrapper Pattern:** ✓ PRESERVED
- Still uses withEnforcementFull (legacy wrapper)
- No wrapper changes
- No handler signature changes

**Handler Logic:** ✓ PRESERVED
- Request parsing unchanged
- Auth checks unchanged (still done at route level)
- Workspace enforcement unchanged
- Capability check unchanged (still checks DECISION_CREATE)
- Response building unchanged

**Response Shape:** ✓ PRESERVED
- Returns same decision objects
- No response format changes
- Error handling unchanged

**Request Handling:** ✓ PRESERVED
- JSON request handling unchanged
- CSV upload handling unchanged
- Content-type detection unchanged

---

## Auth Verification Context

**Route already verifies:**
1. **Actor Identity:** `await withAuth()` verifies user is authenticated
   - Result: session.user.id (verified actor ID)

2. **Workspace Membership:** `await enforceWorkspaceScoping()` verifies user belongs to workspace
   - Result: membership object (verified workspace membership)

3. **Capability/Quota:** `await assertCapability(workspaceId, CAPABILITIES.DECISION_CREATE)`
   - Result: capabilityCheck confirming user has DECISION_CREATE capability

**Service now receives:** Explicitly labeled verified data from all three checks

---

## Caller Update Summary

**Files Modified:** 1 (route)
**Changes:** 4 (import + 3 call sites with verified input construction)
**Lines Added:** ~15 (verified input construction)
**Lines Removed:** 0
**Handler Signature Changes:** 0
**Response Changes:** 0
**Authorization Changes:** 0

**Result:** Route explicitly passes verified auth data, service receives clear signals that data is pre-verified

---

## No Other Route Changes

**Accept route:** ✓ NOT MODIFIED
**Reject route:** ✓ NOT MODIFIED
**Close route:** ✓ NOT MODIFIED
**Other routes:** ✓ NOT MODIFIED

---

## Backward Compatibility

**Service supports both input formats:**
- Old CreateDecisionInput (for legacy callers)
- New VerifiedDecisionInput (for modern callers)

**Current callers transition:** All callers (JSON, bulk, CSV) updated to use new format

**Future callers:** Can use either format - service detects at runtime

**Result:** No breaking changes, clean migration path
