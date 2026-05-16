# R1-C-0: Next Phase Decision

**Date:** 2026-05-16  
**Phase:** R1-C-0 (Third Batch Planning - Next Phase Selection)  
**Decision:** ✓ R1-C SELECTED (Direct Safe Route Batch)

---

## Phase Selection

**Selected Option:** Option A - R1-C (Third Safe Route Batch Modernization)

**Rationale:**
- R1-B proven pattern is safe and repeatable
- 10+ safe candidates available from Lane 1 and Lane 2
- All candidates meet LOW-risk criteria
- No policy design required (can defer Lane 3 for later phase if needed)
- High-confidence modernization opportunity

---

## Routes Authorized for R1-C

**Total Routes:** 6 (maximum safe batch for single-pass)

### Selected Routes

1. **src/app/api/operator/route.ts**
   - Handlers: GET, POST
   - Lane: Lane 1 (SAFE_ROUTE_CANONICALIZATION)
   - Violations: 8
   - Pattern: withEnforcementFull → withCanonicalEnforcement
   - Estimated Reduction: 8 violations

2. **src/app/api/run/route.ts**
   - Handlers: GET, POST
   - Lane: Lane 2 (CAPABILITY_ROUTE_CANONICALIZATION)
   - Violations: 6
   - Pattern: withEnforcementFull → withCanonicalEnforcement
   - Estimated Reduction: 6 violations

3. **src/app/api/owner/config/route.ts**
   - Handlers: GET, POST
   - Lane: Lane 2 (CAPABILITY_ROUTE_CANONICALIZATION)
   - Violations: 6
   - Pattern: withEnforcementFull → withCanonicalEnforcement
   - Estimated Reduction: 6 violations

4. **src/app/api/notifications/route.ts**
   - Handlers: GET, POST
   - Lane: Lane 1 (SAFE_ROUTE_CANONICALIZATION)
   - Violations: 6
   - Pattern: withEnforcementFull → withCanonicalEnforcement
   - Estimated Reduction: 6 violations

5. **src/app/api/owner/dashboard/route.ts**
   - Handlers: GET
   - Lane: Lane 2 (CAPABILITY_ROUTE_CANONICALIZATION)
   - Violations: 4
   - Pattern: withEnforcementFull → withCanonicalEnforcement
   - Estimated Reduction: 4 violations

6. **src/app/api/verify/route.ts**
   - Handlers: GET, POST
   - Lane: Lane 1 (SAFE_ROUTE_CANONICALIZATION)
   - Violations: 4
   - Pattern: withEnforcementFull → withCanonicalEnforcement
   - Estimated Reduction: 4 violations

**Total Estimated Violations Fixed:** 34  
**Post-R1-C Expected Total:** 414 - 34 = 380 violations

---

## Files Authorized for Modification

**Source Files (Route Handlers Only):**
- src/app/api/operator/route.ts
- src/app/api/run/route.ts
- src/app/api/owner/config/route.ts
- src/app/api/notifications/route.ts
- src/app/api/owner/dashboard/route.ts
- src/app/api/verify/route.ts

**Report Files (Output Only):**
- reports/readiness/r1c_preimplementation_audit.json
- reports/readiness/r1c_validation.md
- reports/readiness/r1c_acceptance_decision.md

**Scanner Artifact (Auto-Generated):**
- shadow_read_violations.json

**Total Files for Modification:** 6 source + reports + artifact

---

## Files Forbidden from Modification

**STRICT - NO CHANGES ALLOWED:**

