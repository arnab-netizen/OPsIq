# R1-BATCH-1R: Baseline Confirmation

**Date:** 2026-05-17  
**Phase:** R1-BATCH-1R Batch 1 Reconciliation  
**Status:** BASELINE CONFIRMED - READY FOR RECONCILIATION

---

## A. Current State

**Current Branch:** main ✓

**Working Tree:** Clean (no uncommitted changes)

**Current Commit:** c30b1c6 "R1-BATCH-1: Modernize first accelerated Lane A batch"

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

**Current Results (After R1-BATCH-1):**
- Total violations: 338
- Critical: 211
- Block-build: 127

**Progress from R1-BATCH-1:**
- Violations fixed: 6 (344 → 338)
- Critical fixed: 6 (217 → 211)
- Block-build: 127 (no change expected)

---

## E. Classification

**Strategy:** RUNTIME_ENFORCED_HYBRID ✓

**Status:** Maintained (no regression in classification)

**Basis:** Routes enforce auth context at runtime via wrapper

---

**Status: ✓ R1-BATCH-1R BASELINE CONFIRMED - RECONCILIATION READY**
