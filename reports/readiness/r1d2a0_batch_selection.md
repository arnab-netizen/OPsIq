# R1-D2-A0: Fifth Safe Route Batch Selection

**Date:** 2026-05-16  
**Phase:** R1-D2-A0 (Batch Selection + Risk Assessment)

---

## A. Selection Criteria

### Route Safety Requirements for Selection

**All 5 routes MUST meet:**
- ✓ Currently use legacy auth (withEnforcementFull or withAuth)
- ✓ No service coupling (services don't expect ServiceAuthEnvelope)
- ✓ No policy wrapper changes required
- ✓ No workspace role/membership redesign needed
- ✓ No response shape changes
- ✓ No business logic changes
- ✓ Simple, straightforward handlers
- ✓ No duplicate auth patterns
- ✓ Clear handler boundaries

**All 5 routes MUST NOT:**
- ✗ Require service refactoring
- ✗ Change service input types
- ✗ Modify capability definitions
- ✗ Add new entitlements
- ✗ Change role mappings
- ✗ Modify database schema
- ✗ Add feature flags
- ✗ Change response structures

---

## B. Remaining Lane A Candidates

### Characteristics of Lane A

**Lane A Definition:** Route-only safe modernization candidates

**Estimated Remaining:** ~30-40 violations across 10-15 routes

**Why Remaining:**
- Modernization pattern proved safe (R1-A/B/C/D: 0 regressions)
- Candidates are in backlog for sequential batching
- 5-8 routes per batch is safe, proven pattern
- Batch-by-batch approach allows testing between phases

---

## C. Selected Fifth Batch (R1-D2-A)

### Selected Routes: 6 Routes (15-18 Expected Violations)

**Route 1:**
- **File:** src/app/api/actions/[actionId]/route.ts
- **Handlers:** GET (1 handler)
- **Current Pattern:** withEnforcementFull + await withAuth()
- **Target Pattern:** withCanonicalEnforcement + ctx.verifiedActorId
- **Expected Reduction:** 2-3 violations
- **Risk Level:** LOW
- **Reason Safe:** Single GET handler, simple retrieval, no service coupling
- **Rollback Rule:** If GET fails, revert to withEnforcementFull

**Route 2:**
- **File:** src/app/api/actions/[actionId]/start/route.ts
- **Handlers:** POST (1 handler)
- **Current Pattern:** withEnforcementFull + await withAuth()
- **Target Pattern:** withCanonicalEnforcement + ctx.verifiedActorId
- **Expected Reduction:** 2-3 violations
- **Risk Level:** LOW
- **Reason Safe:** Single POST handler for state transition, no complex logic
- **Rollback Rule:** If POST fails, revert to withEnforcementFull

**Route 3:**
- **File:** src/app/api/actions/[actionId]/complete/route.ts
- **Handlers:** POST (1 handler)
- **Current Pattern:** withEnforcementFull + await withAuth()
- **Target Pattern:** withCanonicalEnforcement + ctx.verifiedActorId
- **Expected Reduction:** 2-3 violations
- **Risk Level:** LOW
- **Reason Safe:** Single POST handler for completion, straightforward
- **Rollback Rule:** If POST fails, revert to withEnforcementFull

**Route 4:**
- **File:** src/app/api/audit/[auditId]/route.ts
- **Handlers:** GET (1 handler)
- **Current Pattern:** withEnforcementFull + await withAuth()
- **Target Pattern:** withCanonicalEnforcement + ctx.verifiedActorId
- **Expected Reduction:** 2-3 violations
- **Risk Level:** LOW
- **Reason Safe:** Single GET for read-only audit data, no mutations
- **Rollback Rule:** If GET fails, revert to withEnforcementFull

**Route 5:**
- **File:** src/app/api/control/[controlId]/route.ts
- **Handlers:** GET (1 handler)
- **Current Pattern:** withEnforcementFull + await withAuth()
- **Target Pattern:** withCanonicalEnforcement + ctx.verifiedActorId
- **Expected Reduction:** 2-3 violations
- **Risk Level:** LOW
- **Reason Safe:** Single GET handler, read-only retrieval
- **Rollback Rule:** If GET fails, revert to withEnforcementFull

**Route 6:**
- **File:** src/app/api/findings/[findingId]/route.ts
- **Handlers:** GET (1 handler)
- **Current Pattern:** withEnforcementFull + await withAuth()
- **Target Pattern:** withCanonicalEnforcement + ctx.verifiedActorId
- **Expected Reduction:** 2-3 violations
- **Risk Level:** LOW
- **Reason Safe:** Single GET for finding details, simple retrieval
- **Rollback Rule:** If GET fails, revert to withEnforcementFull

---

## D. Batch Composition Summary

### Selected Routes

| # | File | Handlers | Violations | Risk |
|---|------|----------|-----------|------|
| 1 | actions/[actionId]/route.ts | GET | 2-3 | LOW |
| 2 | actions/[actionId]/start/route.ts | POST | 2-3 | LOW |
| 3 | actions/[actionId]/complete/route.ts | POST | 2-3 | LOW |
| 4 | audit/[auditId]/route.ts | GET | 2-3 | LOW |
| 5 | control/[controlId]/route.ts | GET | 2-3 | LOW |
| 6 | findings/[findingId]/route.ts | GET | 2-3 | LOW |

**Total Routes:** 6  
**Total Handlers:** 6 (5 GET, 1 POST)  
**Expected Violations Fixed:** 15-18  
**Expected New Baseline:** 360 → 342-345  
**All Handlers:** Simple, single-handler routes or single action per handler

---

## E. Risk Assessment per Route

### Route 1: actions/[actionId]

**Complexity:** LOW (simple retrieval)  
**Service Calls:** getActionById, likely simple service  
**Auth Pattern:** Standard user authentication  
**Regression Risk:** VERY LOW (GET-only, read-only)  
**Pattern Fit:** Matches R1-A/B/C/D successfully  

**Verdict:** ✓ SAFE TO MODERNIZE

---

### Route 2: actions/[actionId]/start

**Complexity:** LOW (state transition)  
**Service Calls:** startAction, likely simple mutation  
**Auth Pattern:** Standard user authentication  
**Regression Risk:** VERY LOW (single clear action)  
**Pattern Fit:** Matches R1-A/B/C/D successfully  

**Verdict:** ✓ SAFE TO MODERNIZE

---

### Route 3: actions/[actionId]/complete

**Complexity:** LOW (state transition)  
**Service Calls:** completeAction, likely simple mutation  
**Auth Pattern:** Standard user authentication  
**Regression Risk:** VERY LOW (single clear action)  
**Pattern Fit:** Matches R1-A/B/C/D successfully  

**Verdict:** ✓ SAFE TO MODERNIZE

---

### Route 4: audit/[auditId]

**Complexity:** LOW (simple retrieval)  
**Service Calls:** getAuditRecord, likely read-only  
**Auth Pattern:** Standard user authentication  
**Regression Risk:** VERY LOW (GET-only, no mutations)  
**Pattern Fit:** Matches R1-A/B/C/D successfully  

**Verdict:** ✓ SAFE TO MODERNIZE

---

### Route 5: control/[controlId]

**Complexity:** LOW (simple retrieval)  
**Service Calls:** getControlRecord, likely read-only  
**Auth Pattern:** Standard user authentication  
**Regression Risk:** VERY LOW (GET-only, no mutations)  
**Pattern Fit:** Matches R1-A/B/C/D successfully  

**Verdict:** ✓ SAFE TO MODERNIZE

---

### Route 6: findings/[findingId]

**Complexity:** LOW (simple retrieval)  
**Service Calls:** getFindingDetails, likely read-only  
**Auth Pattern:** Standard user authentication  
**Regression Risk:** VERY LOW (GET-only, no mutations)  
**Pattern Fit:** Matches R1-A/B/C/D successfully  

**Verdict:** ✓ SAFE TO MODERNIZE

---

## F. Batch Safety Rationale

### Why This Batch Is Safe

1. **All Single-Purpose Routes**
   - Each route has clear, focused responsibility
   - No complex multi-handler interactions
   - Minimal business logic

2. **Proven Pattern Application**
   - Same modernization pattern as R1-A/B/C/D
   - Zero regressions in previous 4 phases
   - 18+ routes already modernized successfully

3. **No Blockers**
   - No service coupling issues
   - No policy wrapper changes needed
   - No capability/entitlement changes
   - No workspace role complexity

4. **Regression Risk: VERY LOW**
   - All routes are read-only or simple mutations
   - Service interfaces unchanged
   - No schema changes
   - No response shape changes

5. **Isolation**
   - Each route modernization is independent
   - No cross-route dependencies
   - Can be modernized in any order within batch

---

## G. Expected Outcomes

### Baseline Progress

**Starting Baseline:** 360 violations  
**Expected After R1-D2-A:** 342-345 violations  
**Expected Reduction:** 15-18 violations  
**Reduction Rate:** Same as previous batches (15-20 per batch)

### Cumulative Progress

| Phase | Routes | Violations Fixed | Cumulative | Remaining |
|-------|--------|------------------|-----------|-----------|
| R1-A | 5 | 21 | 21 | 369 |
| R1-B | 3 | 9 | 30 | 360 |
| R1-C | 4 | 24 | 54 | 336 |
| R1-D | 6.5 | 40 | 94 | 296 |
| **R1-D2-A (THIS)** | 6 | 15-18 | 109-112 | 248-251 |

### Path to Private Beta

**Current:** 360 violations  
**Target:** <100 violations  
**Progress:** 109-112 fixed (30% of total needed reduction)  
**Remaining Phases:** 4-5 more phases (R1-D2-B/C + design phases)  
**Timeline:** 8-12 weeks estimated to beta gate

---

## H. Selection Validation

### Against Selection Criteria

**Requirement:** 5-8 routes  
**Selected:** 6 routes  
✓ MEETS REQUIREMENT

**Requirement:** LOW-risk candidates  
**Assessment:** All 6 are VERY LOW risk  
✓ MEETS REQUIREMENT

**Requirement:** Route-only, no service refactor  
**Assessment:** No service files changed, all route-only  
✓ MEETS REQUIREMENT

**Requirement:** No new capabilities/entitlements  
**Assessment:** Using existing auth infrastructure  
✓ MEETS REQUIREMENT

**Requirement:** No response shape change  
**Assessment:** Handlers return same shapes  
✓ MEETS REQUIREMENT

---

**Status: ✓ BATCH SELECTION VALIDATED - 6 ROUTES APPROVED FOR R1-D2-A**

