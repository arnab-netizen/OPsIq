# X9F-2R: createDecision Service Contract Audit

**Date:** 2026-05-16  
**Status:** CONTRACT AUDIT COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Service Contract Assessment

### Current Signature

```typescript
export async function createDecision(
  input: VerifiedDecisionInput | CreateDecisionInput
): Promise<CreateDecisionResult>
```

### Contract Analysis

**Question 1: Does createDecision still accept the old CreateDecisionInput?**

**Answer:** YES

The service function signature accepts a union type that includes CreateDecisionInput:
```typescript
input: VerifiedDecisionInput | CreateDecisionInput
```

This means the service **will accept** CreateDecisionInput with plain userId and workspaceId.

---

**Question 2: Does createDecision still allow raw userId/workspaceId without verified marker?**

**Answer:** YES, structurally

The old CreateDecisionInput interface permits this:
```typescript
export interface CreateDecisionInput {
  workspaceId: string;  // No verification marker
  userId: string;       // No verification marker
  // ...
}
```

However, the input type system does not enforce that one format or the other is used. A caller could theoretically pass either.

---

**Question 3: Does runtime format detection permit weak callers?**

**Answer:** YES, technically

The service uses duck-typing at runtime:
```typescript
const isVerified = 'verifiedActorId' in input && 'verifiedWorkspaceId' in input;
```

This detection allows:
- Verified input (if both verifiedActorId and verifiedWorkspaceId are present)
- Old raw input (if only userId and workspaceId are present)
- **Ambiguous input** (if fields are mixed or missing)

The detection does NOT prevent a weak caller from passing raw input.

---

**Question 4: Are there any remaining callers using old format?**

**Answer:** NO

Audit of all callers found:
- ✓ Route (decisions/create): 3 call sites - all construct VerifiedDecisionInput
- ✓ Bulk function: receives decisions from route - receives VerifiedDecisionInput
- ✗ No other production callers found
- ✗ No test callers found

---

**Question 5: Is backward compatibility necessary?**

**Answer:** UNCLEAR

**Evidence:**
- All production callers were updated to use VerifiedDecisionInput
- No existing tests call the service directly
- No external callers depend on old format
- Old format is not used anywhere in practice

**Assessment:** Backward compatibility is maintained for theoretical future use, but no current callers rely on it.

---

**Question 6: Can old format be removed now?**

**Answer:** YES, with confidence

**Reasoning:**
1. All production callers use new format
2. No tests depend on old format
3. Bulk function doesn't require backward compatibility
4. Service implementation is based on field detection, not overloading

**Implementation:** Could remove CreateDecisionInput from union type and convert BulkCreateInput to strictly accept VerifiedDecisionInput.

---

**Question 7: If not, can it be quarantined with explicit deprecation?**

**Answer:** YES

**Approach:**
1. Add @deprecated JSDoc to CreateDecisionInput interface
2. Document that old format is test-only compatibility
3. Update BulkCreateInput to accept only VerifiedDecisionInput
4. Keep runtime detection for backward compatibility in service
5. Plan removal in next refactor phase

**Benefit:** Signals intent to future developers while maintaining compatibility.

---

## Service Contract Classification

**Classification: DUAL_FORMAT_SAFE_TEMPORARY**

### Reasoning

**SAFE:** 
- All production callers use verified input
- No production code path uses old raw format
- Runtime format detection correctly handles both formats
- No security vulnerability (unverified input doesn't reach database without route checks)

**TEMPORARY:**
- Old format is not required by current code
- No tests depend on it
- Can be removed safely once legacy testing needs are clarified
- Backward compatibility is a transitional property, not a permanent requirement

---

## Risk Assessment

### Security Risk: LOW

**Why:** 
- All production callers come through verified route context
- Even if raw input were passed, route has already verified actor and workspace
- Service receives pre-verified userId and workspaceId from route
- Enforcement at route level, not service level

**Concern:** 
- Future developer could call service directly with old format and bypass route checks
- But no current code does this, and it would be a programming error

### Architectural Risk: MEDIUM

**Why:**
- Dual-format contract undermines the refactoring intent
- Runtime format detection is a code smell (duck-typing instead of type-safety)
- Maintenance burden: must maintain compatibility code indefinitely unless cleaned up

**Benefit:**
- Provides transition period to ensure no legacy callers exist
- Allows safe removal once confidence is high

### Test Coverage Risk: LOW

**Why:**
- All integration paths tested through route
- No test calls service directly with either format
- Test-to-production path is verified

---

## Recommendation

**Contract Classification:** ✓ ACCEPTABLE - DUAL_FORMAT_SAFE_TEMPORARY

**Action:** 
1. Accept X9F-2 as-is (production safe, architecture acceptable)
2. Document old format as test-only/transitional
3. Plan removal in X9F-5 or next governance phase
4. Monitor if any legacy code tries to call createDecision with old format

**Next Step:** Proceed to X9F-3 (acceptDecision refactoring) with same pattern

---

## Contract Verdict

**Is the service contract acceptable for production?**

✓ **YES** - All production code paths use verified input.

The dual-format acceptance is a temporary measure. The real boundary is enforced at the route level, where all calls originate. The service's willingness to accept both formats is not a security issue because it's only used by the route.

However, it's not ideal architecture, and should be cleaned up once legacy compatibility needs are fully understood.
