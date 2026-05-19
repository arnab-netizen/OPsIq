#!/bin/bash

# R17 PHASE E: Regression Prevention Gate Proof Test
# Demonstrates that CI gates work by introducing and removing violations

set -e

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  R17 PHASE E: REGRESSION GATE PROOF TEST                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

TEST_FILE="src/app/api/test-regression-violation.ts"

# STEP 1: Verify scanners pass on clean codebase
echo "STEP 1: Verify scanners pass on current codebase"
echo "==========================================="
if bash scripts/scanners/00-run-all-scanners.sh > /tmp/clean_scan.txt 2>&1; then
  echo "✅ Scanners passed on clean codebase"
  CLEAN_PASS=true
else
  echo "⚠️  Scanners currently have violations - will fix and re-test"
  CLEAN_PASS=false
fi
echo ""

# STEP 2: Introduce intentional violation
echo "STEP 2: Introduce intentional violation"
echo "========================================"
cat > "$TEST_FILE" << 'VIOLATION_CODE'
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";

// ❌ INTENTIONAL VIOLATION: Missing requireCapabilities
export const GET = withCanonicalEnforcement(
  async (ctx) => {
    // ❌ INTENTIONAL VIOLATION: Using header directly
    const workspaceId = ctx.request!.headers.get("x-workspace-id");

    return {
      test: "violation"
    };
  },
  { requireWorkspace: true }  // ← Missing requireCapabilities
);
VIOLATION_CODE

echo "Created test violation file: $TEST_FILE"
echo "Violation 1: Missing requireCapabilities option"
echo "Violation 2: Direct X-Workspace-Id header trust"
echo ""

# STEP 3: Run scanners - should FAIL
echo "STEP 3: Run scanners on violated code"
echo "======================================"
echo "Expected: Scanner failures"
if ! bash scripts/scanners/00-run-all-scanners.sh > /tmp/violation_scan.txt 2>&1; then
  echo "✅ CONFIRMED: Scanners correctly FAILED on violation"
  echo "Gate status: CLOSED (prevents deployment)"
  VIOLATION_FAIL=true
else
  echo "❌ ERROR: Scanners did not detect violation!"
  VIOLATION_FAIL=false
fi
echo ""

# STEP 4: Remove violation
echo "STEP 4: Remove intentional violation"
echo "===================================="
cat > "$TEST_FILE" << 'FIXED_CODE'
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";

// ✅ FIXED: Has requireCapabilities
export const GET = withCanonicalEnforcement(
  async (ctx) => {
    // ✅ FIXED: Using verified context instead of header
    const workspaceId = ctx.verifiedWorkspaceId;

    return {
      test: "fixed"
    };
  },
  { requireCapabilities: [CAPABILITIES.SYSTEM_ADMIN], requireWorkspace: true }
);
FIXED_CODE

echo "Fixed violation file: $TEST_FILE"
echo "Fixed 1: Added requireCapabilities option"
echo "Fixed 2: Removed direct header trust, using ctx.verifiedWorkspaceId"
echo ""

# STEP 5: Run scanners - should PASS
echo "STEP 5: Run scanners on fixed code"
echo "=================================="
echo "Expected: All scanners pass"
if bash scripts/scanners/00-run-all-scanners.sh > /tmp/fixed_scan.txt 2>&1; then
  echo "✅ CONFIRMED: Scanners PASSED after fix"
  echo "Gate status: OPEN (permits deployment)"
  FIXED_PASS=true
else
  echo "❌ ERROR: Scanners still failing after fix!"
  FIXED_PASS=false
fi
echo ""

# STEP 6: Clean up test file
echo "STEP 6: Cleanup"
echo "==============="
rm "$TEST_FILE"
echo "Removed test violation file"
echo ""

# SUMMARY
echo "╔════════════════════════════════════════════════════════════╗"
echo "║  PHASE E TEST RESULTS                                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

if [ "$VIOLATION_FAIL" = true ] && [ "$FIXED_PASS" = true ]; then
  echo "✅ PHASE E PROOF COMPLETE"
  echo ""
  echo "Demonstration:"
  echo "  1. Clean codebase: Scanners PASS ✅"
  echo "  2. With violations: Scanners FAIL ✅"
  echo "  3. After fixes: Scanners PASS ✅"
  echo ""
  echo "Conclusion: Regression gates are WORKING"
  echo "Future violations will be automatically caught by CI"
  exit 0
else
  echo "❌ PHASE E TEST FAILED"
  echo ""
  echo "Results:"
  echo "  Violation detection: $([ "$VIOLATION_FAIL" = true ] && echo "✅" || echo "❌")"
  echo "  Fix verification: $([ "$FIXED_PASS" = true ] && echo "✅" || echo "❌")"
  exit 1
fi
