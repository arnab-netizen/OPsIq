# X9F-4: Pre-Implementation Confirmation

**Date:** 2026-05-16  
**Phase:** X9F-4 - Pre-Implementation Confirmation  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Target:** acceptDecision refactoring

---

## Current acceptDecision Analysis

### Service Current State

**File:** src/services/decision-validation/decision-acceptance.service.ts  
**Function:** acceptDecision (lines 24-90)

**Current Signature:**
```typescript
export async function acceptDecision(input: DecisionAcceptanceInput): Promise<AcceptanceRecord>
```

**Current Input Type:**
```typescript
// From human-decision-validator.ts:
export interface DecisionAcceptanceInput {
  decisionId: string;        // business data
  engagementId: string;      // business data
  workspaceId: string;       // RAW - not marked as verified
  acceptedBy: string;        // RAW - not marked as verified
  rationale?: string;        // business data
}
```

**Uses in acceptDecision:**
- Line 29: `workspaceId: input.workspaceId` (passed to validation)
- Line 60: `workspaceId: input.workspaceId` (used in audit event)
- Line 52: `lastUpdatedBy: input.acceptedBy` (database update)
- Line 61: `actorId: input.acceptedBy` (audit event)
- Line 78: `acceptedBy: input.acceptedBy` (response field)

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

**File:** src/app/api/decisions/[decisionId]/accept/route.ts

**Route Wrapper:** withCanonicalEnforcement (MODERN)  
**Capability:** DECISION_ACCEPT (defined in X9D-IMPL)  
**Requirement:** requireWorkspace: true

**Verified Context Available:**
- Line 1: `import { withCanonicalEnforcement, type CanonicalAuthContext }`
- Line 13: `async (ctx: CanonicalAuthContext, params) => {`
- Line 15: `const workspaceId = ctx.verifiedWorkspaceId` ✓ AVAILABLE
- Line 26: `acceptedBy: ctx.verifiedActorId` ✓ AVAILABLE

**Route Construction:**
```typescript
// Current (line 22-28):
const result = await acceptDecision({
  decisionId,
  engagementId: parsed.engagementId,
  workspaceId,                    // ctx.verifiedWorkspaceId (currently assigned to workspaceId)
  acceptedBy: ctx.verifiedActorId, // Already using verified actor ID
  rationale: parsed.rationale,
});
```

**Observation:** Route already has verified context but passes it as raw field names. Refactoring will make this explicit.

---

## Refactoring Safety Assessment

### Is acceptDecision Safe to Refactor Alone?

**Criteria:**

1. ✓ **No auth imports:** acceptDecision has zero auth-guard imports
2. ✓ **No service-side auth:** acceptDecision performs no auth checks
3. ✓ **Single route caller:** Only accept/route.ts calls acceptDecision
4. ✓ **No background callers:** No internal/background job callers found
5. ✓ **No service-to-service callers:** No other services call acceptDecision
6. ✓ **Verified context available:** Route provides ctx.verifiedWorkspaceId and ctx.verifiedActorId
7. ✓ **Capability defined:** CAPABILITIES.DECISION_ACCEPT exists and is used by route
8. ✓ **Response shape safe:** AcceptanceRecord is return type, not auth-related
9. ✓ **Business logic isolated:** Refactoring is input-structure only

### Verdict

✓ **YES - SAFE TO REFACTOR ALONE**

acceptDecision can be refactored independently:
- Service has no auth logic to preserve
- Service imports nothing auth-related
- All callers are from single modern route
- Route already uses verified context
- No dual-format support currently exists
- No backward compatibility burden

---

## Target Refactoring

### New Input Type (VerifiedAcceptanceInput)

```typescript
export interface VerifiedAcceptanceInput {
  decisionId: string;             // business data
  engagementId: string;           // business data
  verifiedWorkspaceId: string;    // Explicitly verified (from ctx.verifiedWorkspaceId)
  verifiedActorId: string;        // Explicitly verified (from ctx.verifiedActorId)
  rationale?: string;             // business data
}
```

### Signature Change

```typescript
// From:
export async function acceptDecision(input: DecisionAcceptanceInput): Promise<AcceptanceRecord>

// To:
export async function acceptDecision(input: VerifiedAcceptanceInput): Promise<AcceptanceRecord>
```

### Body Changes

Replace:
- `input.workspaceId` → `input.verifiedWorkspaceId`
- `input.acceptedBy` → `input.verifiedActorId`

Preserve:
- All validation logic
- All database operations
- All audit events
- All error handling
- Response shape (AcceptanceRecord)

### Route Constructor

```typescript
// From:
const result = await acceptDecision({
  decisionId,
  engagementId: parsed.engagementId,
  workspaceId,
  acceptedBy: ctx.verifiedActorId,
  rationale: parsed.rationale,
});

// To:
const verifiedInput: VerifiedAcceptanceInput = {
  decisionId,
  engagementId: parsed.engagementId,
  verifiedWorkspaceId: ctx.verifiedWorkspaceId,  // Explicit
  verifiedActorId: ctx.verifiedActorId,           // Explicit
  rationale: parsed.rationale,
};
const result = await acceptDecision(verifiedInput);
```

---

## Capability Status

**Capability Required:** DECISION_ACCEPT  
**Defined In:** src/domain/constants/capabilities.ts  
**Status:** ✓ DEFINED (X9D-IMPL phase)  
**Value:** "decision:accept"  
**Route Usage:** Line 38 in accept/route.ts: `requireCapabilities: ["DECISION_ACCEPT"]`

**No capability changes required.**

---

## Dual-Format Support

**Will this refactoring require dual-format support?** NO

**Why not:**
- Only one production caller (accept/route.ts)
- No tests call acceptDecision directly (integration style)
- No backward compatibility required (unlike X9F-2 createDecision)
- Route will be updated to use new format
- Safe to remove old format entirely

---

## Expected Scanner Effect

**Before:** 448 total violations
**Expected after:** 448 total violations  
**Expected reduction:** 0 violations

**Reasoning:** acceptDecision route already uses canonical enforcement (no shadow reads). Refactoring changes input structure only, does not affect shadow read patterns.

---

## Pre-Implementation Confirmation Summary

| Check | Status | Evidence |
|-------|--------|----------|
| Service has no auth imports | ✓ YES | Zero auth-guard/auth module imports |
| Service has no auth logic | ✓ YES | No capability checks, no session access |
| Route is modern (canonical) | ✓ YES | withCanonicalEnforcement wrapper |
| Route provides verified context | ✓ YES | ctx.verifiedWorkspaceId, ctx.verifiedActorId |
| Only one route caller | ✓ YES | accept/route.ts only |
| No service/background callers | ✓ YES | Audit confirmed zero other callers |
| Capability defined and used | ✓ YES | DECISION_ACCEPT in capabilities.ts and route |
| Response shape preserved | ✓ YES | AcceptanceRecord unchanged |
| No dual-format needed | ✓ YES | Single caller, no backward compat required |
| Safe to refactor alone | ✓ YES | All criteria met |

---

## Authorization to Proceed

✓ **PRE-IMPLEMENTATION CONFIRMATION PASSED**

acceptDecision is safe to refactor:
1. Service has no auth entanglement
2. Route provides verified context
3. Only one caller (route)
4. No dual-format support needed
5. Capability fully defined and used
6. Clear field mapping: workspaceId → verifiedWorkspaceId, acceptedBy → verifiedActorId

**Proceed to Phase B: acceptDecision refactoring**

