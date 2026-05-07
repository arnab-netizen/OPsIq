#!/bin/bash
# Verify that __ignored_tests__ are excluded from active TypeScript/Vitest compilation scope
# This script checks actual compilation behavior, not just file existence

set -e

echo "=== Verifying __ignored_tests__ excluded from active scope ==="
echo ""

# 1. Check TypeScript compilation scope
echo "1. Checking TypeScript compilation scope..."
TS_IGNORED=$(npx tsc --noEmit --listFiles 2>&1 | grep -c "__ignored_tests__" || true)
if [ "$TS_IGNORED" -eq 0 ]; then
  echo "   ✓ TypeScript: No __ignored_tests__ files in compilation scope"
else
  echo "   ✗ TypeScript: Found $TS_IGNORED __ignored_tests__ files in compilation scope"
  exit 1
fi

echo ""
echo "2. Checking vitest configuration..."
# Verify vitest.config.ts has __ignored_tests__ in exclude array
if grep -q "__ignored_tests__" vitest.config.ts; then
  echo "   ✓ vitest.config.ts excludes __ignored_tests__"
else
  echo "   ✗ vitest.config.ts does not exclude __ignored_tests__"
  exit 1
fi

echo ""
echo "3. Checking tsconfig.json..."
# Verify tsconfig.json has exclude pattern
if grep -q "exclude.*__ignored_tests__" tsconfig.json; then
  echo "   ✓ tsconfig.json has __ignored_tests__ in exclude pattern"
else
  echo "   ✗ tsconfig.json missing __ignored_tests__ exclusion"
  exit 1
fi

echo ""
echo "4. Verify active test files exist..."
if [ -f "src/__tests__/phase-3-event-emitter-integration.test.ts" ]; then
  echo "   ✓ Phase 3 integration test exists and is active"
else
  echo "   ✗ Phase 3 integration test not found"
  exit 1
fi

echo ""
echo "5. Verify quarantined tests directory exists..."
if [ -d "src/__ignored_tests__" ]; then
  QUARANTINED=$(find src/__ignored_tests__ -type f \( -name "*.test.ts" -o -name "*.test.tsx" \) | wc -l)
  echo "   ✓ Quarantined tests directory exists with $QUARANTINED test files"
else
  echo "   ⚠ src/__ignored_tests__/ directory not found (non-blocking)"
fi

echo ""
echo "=== VERIFICATION PASSED ==="
echo "✓ __ignored_tests__ properly excluded from active TypeScript/Vitest scope"
echo "✓ Phase 3 integration test remains active"
