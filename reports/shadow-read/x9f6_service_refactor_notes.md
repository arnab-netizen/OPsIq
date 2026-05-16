# X9F-6: Service Refactor Notes

**Date:** 2026-05-16  
**Phase:** X9F-6 - Service Refactoring  
**Service:** rejectDecision  
**File:** src/services/decision-validation/decision-acceptance.service.ts

---

## Changes Made

### Addition 1: VerifiedRejectionInput Interface

**Location:** Lines 24-30 (new)

```typescript
export interface VerifiedRejectionInput {
  decisionId: string;
  engagementId: string;
  verifiedWorkspaceId: string;    // Explicitly verified (from ctx.verifiedWorkspaceId)
  verifiedActorId: string;        // Explicitly verified (from ctx.verifiedActorId)
  reason: string;
}
```

**Purpose:** Explicit marker for verified auth metadata. Route constructs from verified context only.

### Change 1: Function Signature Update

**Before (line 100):**
```typescript
export async function rejectDecision(input: DecisionRejectionInput): Promise<RejectionRecord>
```

**After (line 109):**
```typescript
export async function rejectDecision(input: VerifiedRejectionInput): Promise<RejectionRecord>
```

**Impact:** Service now only accepts explicitly verified input. No backward compat support (unlike createDecision X9F-2).

### Change 2: Workspace Isolation Check

**Before (line 111):**
```typescript
if (decision.workspaceId !== input.workspaceId) {
```

**After (line 120):**
```typescript
if (decision.workspaceId !== input.verifiedWorkspaceId) {
```

**Impact:** Service verifies workspace isolation using verified workspace ID. Same logic, explicit naming.

### Change 3: Database Update Call

**Before (line 128):**
```typescript
lastUpdatedBy: input.rejectedBy,
```

**After (line 137):**
```typescript
lastUpdatedBy: input.verifiedActorId,
```

**Impact:** Database records verified actor ID. Same semantic meaning, explicit naming.

### Change 4: Audit Event Call

**Before (lines 136-137):**
```typescript
workspaceId: input.workspaceId,
actorId: input.rejectedBy,
```

**After (lines 145-146):**
```typescript
workspaceId: input.verifiedWorkspaceId,
actorId: input.verifiedActorId,
```

**Impact:** Audit event records verified IDs. Clearer intent in audit trail.

### Change 5: Logger Call

**Before (line 154):**
```typescript
rejectedBy: input.rejectedBy,
```

**After (line 163):**
```typescript
rejectedBy: input.verifiedActorId,
```

**Impact:** Logs use verified actor ID. Same meaning, consistent naming.

### Change 6: Return Statement

**Before (line 161):**
```typescript
rejectedBy: input.rejectedBy,
```

**After (line 170):**
```typescript
rejectedBy: input.verifiedActorId,
```

**Impact:** Response payload includes verified actor ID. RejectionRecord structure unchanged.

---

## Business Logic Preservation

| Element | Status | Evidence |
|---------|--------|----------|
| Decision existence check | ✓ PRESERVED | findUnique still called |
| Workspace isolation check | ✓ PRESERVED | Workspace mismatch still verified |
| Reason validation | ✓ PRESERVED | Reason required and trimmed still checked |
| Status update | ✓ PRESERVED | status: "blocked" still set |
| Audit event emission | ✓ PRESERVED | AUDIT_EVENTS.DECISION_REJECTED still emitted |
| Error handling | ✓ PRESERVED | NotFoundError, ForbiddenError, ValidationError still thrown |
| Database operations | ✓ PRESERVED | operatorItem.update still called |
| Response shape | ✓ PRESERVED | RejectionRecord still returned with same fields |
| Logging | ✓ PRESERVED | Decision rejected still logged |

---

## Auth Boundary Strengthening

**Before:**
- Service accepted raw DecisionRejectionInput
- Fields workspaceId and rejectedBy had no explicit "verified" marker
- Implicit trust in caller

**After:**
- Service accepts VerifiedRejectionInput with explicit verified field names
- Fields verifiedWorkspaceId and verifiedActorId clearly marked as pre-verified
- Route constructs verified input from canonical context
- Service can immediately trust input without re-verification

---

## No Dual-Format Support

**Note:** Unlike createDecision (X9F-2), rejectDecision does NOT accept both formats.

**Why:**
- Only one production caller (reject/route.ts)
- Route updated to pass new format
- No backward compatibility needed
- Cleaner type safety

**If called with old format:** TypeScript error - compile time failure (type safe)

---

## Summary

**Total Lines Modified:** ~6 (field name updates from workspaceId/rejectedBy to verifiedWorkspaceId/verifiedActorId)  
**Total Lines Added:** 8 (new VerifiedRejectionInput interface)  
**Total Lines Removed:** 0  
**Net Change:** +8 lines (new interface only)

**Service Pattern:** Same as X9F-4 pattern (VerifiedAcceptanceInput for acceptDecision), but without backward compatibility burden.

