# R1-SERVICE-1R: Next Pilot Selection (R1-SERVICE-2)

**Date:** 2026-05-16  
**Phase:** R1-SERVICE-1R Reconciliation  
**Pilot Status:** SELECTED

---

## A. Candidate Evaluation

### Candidate 1: actions/[actionId] PATCH + updateAction
**Service Input Type:** CanonicalAuthContext (no adapter needed)  
**Route Handler:** PATCH in src/app/api/actions/[actionId]/route.ts  
**Current Pattern:** withEnforcementFull + canonicalizeAuthContext()  
**Complexity:** LOW (just updates action fields)  
**Risk:** LOW (well-tested service)  
**Violations Fixed:** 4 (estimated)

**Analysis:**
- Service already accepts CanonicalAuthContext (ALIGNED - no adapter needed)
- This is simpler than findings pilot (no adapter creation)
- Pure wrapper modernization (wrapper only, no adapter)
- Good follow-up to findings pilot
- Demonstrates pattern without adapter complexity

**Verdict:** ✓ BEST CHOICE (simplest, clearest pattern progression)

### Candidate 2: clients/[clientId] PATCH + updateClient
**Service Input Type:** CanonicalAuthContext  
**Route Handler:** PATCH in src/app/api/clients/[clientId]/route.ts  
**Current Pattern:** withEnforcementFull + canonicalizeAuthContext()  
**Complexity:** MEDIUM (complex client data)  
**Risk:** LOW (well-tested service)  
**Violations Fixed:** 4 (estimated)

**Analysis:**
- Service expects CanonicalAuthContext (aligned)
- Client data is more complex (many fields to update)
- Good for follow-up pilot after actions
- Can demonstrate pattern scaling to complex updates

**Verdict:** ✓ VIABLE (save for R1-SERVICE-3)

### Candidate 3: clients/[clientId]/contacts/[contactId] PATCH + updateContact
**Service Input Type:** CanonicalAuthContext  
**Route Handler:** PATCH in src/app/api/clients/[clientId]/contacts/[contactId]/route.ts  
**Current Pattern:** withEnforcementFull + canonicalizeAuthContext()  
**Complexity:** MEDIUM (contact data with client nesting)  
**Risk:** LOW  
**Violations Fixed:** 3 (estimated)

**Analysis:**
- Service expects CanonicalAuthContext
- Nested route parameter complexity
- Good for later pilots
- More complex parameter handling

**Verdict:** ✓ VIABLE (save for R1-SERVICE-4)

### Candidate 4: clients/[clientId]/contacts/[contactId] DELETE + deactivateContact
**Service Input Type:** Unknown (need to verify)  
**Route Handler:** DELETE (different verb)  
**Complexity:** Likely MEDIUM+  
**Risk:** MEDIUM (mutation with different semantics)

**Analysis:**
- DELETE semantics different from PATCH
- Need to verify service type first
- Defer to later phase

**Verdict:** ✗ DEFER (different HTTP verb, need analysis)

---

## B. Selected Pilot: R1-SERVICE-2

### ✓ SELECTED: actions/[actionId] PATCH + updateAction

**Why Selected:**
1. Simplest next pattern (wrapper-only, no adapter needed)
2. Service already aligned (CanonicalAuthContext)
3. Pure modernization pattern
4. Good progression from findings pilot
5. Isolated and straightforward
6. LOW risk, LOW complexity

---

## C. Exact Files and Changes

### Route File: CHANGE REQUIRED
**File:** src/app/api/actions/[actionId]/route.ts

**Current PATCH Handler:**
```typescript
export const PATCH = withEnforcementFull(async (request, context, params) => {
  const { session, policy } = await withAuth({
    capability: CAPABILITIES.ACTION_UPDATE,
    internalOnly: true,
  });
  // ... workspace validation, body parsing, service call
});
```

**Target PATCH Handler:**
```typescript
export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const { actionId } = params;
    parseOrThrow(uuidSchema, actionId);
    
    const body = await parseRequestBody(ctx.request!, updateActionSchema);
    
    // No adapter needed - service accepts CanonicalAuthContext directly
    const result = await updateAction(actionId, body, ctx, ctx.verifiedWorkspaceId);
    
    return Response.json(result);
  },
  {
    requireCapabilities: [CAPABILITIES.ACTION_UPDATE],
    requireWorkspace: true,
  }
);
```

### Service File: NO CHANGE
**File:** src/services/action.ts
- updateAction function signature: already accepts CanonicalAuthContext
- Status: NOT MODIFIED

---

## D. Allowed Files

**For R1-SERVICE-2 Pilot:**
- src/app/api/actions/[actionId]/route.ts (PATCH handler only)

**Forbidden:**
- All service files
- All other route files
- Wrapper implementation
- Auth middleware
- Database files
- Capability definitions

---

## E. Expected Impact

**Violations Fixed:** 4 (estimated 352 → 348)
- withEnforcementFull pattern (CRITICAL)
- withAuth() call (CRITICAL)
- canonicalizeAuthContext() (CRITICAL)
- withAuth import (BLOCK_BUILD)

**Pattern Demonstrated:** Pure wrapper modernization (no adapter)

**Scope:** Single route handler (PATCH only)

---

## F. Validation Commands

**Build:** npm run build
**Tests:** npm test -- governance-capabilities, policy-wrapper-enforcement, g6r-auth-bridge
**Scanner:** npx tsx src/governance/auth-shadow-read-scanner.ts

**Expected Results:**
- TypeScript: 0 errors
- Tests: 78/78 passing (no regressions)
- Scanner: ~348 violations (-4 from current 349, or -8 from original 352)

---

## G. Rollback Rule

**If Issues Arise:**
1. Revert src/app/api/actions/[actionId]/route.ts PATCH handler
2. Restore withEnforcementFull + withAuth() pattern
3. Cost: 5 minutes, 1 file revert

---

## H. Readiness Summary

**Next Pilot:** ✓ SELECTED (actions/[actionId] PATCH)
**Risk Level:** LOW
**Complexity:** LOW
**Service Adaptation:** NONE (service already aligned)
**Expected Success Rate:** HIGH (95%+)
**Ready to Proceed:** YES

---

**Status: R1-SERVICE-2 PILOT SELECTED - READY FOR AUTHORIZATION**

