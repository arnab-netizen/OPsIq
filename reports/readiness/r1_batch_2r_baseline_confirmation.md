# R1-BATCH-2R: Baseline Confirmation

**Date:** 2026-05-17  
**Phase:** R1-BATCH-2R Batch 2 Reconciliation  
**Status:** BASELINE CONFIRMED - READY FOR RECONCILIATION

---

## A. Current State

**Current Branch:** main ✓

**Working Tree:** Clean (no uncommitted changes)

**Current Commit:** 945fcf1 "R1-BATCH-2: Modernize reselected accelerated Lane A batch"

**Pull Status:** Already up to date with origin/main ✓

---

## B. Build Status

**Build Command:** npm run build

**Result:** ✓ Compiled successfully

**TypeScript:** 0 errors ✓

**Status:** CLEAN

---

## C. Test Status

**Test Suites:** governance-capabilities, policy-wrapper-enforcement, g6r-auth-bridge

**Result:** ✓ 78/78 PASS

**Breakdown:**
- governance-capabilities: 32/32
- policy-wrapper-enforcement: 32/32
- g6r-auth-bridge: 14/14

**Regressions:** None ✓

**Status:** NO REGRESSIONS

---

## D. Scanner Baseline

**Current Results (After R1-BATCH-2):**
- Total violations: 326
- Critical: 199
- Block-build: 127

**Progress:**
- From R1-BATCH-1: 6 violations fixed (344 → 338)
- From R1-BATCH-2: 12 violations fixed (338 → 326)
- Running total: 18 violations fixed (344 → 326)

---

## E. Classification

**Strategy:** RUNTIME_ENFORCED_HYBRID ✓

**Status:** Maintained (no regression in classification)

**Basis:** Routes enforce auth context at runtime via wrapper

---

**Status: ✓ R1-BATCH-2R BASELINE CONFIRMED - READY FOR RECONCILIATION**
