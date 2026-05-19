#!/bin/bash

# R17 PHASE A Scanner: Route Capability Coverage
# Detects routes missing requireCapabilities enforcement

echo "=== ROUTE CAPABILITY SCANNER ==="

VIOLATIONS=0
TOTAL_ROUTES=0

# Find all routes with withCanonicalEnforcement
echo "Scanning routes with withCanonicalEnforcement..."

find src/app/api -name "route.ts" -type f | while read file; do
  if grep -q "withCanonicalEnforcement" "$file"; then
    TOTAL_ROUTES=$((TOTAL_ROUTES + 1))

    # Check if route has requireCapabilities
    if ! grep -q "requireCapabilities" "$file"; then
      echo "❌ VIOLATION: $file - Missing requireCapabilities"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
done

# Check for routes using X-Workspace-Id header directly
echo ""
echo "Scanning for X-Workspace-Id header trust..."
header_violations=$(grep -r "request.headers.get.*x-workspace-id\|nextRequest.headers.get.*x-workspace-id" src/app/api --include="route.ts" | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | wc -l)
if [ "$header_violations" -gt 0 ]; then
  echo "❌ VIOLATION: Found $header_violations instances of direct X-Workspace-Id header trust"
  VIOLATIONS=$((VIOLATIONS + header_violations))
  grep -r "request.headers.get.*x-workspace-id\|nextRequest.headers.get.*x-workspace-id" src/app/api --include="route.ts" | grep -v "^[[:space:]]*//\|^[[:space:]]*\*"
fi

# Check for routes using X-Auth-Token header directly
echo ""
echo "Scanning for X-Auth-Token header trust..."
auth_violations=$(grep -r "request.headers.get.*x-auth-token\|nextRequest.headers.get.*x-auth-token" src/app/api --include="route.ts" | grep -v "^[[:space:]]*//\|^[[:space:]]*\*" | wc -l)
if [ "$auth_violations" -gt 0 ]; then
  echo "❌ VIOLATION: Found $auth_violations instances of direct X-Auth-Token header trust"
  VIOLATIONS=$((VIOLATIONS + auth_violations))
  grep -r "request.headers.get.*x-auth-token\|nextRequest.headers.get.*x-auth-token" src/app/api --include="route.ts" | grep -v "^[[:space:]]*//\|^[[:space:]]*\*"
fi

echo ""
echo "=== ROUTE SCANNER RESULT ==="
echo "Total routes scanned: $TOTAL_ROUTES"
echo "Total violations: $VIOLATIONS"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ FAILED: $VIOLATIONS security violations detected"
  exit 1
else
  echo "✅ PASSED: All routes properly enforced"
  exit 0
fi
