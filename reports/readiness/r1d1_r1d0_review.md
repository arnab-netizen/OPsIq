# R1-D-1: R1-D-0 Review and Narrowing Rationale

**Date:** 2026-05-16  
**Phase:** R1-D-1 (Batch Selection Phase)  
**Review Scope:** R1-D-0 22-route selection and scope validation

---

## R1-D-0 Plan Summary

**Phase:** R1-D-0 (Next Phase Planning)  
**Selected Batch:** 22 routes from Lane A (Safe Routes)  
**Expected Violations:** 90 fixed (390 → 300)  
**Expected Duration:** 1-2 days  
**Risk Assessment:** LOW (proven pattern)

### Routes Identified

R1-D-0 identified the following 22 candidate routes as Lane A safe routes:

1. src/app/api/engagements/[engagementId]/constraint-checks/route.ts (6 violations)
2. src/app/api/engagements/[engagementId]/escalation-checks/route.ts (6 violations)
3. src/app/api/engagements/[engagementId]/experiments/route.ts (6 violations)
4. src/app/api/engagements/[engagementId]/review-cycles/route.ts (6 violations)
5. src/app/api/entitlement/quota/route.ts (6 violations)
6. src/app/api/governance/alerts/route.ts (6 violations)
7. src/app/api/growth/revenue-streams/route.ts (6 violations)
8. src/app/api/metrics/control-effectiveness/route.ts (6 violations)
9. src/app/api/metrics/decision-latency/route.ts (6 violations)
10. src/app/api/notifications/[id]/route.ts (6 violations)
11. src/app/api/observability/summary/route.ts (6 violations)
12. src/app/api/clients/[clientId]/route.ts (5 violations)
13. src/app/api/clients/[clientId]/contacts/[contactId]/route.ts (5 violations)
14. src/app/api/engagements/[engagementId]/condition/route.ts (5 violations)
15. src/app/api/engagements/[engagementId]/intervention-state/route.ts (5 violations)
16. src/app/api/engagements/[engagementId]/shock-events/route.ts (5 violations)
17. [17+ additional routes from reclassification audit]

---

## Scope Assessment

### R1-D-0 Plan Analysis

**Scope:** 22 routes, ~50-90 violations, 1-2 days estimated  
**Pattern:** Same as R1-A/B/C (proven safe)  
**Risk Level:** LOW (based on pattern confidence)  
**Implementation Risk:** MEDIUM-HIGH (batch size is 4-5x larger than previous phases)

### Comparison to Prior Phases

| Phase | Routes | Violations | Duration | Status |
|-------|--------|-----------|----------|--------|
| R1-A | 5 | 21 | 1 day | ✓ PASS (no FIX needed) |
| R1-B | 3 | 9 | 1 day | ✓ PASS (no FIX needed) |
| R1-C | 4 | 24 | 1-2 days | ✓ PASS (no FIX needed) |
| **R1-D (planned)** | **22** | **90** | **1-2 days** | ? RISK |

### Risk Assessment

**R1-D-0 22-Route Batch Risks:**

1. **Batch Size Risk:** 22 routes is 4-5x larger than R1-C (4 routes)
   - Increased chance of discovering edge cases
   - Harder to debug if something breaks across many files
   - Scope audit becomes more complex

2. **Time Pressure Risk:** Estimate assumes no issues found
   - If any issues arise, timeline extends significantly
   - Larger batch = higher probability of needing rework

3. **Quality Risk:** Harder to maintain focus with 22 concurrent changes
   - R1-A/B/C all completed in single pass (no FIX needed)
   - Larger batch may introduce regression in some routes

4. **Testing Risk:** May miss edge cases when validating 22 routes in parallel
   - Previous phases had simpler routes with fewer handlers
   - More complex routes in the 22-route batch

### Decision: R1-D-0 22-Route Batch is TOO BROAD

**Rationale:**
- Phase capacity proven for 4-5 routes (R1-C was 4 and optimal)
- 22 routes exceeds safe implementation capacity by 4-5x
- Risk of regression increases significantly with batch size
- Better approach: narrow to 5-8 proven-safe routes

