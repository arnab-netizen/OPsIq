# X9F-6: Pre-Implementation Confirmation

**Date:** 2026-05-16  
**Phase:** X9F-6 - Pre-Implementation Confirmation  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Target:** rejectDecision refactoring

---

## Current rejectDecision Analysis

### Service Current State

**File:** src/services/decision-validation/decision-acceptance.service.ts  
**Function:** rejectDecision (lines 100-166)

**Current Signature:**
```typescript
export async function rejectDecision(input: DecisionRejectionInput): Promise<RejectionRecord>
```

**Current Input Type:**
```typescript
export interface DecisionRejectionInput {
  decisionId: string;        // business data
  engagementId: string;      // business data
  workspaceId: string;       // RAW - not marked as verified
  rejectedBy: string;        // RAW - not marked as verified
  reason: string;            // business data
}
```

**Uses in rejectDecision:**
- Line 111: `if (decision.workspaceId !== input.workspaceId)` (workspace isolation check)
- Line 128: `lastUpdatedBy: input.rejectedBy,` (database update)
- Line 136: `workspaceId: input.workspaceId,` (audit event)
- Line 137: `actorId: input.rejectedBy,` (audit event)
- Line 154: `rejectedBy: input.rejectedBy,` (logging)
- Line 161: `rejectedBy: input.rejectedBy,` (response field)

### Auth Guard Imports Check

**Imports examined:**
- ✓ import { db } from "@/lib/db" (database only)
- ✓ import { NotFoundError, ValidationError, ForbiddenError } (errors only)
- ✓ import { logger } from "@/infra/logger" (logging only)
- ✓ import { emitAuditEvent } from "@/infra/audit" (audit only)
- ✗ NO import from "@/lib/auth-guard" or auth-related modules
- ✗ NO withAuth() calls
- ✗ NO getSession() calls
- ✗ NO canonicalization logic

**Verdict:** ✓ SAFE - No auth-guard imports or auth-side logic

### Route Current State

**File:** src/app/api/decisions/[decisionId]/reject/route.ts

**Route Wrapper:** withCanonicalEnforcement (MODERN)  
**Capability:** DECISION_REJECT (defined and correct after X9E-6)  
**Requirement:** requireWorkspace: true

**Verified Context Available:**
- Line 1: `import { withCanonicalEnforcement, type CanonicalAuthContext }`
- Line 13: `async (ctx: CanonicalAuthContext, params) => {`
- Line 15: `const workspaceId = ctx.verifiedWorkspaceId` ✓ AVAILABLE
- Line 26: `rejectedBy: ctx.verifiedActorId` ✓ AVAILABLE

**Route Construction:**
```typescript
// Current (line 22-28):
const result = await rejectDecision({
  decisionId,
  engagementId: parsed.engagementId,
  workspaceId,                    // ctx.verifiedWorkspaceId (currently assigned to workspaceId)
  rejectedBy: ctx.verifiedActorId, // Already using verified actor ID
  reason: parsed.reason,
});
```

**Observation:** Route already has verified context but passes it as raw field names. Refactoring will make this explicit.

---

## Refactoring Safety Assessment

### Is rejectDecision Safe to Refactor Alone?

**Criteria:**

1. ✓ **No auth imports:** rejectDecision has zero auth-guard imports
2. ✓ **No service-side auth:** rejectDecision performs no auth checks
3. ✓ **Single route caller:** Only reject/route.ts calls rejectDecision
4. ✓ **No background callers:** No internal/background job callers found
5. ✓ **No service-to-service callers:** No other services call rejectDecision
6. ✓ **Verified context available:** Route provides ctx.verifiedWorkspaceId and ctx.verifiedActorId
7. ✓ **Capability defined and correct:** CAPABILITIES.DECISION_REJECT exists and is used by route (X9E-6 verified)
8. ✓ **Response shape safe:** RejectionRecord is return type, not auth-related
9. ✓ **Business logic isolated:** Refactoring is input-structure only
10. ✓ **Structurally equivalent to acceptDecision:** X9F-4 proven pattern

### Verdict

✓ **YES - SAFE TO REFACTOR ALONE**

