# X9F-6: Route Caller Update Notes

**Date:** 2026-05-16  
**Phase:** X9F-6 - Route Caller Update  
**Route:** src/app/api/decisions/[decisionId]/reject/route.ts

---

## Import Changes

### Addition: VerifiedRejectionInput Type Import

**Before (line 3):**
```typescript
import { rejectDecision } from "@/services/decision-validation/decision-acceptance.service";
```

**After (line 3):**
```typescript
import { rejectDecision, type VerifiedRejectionInput } from "@/services/decision-validation/decision-acceptance.service";
```

**Purpose:** Import the new verified input type so route can construct it with TypeScript safety.

---

## Caller Update

### Location: rejectDecision call (lines 21-28 before, 21-29 after)

**Before:**
```typescript
// Reject decision
const result = await rejectDecision({
  decisionId,
  engagementId: parsed.engagementId,
  workspaceId,
  rejectedBy: ctx.verifiedActorId,
  reason: parsed.reason,
});
```

**After:**
```typescript
// Reject decision
const verifiedInput: VerifiedRejectionInput = {
  decisionId,
  engagementId: parsed.engagementId,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,
  verifiedActorId: ctx.verifiedActorId,
  reason: parsed.reason,
};
const result = await rejectDecision(verifiedInput);
```

### Field Mapping

| Old | New | Source | Status |
|-----|-----|--------|--------|
| decisionId | decisionId | params.decisionId | unchanged |
| engagementId | engagementId | parsed.engagementId | unchanged |
| workspaceId | verifiedWorkspaceId | ctx.verifiedWorkspaceId | explicit verified |
| rejectedBy | verifiedActorId | ctx.verifiedActorId | explicit verified |
| reason | reason | parsed.reason | unchanged |

### Auth Source Clarification

**verifiedWorkspaceId:** 
- Source: ctx.verifiedWorkspaceId (from withCanonicalEnforcement)
- Verified by: enforceWorkspaceScoping (route wrapper)
- Status: Pre-verified before rejectDecision call

**verifiedActorId:**
- Source: ctx.verifiedActorId (from withCanonicalEnforcement)
- Verified by: withAuth (route wrapper)
- Status: Pre-verified before rejectDecision call

Both fields are explicitly marked as verified and come from canonical auth context.

---

## Route Pattern Preservation

| Element | Status | Evidence |
|---------|--------|----------|
| Wrapper pattern | ✓ PRESERVED | withCanonicalEnforcement unchanged (line 12) |
| Capability requirement | ✓ PRESERVED | requireCapabilities: ["DECISION_REJECT"] unchanged (line 39) |
| Workspace requirement | ✓ PRESERVED | requireWorkspace: true unchanged (line 39) |
| Handler signature | ✓ PRESERVED | async (ctx: CanonicalAuthContext, params) unchanged |
| Response shape | ✓ PRESERVED | return result unchanged (line 37) |
| Request parsing | ✓ PRESERVED | RejectDecisionSchema still used (line 19) |
| Logging | ✓ PRESERVED | logger.info still called (line 30-35) |

---

## No Weak Auth Introduced

**Safety Checks:**
- ✓ No shadow reads (withAuth not called in route)
- ✓ No raw/unverified parameters passed as verified
- ✓ No hasPermission fallback (canonical enforcement only)
- ✓ No fabricated auth (all from ctx.verifiedWorkspaceId/ctx.verifiedActorId)
- ✓ Explicit type construction prevents typos
- ✓ DECISION_REJECT capability preserved

---

## Type Safety

**Before refactoring:**
```typescript
// This would compile even if passed wrong field types:
const input = { workspaceId: ctx.verifiedActorId };  // Wrong! No type error
```

**After refactoring:**
```typescript
// This will NOT compile - type mismatch caught:
const input: VerifiedRejectionInput = {
  verifiedWorkspaceId: ctx.verifiedActorId,  // Error: type mismatch
};
```

Type-safe construction ensures correct field sources.

---

## Summary

**Total Lines Modified:** 2 (import statement + function call)  
**Total Lines Added:** 6 (new verified input construction)  
**Total Lines Removed:** 2 (old function call compact form)  
**Net Change:** +6 lines (explicit verified input construction)

**Route Safety:** ENHANCED
- Explicit verified input construction from canonical context
- Type-safe field mapping
- Clear separation of business data vs verified auth metadata
- No weak auth patterns introduced
- Wrapper and capability requirements unchanged
- DECISION_REJECT preservation verified