---

## R1-D-1 Planning Decision

### Phase Structure: Narrowing to Safe Batch

**R1-D-0:** Planning and candidate identification ✓  
**R1-D-1:** Narrow selection to 5-8 lowest-risk routes (this phase)  
**R1-D-MAIN:** Implement selected batch  
**R1-D2/D3/D4:** Additional Lane A batches as needed  

### Rationale for Narrowing

1. **Proven Batch Size:** R1-C succeeded with 4 routes, no FIX needed
   - Suggests 4-5 routes is optimal
   - 5-8 routes maintains safe implementation zone
   - Larger batches haven't been tested

2. **Quality Assurance:** Narrower batch allows
   - More careful implementation review
   - Better edge-case detection
   - Single-pass success expected (no FIX phase needed)

3. **Risk Management:** Smaller batch = easier rollback if needed
   - Easier to identify problematic routes
   - Faster scope audit
   - Cleaner git history

4. **Project Momentum:** Multiple smaller phases feel faster than one large phase
   - R1-D-1 completion in 1 day
   - R1-D2 completion in 1 day
   - Perception of progress maintains momentum

### R1-D-1 Purpose

**This Phase (R1-D-1):**
- Score all 22 Lane A candidates for risk
- Select only 5-8 lowest-risk routes
- Create strict R1-D-MAIN authorization
- NO implementation (selection only)

**NOT authorized:**
- 22-route implementation
- Service-boundary modernization
- Run/verify/policy routes
- Any code changes

---

## Scope Validation

### What R1-D-0 Got Right

✓ Lane A candidate identification (22 safe routes)  
✓ Risk level assessment (all LOW risk)  
✓ Pattern confidence (proven in R1-A/B/C)  
✓ Violation count estimate (90 violations from 22 routes)  
✓ Options evaluation (R2-0 parallel deployment, optional audits)  

### What R1-D-0 Overestimated

✗ Batch size for implementation (22 routes is too many)  
✗ Timeline confidence (1-2 days assumes no edge cases)  
✗ Risk level given batch size (LOW for pattern, MEDIUM for scale)  

### Correction in R1-D-1

**R1-D-0 22-route selection:** REJECTED as implementation batch  
**R1-D-1 narrowing:** Select 5-8 lowest-risk from the 22  
**R1-D-MAIN:** Implement narrowed batch using proven safe pattern  
**R1-D2/D3/D4:** Implement remaining Lane A routes in smaller batches  

---

## No Implementation Authorized in R1-D-1

**This Phase is Selection-Only:**
- ✓ Analyze 22 candidates
- ✓ Score each for risk
- ✓ Select 5-8 lowest-risk
- ✓ Narrow authorization document

**NOT authorized:**
- ✗ Code changes
- ✗ Wrapper changes
- ✗ Service changes
- ✗ Capability changes
- ✗ Any implementation work

**When Implementation Authorized:**
- After R1-D-1 selection complete
- In separate R1-D-MAIN phase
- With exact 5-8 route list
- With strict success criteria

---

## Next Steps in R1-D-1

1. **Phase C:** Score all 22 candidates for risk level
2. **Phase D:** Select only 5-8 lowest-risk routes
3. **Phase E:** Create R1-D-MAIN authorization with narrowed batch
4. **Commit:** Only planning documents (no code)

---

## Conclusion

**R1-D-0 Review Result:** ✓ VALID PLANNING, ✗ BATCH TOO BROAD FOR IMPLEMENTATION

R1-D-0 identified all the right candidates and created excellent options analysis. However, 22-route batch exceeds proven safe implementation capacity (R1-C optimal at 4 routes). 

**Decision:** Proceed with R1-D-1 to narrow R1-D-0 selection to 5-8 lowest-risk routes, then authorize R1-D-MAIN with strict scope.

**Status: ✓ READY FOR CANDIDATE RISK SCORING AND BATCH NARROWING**