rejectDecision can be refactored independently:
- Service has no auth logic to preserve
- Service imports nothing auth-related
- All callers are from single modern route
- Route already uses verified context
- No dual-format support currently exists
- No backward compatibility burden
- Pattern proven safe in X9F-4 (acceptDecision)

---

## Target Refactoring

### New Input Type (VerifiedRejectionInput)

```typescript
export interface VerifiedRejectionInput {
  decisionId: string;             // business data
  engagementId: string;           // business data
  verifiedWorkspaceId: string;    // Explicitly verified (from ctx.verifiedWorkspaceId)
  verifiedActorId: string;        // Explicitly verified (from ctx.verifiedActorId)
  reason: string;                 // business data
}
```

### Signature Change

```typescript
// From:
export async function rejectDecision(input: DecisionRejectionInput): Promise<RejectionRecord>

// To:
export async function rejectDecision(input: VerifiedRejectionInput): Promise<RejectionRecord>
```

### Body Changes

Replace:
- `input.workspaceId` → `input.verifiedWorkspaceId`
- `input.rejectedBy` → `input.verifiedActorId`

Preserve:
- All validation logic
- All database operations
- All audit events
- All error handling
- Response shape (RejectionRecord)

### Route Constructor

```typescript
// From:
const result = await rejectDecision({
  decisionId,
  engagementId: parsed.engagementId,
  workspaceId,
  rejectedBy: ctx.verifiedActorId,
  reason: parsed.reason,
});

// To:
const verifiedInput: VerifiedRejectionInput = {
  decisionId,
  engagementId: parsed.engagementId,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,  // Explicit
  verifiedActorId: ctx.verifiedActorId,           // Explicit
  reason: parsed.reason,
};
const result = await rejectDecision(verifiedInput);
```

---

## Capability Status

**Capability Required:** DECISION_REJECT  
**Defined In:** src/domain/constants/capabilities.ts  
**Status:** ✓ DEFINED (X9D-IMPL phase, X9E-6 verified)  
**Value:** "decision:reject"  
**Route Usage:** Line 39 in reject/route.ts: `requireCapabilities: ["DECISION_REJECT"]`

**No capability changes required.**

---

## Dual-Format Support

**Will this refactoring require dual-format support?** NO

**Why not:**
- Only one production caller (reject/route.ts)
- No tests call rejectDecision directly (integration style)
- No backward compatibility required (unlike X9F-2 createDecision)
- Route will be updated to use new format
- Safe to remove old format entirely
- Pattern proven in X9F-4 (acceptDecision) - single format only

---

## Expected Scanner Effect

**Before:** 448 total violations
**Expected after:** 448 total violations  
**Expected reduction:** 0 violations

**Reasoning:** rejectDecision route already uses canonical enforcement (no shadow reads). Refactoring changes input structure only, does not affect shadow read patterns.

---

## Pre-Implementation Confirmation Summary

| Check | Status | Evidence |
|-------|--------|----------|
| Service has no auth imports | ✓ YES | Zero auth-guard/auth module imports |
| Service has no auth logic | ✓ YES | No capability checks, no session access |
| Route is modern (canonical) | ✓ YES | withCanonicalEnforcement wrapper |
| Route provides verified context | ✓ YES | ctx.verifiedWorkspaceId, ctx.verifiedActorId |
| Only one route caller | ✓ YES | reject/route.ts only |
| No service/background callers | ✓ YES | Audit confirmed zero other callers |
| Capability defined and used | ✓ YES | DECISION_REJECT in capabilities.ts and route |
| Response shape preserved | ✓ YES | RejectionRecord unchanged |
| No dual-format needed | ✓ YES | Single caller, no backward compat required |
| Safe to refactor alone | ✓ YES | All criteria met |
| Pattern proven | ✓ YES | X9F-4 acceptDecision successfully completed |

---

## Authorization to Proceed

✓ **PRE-IMPLEMENTATION CONFIRMATION PASSED**

rejectDecision is safe to refactor:
1. Service has no auth entanglement
2. Route provides verified context
3. Only one caller (route)
4. No dual-format support needed
5. Capability fully defined and used correctly (X9E-6 verified)
6. Clear field mapping: workspaceId → verifiedWorkspaceId, rejectedBy → verifiedActorId
7. Direct pattern precedent: X9F-4 acceptDecision successfully completed

**Proceed to Phase B: rejectDecision refactoring**