- ✓ src/lib/enforced-route.ts (NO wrapper implementation changes)
- ✓ src/lib/canonical-route-enforcement.ts (NO wrapper changes)
- ✓ src/lib/auth-guard.ts (NO auth context changes)
- ✓ src/governance/capabilities.ts (NO capability additions)
- ✓ src/governance/role-mappings.ts (NO role mapping changes)
- ✓ src/services/** (NO service refactors)
- ✓ src/middleware/** (NO middleware changes)
- ✓ src/policies/** (NO policy wrapper changes)
- ✓ Prisma schema files (NO database changes)
- ✓ package.json dependencies (NO dependency changes)
- ✓ All other route files NOT in authorized list
- ✓ All non-governance infrastructure files

---

## Implementation Constraints

**STRICT R1-C CONSTRAINTS:**

- ✓ Use ONLY withCanonicalEnforcement wrapper (proven in R1-A and R1-B)
- ✓ Access ONLY ctx.verifiedSessionSnapshot and ctx properties
- ✓ Use ONLY existing capabilities (no new CAPABILITY definitions)
- ✓ Make NO service refactors (services unchanged)
- ✓ Make NO response shape changes (JSON structures identical)
- ✓ Make NO business logic changes (operations unchanged)
- ✓ Make NO test modifications (tests pass without change)
- ✓ Make NO capability additions (use existing)
- ✓ Make NO entitlement changes (same access control)
- ✓ Make NO role mapping changes (same semantics)
- ✓ Make NO scanner source changes (artifact only)
- ✓ Make NO type assertions (no `any`, no `as any`)

---

## Expected Outcomes

**Post-R1-C Baseline:**

| Metric | Current | Expected Post-R1-C | Change |
|--------|---------|-------------------|--------|
| **Build Status** | ✓ PASS | ✓ PASS (TypeScript) | Stable |
| **Test Status** | 78/78 ✓ | 78/78 ✓ | Stable |
| **Regressions** | 0 | 0 | Stable |
| **Scanner Total** | 414 | ~380 | -34 |
| **Critical** | 263 | ~248 | -15 |
| **Block-build** | 151 | ~134 | -17 |
| **Classification** | RUNTIME_ENFORCED_HYBRID | RUNTIME_ENFORCED_HYBRID | Stable |

---

## Validation Commands

**Pre-implementation baseline:**
```bash
npm run build
npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge
npx tsx src/governance/auth-shadow-read-scanner.ts
```

**Post-implementation validation:**
```bash
npm run build
npm test -- governance-capabilities policy-wrapper-enforcement g6r-auth-bridge
npx tsx src/governance/auth-shadow-read-scanner.ts
# Expected: All tests pass, scanner shows ~380 violations (±2 tolerance)
```

**Scope verification:**
```bash
git diff --stat HEAD~N
git diff --name-only HEAD~N | wc -l
# Expected: 6 files changed (or 6 + reports)
```

---

## Success Criteria (ALL MUST BE MET)

### Gate 1: Build Must Succeed
```
Requirement: npm run build succeeds, TypeScript passes
Tolerance: 0 type errors allowed
Action if failed: Do NOT proceed, enter R1-C-FIX phase
```

### Gate 2: Tests Must Pass (No Regressions)
```
Requirement: 78/78 core governance tests passing
Tolerance: 0 new test failures allowed
Action if failed: Do NOT proceed, diagnose test failure
```

### Gate 3: Scanner Must Show Reduction
```
Requirement: 414 → ~380 violations (34 fixed)
Tolerance: ±2 violations (378-382 acceptable)
Action if failed: Verify reduction is within tolerance, proceed if within bounds
```

### Gate 4: Only 6 Files Changed
```
Requirement: Exactly 6 source route files modified
Tolerance: 0 unauthorized files allowed
Action if failed: Revert and audit scope
```

### Gate 5: No Unauthorized Modifications
```
Requirement: ZERO changes to:
  - Services (no refactors)
  - Wrappers (no implementation changes)
  - Capabilities (no additions)
  - Entitlements (no changes)
  - Roles (no mapping changes)
  - Response shapes (no changes)
  - Business logic (no changes)
Tolerance: 0 violations allowed
Action if failed: Revert and correct
```

---

## Stop Conditions (R1-C Must Stop If)

**STOP R1-C immediately if:**
1. Build fails (TypeScript errors)
2. Any test regression (new failures)
3. Scanner shows INCREASE in violations (>414)
4. Scope audit shows >6 files changed
5. Unauthorized modifications detected
6. Response shape changes detected
7. Business logic changes detected
8. Type assertions added (any, as any)

**If STOP condition triggered:**
- Revert all R1-C commits: `git reset --hard <pre-R1-C-commit>`
- Enter R1-C-FIX diagnostic phase
- Identify root cause
- DO NOT proceed to R1-D until R1-C validates successfully

---

## Phase Timeline

**Phase Name:** R1-C (Third Safe Route Batch)  
**Scope:** 6 routes from Lane 1-2  
**Estimated Violations Fixed:** 34  
**Estimated Duration:** 1-2 days  
**Entry Condition:** This authorization document  
**Exit Condition:** All 5 gates pass  

---

## Decision

**Phase:** R1-C (Third Safe Route Batch Modernization)  
**Selected Routes:** 6 routes, 12-14 handlers  
**Authorized Files:** 6 source + reports  
**Expected Reduction:** 34 violations  
**Pattern:** R1-A proven, R1-B validated, ready for R1-C  

**DECISION: ✓ PROCEED TO R1-C IMPLEMENTATION WHEN READY**

Proceed to R1-C implementation phase with these exact 6 routes when ready.

---

## Next Phase Readiness

**R1-C is Ready to Begin:** ✓ YES

**Prerequisite Actions Complete:**
✓ R1-A completed (5 routes, 21 violations fixed)  
✓ R1-A-FIX completed (wrapper compatibility restored)  
✓ R1-B completed (3 routes, 9 violations fixed)  
✓ Build validated (TypeScript passes)  
✓ Tests validated (78/78 passing)  
✓ Scanner baseline confirmed (414 violations)  
✓ Pattern proven and repeatable  
✓ R1-C batch selected (6 routes)  
✓ Constraints documented (strict limits)  
✓ Success criteria defined (5 gates)  
✓ Stop conditions identified (8 blockers)  

**Ready to proceed:** ✓ YES - Authorization granted to begin R1-C implementation
