# P2B_DEPLOYMENT_GATE.md

**Deployment Decision Gate**  
**Phase:** P2B Final Deployment Verification  
**Date:** 2026-06-02

---

## Executive Status

**FINAL VERDICT: BLOCKED ⛔**

P2B implementation has critical issues preventing deployment:
1. **Unit mismatch risk** (conditional)
2. **Enum compatibility broken** (unsafe)
3. **Integration tests scaffold-only** (untested routes)
4. **Missing "verified" state** (downstream breakage)

---

## Issues Summary

### 🔴 CRITICAL: Enum Compatibility Broken

**Issue:** verificationStatus = "flagged" not in domain schema enum  
**Impact:** Consumers checking for "verified" will never match flagged outcomes  
**Scope:** 
- attribution.ts:53 - filters by `=== "verified"` (gets empty results)
- 7day/route.ts - counts `verified` outcomes (always 0)
- evidence.ts schema - only knows ["unverified", "verified", "disputed"]

**Evidence:**
```typescript
// evidence.ts:92
verificationStatus: z.enum(["unverified", "verified", "disputed"]),

// outcome-classifier.ts:150
const verificationStatus = fraudRisk.riskLevel === "high" ? "flagged" : "unverified";

// Result: "flagged" breaks schema contract
```

**Required Fix:**
```typescript
// Option 1: Update evidence schema
verificationStatus: z.enum(["unverified", "verified", "disputed", "flagged"]),

// Option 2: Map flagged→disputed
const verificationStatus = fraudRisk.riskLevel === "high" ? "disputed" : "unverified";
```

---

### 🟡 WARNING: Unit Mismatch (Conditional Risk)

**Issue:** Classifier performs arithmetic on actualOutcomeValue and impactExpected without unit validation

**Details:**
- Both parameters are Float type
- No schema-level unit documentation
- Variance calculation: `(actual - expected) / expected`
- If units mismatch: classification fails silently

**Example Risk:**
```
Stored impactExpected: 50000 USD
Request provides actualOutcome: 50000 EUR
Math: (50000 - 50000) / 50000 = 0 → classifies as failure (wrong!)
```

**Current Status:** CONDITIONAL
- Safe if unit consistency enforced at request boundary (NOT currently done)
- Unsafe if mixed units in request body (currently possible)

**Recommended Fix:**
```typescript
// Add schema comment and validation
impactExpected Float // In USD cents (multiply by 100)
actualOutcomeValue Float // In USD cents (multiply by 100)

// In route: validate units match before classification
if (!unitsMatch(request.actualOutcome, beforeItem.impactExpected)) {
  throw new ValidationError("Unit mismatch");
}
```

---

### 🔴 CRITICAL: Integration Tests Don't Test Routes

**Issue:** operator-outcome-path.test.ts imports POST route but never calls it

**Details:**
```typescript
// Imports route (line 3)
import { POST as operatorPost } from "@/app/api/operator/route";

// But only tests classifier + manual updates
const classification = classifyOutcome(50000, expected);
await db.operatorItem.update({ ... }); // Manual, not via route

// Never calls: operatorPost(req, context)
```

**Untested Route Logic:**
- ✗ outcomeNotes validation in route
- ✗ Route error messages
- ✗ Route's verificationMetadata capture flow
- ✗ Route's actual classification integration
- ✗ Route authentication/authorization
- ✗ Idempotency key handling

**Test Coverage Estimate:** 30% (only classifier tested, not routes)

---

### 🟠 HIGH: Missing "verified" State Transition

**Issue:** Implementation never sets verificationStatus = "verified"

**Impact:** Only "unverified" and "flagged" states are possible
- No way for admin to manually verify an outcome
- Downstream code expecting "verified" state will never execute
- Attribution metrics incomplete

**Scenario:**
```
1. Admin reviews flagged outcome and approves it
2. Admin needs to set verificationStatus = "verified"
3. Current code has no mechanism to do this
4. Outcome remains "flagged" forever
```

---

## Implementation Quality Assessment

