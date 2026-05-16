# R1-B-0: Second Batch Selection

**Date:** 2026-05-16  
**Phase:** R1-B-0 (Route Batch Selection for Implementation)  
**Batch Name:** R1-B (Service-Adjacent Route Modernization)

---

## Selection Decision

**Routes Selected:** 8 (maximum allowed)  
**Total Estimated Violations Reduction:** 22 violations  
**Expected Post-R1-B Scanner Total:** 401 violations (423 - 22)

---

## Selected Routes for R1-B Implementation

### ✓ Route 1: src/app/api/recommendations/route.ts
**Lane:** 1 (SAFE_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (list), POST (create)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** RECOMMENDATION_VIEW (GET), RECOMMENDATION_CREATE (POST)  
**Capabilities Exist:** YES ✓  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 3  
**Estimated Lines Changed:** 15

### ✓ Route 2: src/app/api/findings/route.ts
**Lane:** 1 (SAFE_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (list), POST (create)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** FINDING_VIEW (GET), FINDING_CREATE (POST)  
**Capabilities Exist:** YES ✓  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 3  
**Estimated Lines Changed:** 15

### ✓ Route 3: src/app/api/evidence/route.ts
**Lane:** 1 (SAFE_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (list), POST (submit)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** EVIDENCE_VIEW (GET), EVIDENCE_SUBMIT (POST)  
**Capabilities Exist:** YES ✓  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 3  
**Estimated Lines Changed:** 15

### ✓ Route 4: src/app/api/actions/route.ts
**Lane:** 1 (SAFE_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (list)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** ACTION_VIEW (GET)  
**Capabilities Exist:** YES ✓  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 2  
**Estimated Lines Changed:** 12

### ✓ Route 5: src/app/api/leads/route.ts
**Lane:** 1 (SAFE_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (list), POST (create)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** LEAD_VIEW (GET), LEAD_CREATE (POST)  
**Capabilities Exist:** YES ✓  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 3  
**Estimated Lines Changed:** 15

### ✓ Route 6: src/app/api/clients/route.ts
**Lane:** 1 (SAFE_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (list), POST (create)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** CLIENT_VIEW (GET), CLIENT_CREATE (POST)  
**Capabilities Exist:** YES ✓  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 3  
**Estimated Lines Changed:** 15

### ✓ Route 7: src/app/api/users/route.ts
**Lane:** 2 (CAPABILITY_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (list), POST (create)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** USER_VIEW (GET), USER_CREATE (POST)  
**Capabilities Exist:** YES ✓  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 3  
**Estimated Lines Changed:** 15

### ✓ Route 8: src/app/api/me/route.ts
**Lane:** 1 (SAFE_ROUTE_CANONICALIZATION)  
**HTTP Methods:** GET (current user profile)  
**Current Pattern:** withEnforcementFull (legacy)  
**Target Pattern:** withCanonicalEnforcement (canonical)  
**Capabilities Required:** None (implicit current-user context)  
**Service Refactor:** NO ✓  
**Response Shape Risk:** LOW ✓  
**Business Logic Risk:** LOW ✓  
**Estimated Violations Fixed:** 2  
**Estimated Lines Changed:** 10

---

## Selection Rationale

**All 8 routes selected because:**
✓ All meet LOW-risk criteria  
✓ All use same withEnforcementFull wrapper (same migration pattern)  
✓ All have existing capabilities (no definitions needed)  
✓ All are read/create routes (no mutations/complex logic)  
✓ All follow established R1-A pattern  
✓ No service refactors required  
✓ No capability additions required  
✓ No response shape changes needed  

**Batch size rationale:**
- Minimum required: 3 routes
- Maximum allowed: 8 routes
- Selected: 8 (maximum, all candidates meet criteria)
- Risk: LOW (all routes identical pattern to R1-A)

---

## Excluded Candidates

**None.** All identified candidates meet selection criteria. Additional routes could be considered from remaining Lane 1/2 violations, but these 8 represent the highest-confidence, lowest-risk batch.

---

## Expected Outcomes

| Metric | Value |
|--------|-------|
| **Routes Modernized** | 8 |
| **Files Changed** | 8 |
| **Violations Fixed** | ~22 |
| **Post-R1-B Scanner Total** | ~401 (from 423) |
| **Estimated Reduction Percentage** | 5.2% |
| **Build Expected** | PASS (TypeScript) |
| **Tests Expected** | PASS (78/78, 0 regressions) |
| **Service Refactors** | 0 |
| **Capability Changes** | 0 |
| **Role Changes** | 0 |
| **Response Shape Changes** | 0 |
| **Business Logic Changes** | 0 |

---

## Implementation Validation Commands

### Pre-implementation baseline:
```bash
npm run build
npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge
npx tsx src/governance/auth-shadow-read-scanner.ts
```

### Post-implementation validation:
```bash
npm run build
npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge
npx tsx src/governance/auth-shadow-read-scanner.ts
# Expected: All tests pass, scanner shows ~401 violations (±2 tolerance)
```

### Scope verification:
```bash
git diff --stat HEAD~N
git diff --name-only HEAD~N | wc -l
# Expected: 8 files changed (or 8 + reports)
```

---

## Success Criteria (R1-B must meet ALL)

✓ Build succeeds (TypeScript compilation)  
✓ All 78 core governance tests passing  
✓ Zero test regressions  
✓ Scanner shows ~22 violations fixed (within ±2)  
✓ Only 8 authorized files changed  
✓ Zero unauthorized modifications  
✓ No service refactors occurred  
✓ No capability changes occurred  
✓ No response shape changes occurred  
✓ No business logic changes occurred  

---

## Rollback Rule

If any validation fails:
1. Revert R1-B commits: `git reset --hard <commit-before-R1-B>`
2. Diagnose issue from diff
3. Either: Fix in R1-B-FIX phase OR Exclude failing routes and resubmit
4. Do NOT proceed to R1-C until R1-B validates successfully

---

## Next Phase Entry Conditions

R1-B implementation is authorized when:
- ✓ R1-A-FIX committed and validated (current state)
- ✓ R1-B-0 batch selection completed (this document)
- ✓ R1-B implementation executed with all validations passing
- ✓ Scanner shows reduction within tolerance (±2 violations)

---

## Conclusion

R1-B batch of 8 routes selected. All routes meet LOW-risk selection criteria. Pattern proven in R1-A. Expected to fix ~22 violations with zero refactors or logic changes. Ready for implementation phase.
