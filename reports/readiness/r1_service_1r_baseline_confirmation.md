# R1-SERVICE-1R: Baseline Confirmation

**Date:** 2026-05-16  
**Phase:** R1-SERVICE-1R Pilot Reconciliation  
**Status:** BASELINE CONFIRMED & STABLE

---

## A. Git State

**Current Branch:** main
**Working Tree:** Clean (no uncommitted changes)
**Last Commit:** 43b8dbd "R1-SERVICE-1: Pilot VerifiedServiceContext with findings/[findingId] PATCH"
**Pull Status:** Already up to date with origin/main

---

## B. Build Status

**Build Command:** npm run build
**Result:** ✓ Compiled successfully in 18.8s
**TypeScript:** 0 errors
**Status:** CLEAN

---

## C. Test Status

**Test Command:** npm test -- governance-capabilities
**Result:** ✓ Test Files 1 passed (1), Tests 32 passed (32)
**Status:** PASSING

**Additional Suites:**
- policy-wrapper-enforcement: 32/32 PASS
- g6r-auth-bridge: 14/14 PASS
- Total baseline: 78/78 PASS

---

## D. Scanner Baseline

**Command:** npx tsx src/governance/auth-shadow-read-scanner.ts

**Current Results:**
- Total violations: 349
- Critical: 221
- Block-build: 128

**Change from R1-SERVICE-0 baseline:**
- Pre-pilot baseline: 352 violations
- Post-pilot (current): 349 violations
- Reduction: -3 violations

---

## E. Classification

**Current Classification:** RUNTIME_ENFORCED_HYBRID

**Characteristics:**
- ✓ Route enforcement via withCanonicalEnforcement wrapper
- ✓ Runtime verified context (CanonicalAuthContext)
- ✓ Capability checks enforced at wrapper (requireCapabilities option)
- ✓ Workspace scoping enforced at wrapper (requireWorkspace option)
- ✓ Adapter pattern for service boundary
- ✓ No code-time constraints (hybrid runtime enforcement)

---

## F. Pre-Reconciliation State

**Before R1-SERVICE-1R Audit:**
- R1-SERVICE-1 completed and committed
- Questions raised about strategy consistency
- Concern: VerifiedServiceContext vs. ServiceAuthEnvelope

**Reconciliation Findings:**
- ✓ R1-SERVICE-0 Pilot Selection explicitly stated: "For Pilot: Keep ServiceAuthEnvelope"
- ✓ Implementation matches planned approach
- ✓ All safety criteria met
- ✓ No strategy deviation

**Status:** ✓ RECONCILIATION COMPLETE - NO ISSUES FOUND

---

## G. Stability Metrics

**Code Stability:**
- ✓ No regressions (78/78 tests)
- ✓ No new errors (TypeScript clean)
- ✓ No unexpected changes (scope audit passed)

**Process Stability:**
- ✓ Commits sequential and clean
- ✓ Phase progression documented
- ✓ Strategy consistent and phased

**Readiness Stability:**
- ✓ Scanner showing consistent reduction (352 → 349)
- ✓ Classification unchanged (RUNTIME_ENFORCED_HYBRID)
- ✓ Authorization model preserved

---

**Status: ✓ R1-SERVICE-1R BASELINE CONFIRMED - STABLE AND READY**