| Aspect | Status | Evidence |
|--------|--------|----------|
| Single classifier | ✓ | outcome-classifier.ts used in both paths |
| Classifier logic | ✓ | Rules correct, deterministic |
| Verification path convergence | ✓ | Both paths call captureOutcomeVerificationMetadata |
| outcomeNotes validation | ✓ | Both paths validate identical rule |
| Unit test coverage | ✓ | 36 tests pass (classifier + convergence) |
| Integration test coverage | ✗ | Routes not actually tested |
| Enum compatibility | ✗ | "flagged" breaks evidence.ts schema |
| Unit safety | ⚠ | Conditional (needs boundary validation) |

---

## Blockers for Deployment

### Blocker 1: Enum Schema Mismatch
**Severity:** CRITICAL  
**Blocker Until:** evidence.ts updated OR verification.ts changed to use "disputed"  
**Estimated Fix:** 30 minutes

```diff
// src/domain/evidence/evidence.ts
- verificationStatus: z.enum(["unverified", "verified", "disputed"]),
+ verificationStatus: z.enum(["unverified", "verified", "disputed", "flagged"]),
```

### Blocker 2: Route Integration Tests
**Severity:** CRITICAL  
**Blocker Until:** Tests actually call operatorPost and decisionLifecycle routes  
**Estimated Fix:** 2 hours

```typescript
// Needed: real route invocation tests
const response = await operatorPost(
  { body: { status: "done", actualOutcome: 50000, ... } },
  context
);
expect(response).toMatchObject({ ... });
```

### Blocker 3: Unit Validation
**Severity:** HIGH  
**Blocker Until:** Callers validate unit consistency  
**Estimated Fix:** 1 hour

```typescript
// In route: validate before classification
const unitsValid = validateUnitConsistency(
  request.actualOutcome,
  beforeItem.impactExpected
);
```

### Blocker 4: Verified State Mechanism
**Severity:** HIGH  
**Blocker Until:** Admin can transition outcome to "verified"  
**Estimated Fix:** 1.5 hours

```typescript
// Needed: New endpoint or mechanism
POST /api/operator/{id}/verify
  Authorization: admin_only
  Body: { verificationStatus: "verified" }
```

---

## Deployment Readiness Checklist

- [x] Code committed to designated branch
- [x] Classifier logic correct
- [x] Path convergence verified (unit tests)
- [x] Validation logic implemented
- [ ] **Enum schema updated** ⛔ BLOCKING
- [ ] **Integration routes tested** ⛔ BLOCKING
- [ ] Unit safety enforced at boundary ⚠ WARNING
- [ ] "Verified" state transition available ⚠ WARNING
- [ ] All tests passing
- [ ] No database migrations required
- [ ] Audit trail captured

---

## Recommendation

**Do Not Merge Until:**

1. **CRITICAL (1):** Update evidence.ts to include "flagged" in verificationStatus enum
   - File: src/domain/evidence/evidence.ts
   - Change: Add "flagged" to enum list
   - Risk: Low (additive change)

2. **CRITICAL (2):** Implement real route integration tests
   - Files: operator-outcome-path.test.ts, decision-outcome-path.test.ts
   - Required: Actually invoke routes with test context
   - Risk: Medium (requires request/response mocking)

3. **HIGH:** Add unit validation at request boundary
   - File: src/app/api/operator/route.ts
   - Add: validateUnitConsistency() check before classification
   - Risk: Low (early validation)

4. **HIGH:** Add admin verification mechanism
   - Files: New endpoint or extend existing
   - Required: Allow manual transition to "verified"
   - Risk: Medium (new endpoint)

---

## Path Forward

### Phase 1 (Prerequisites) - Must Complete Before Merge
1. Fix enum compatibility (evidence.ts)
2. Implement route integration tests
3. Add unit validation

### Phase 2 (Hardening) - Before Production
1. Admin verification endpoint
2. Performance testing with high fraud risk volume
3. Downstream impact assessment (who uses "verified"?)

### Phase 3 (Monitoring) - After Deployment
1. Monitor flagged outcome counts
2. Track verified→unflagged transitions
3. Alert on unreviewed flagged outcomes

---

## Final Status

**🔴 DECISION: BLOCKED**

Reason: Critical enum compatibility issue + untested route logic

**Estimated Time to Resolution:** 4-5 hours  
**Recommended Action:** Fix blockers, re-test, merge separately from P2B feature

---

**Approved By:** Deployment Gate Review  
**Date:** 2026-06-02  
**Next Review:** After blocker resolution
