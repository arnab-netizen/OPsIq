#!/bin/bash

# R17 PHASE A Scanner: Direct Trust Pattern Detection
# Detects unverified actorId/workspaceId/role/capability usage

echo "=== DIRECT TRUST PATTERN SCANNER ==="

VIOLATIONS=0

# Scanner 1: Direct actorId usage in mutation services
echo "Scanning for direct actorId parameter trust..."
actorId_violations=$(find src/services -name "*.ts" -exec grep -l "function.*actorId\|actorId:" {} \; | \
  xargs grep -l "export.*function.*\(create\|update\|delete\|transition\|approve\)" | \
  xargs grep -c "actorId:" | grep -v ":0" | wc -l)

if [ "$actorId_violations" -gt 0 ]; then
  echo "❌ VIOLATION: Found $actorId_violations services with direct actorId parameters"
  find src/services -name "*.ts" -exec grep -l "function.*actorId\|actorId:" {} \; | \
    xargs grep -l "export.*function.*\(create\|update\|delete\)" | \
    xargs grep -n "actorId:" | head -10
  VIOLATIONS=$((VIOLATIONS + actorId_violations))
fi

# Scanner 2: Direct workspaceId usage in mutations (without verified context)
echo ""
echo "Scanning for unverified workspaceId usage..."
workspace_violations=$(find src/services -name "*.ts" -exec grep -l "workspaceId:" {} \; | \
  xargs grep -l "export.*function.*\(create\|update\|delete\)" | \
  xargs grep -L "context.authContext.verifiedWorkspaceId\|envelope.verifiedBy" | wc -l)

if [ "$workspace_violations" -gt 0 ]; then
  echo "❌ VIOLATION: Found $workspace_violations services with unverified workspaceId"
  VIOLATIONS=$((VIOLATIONS + workspace_violations))
fi

# Scanner 3: Role parameter trust (should only come from envelope)
echo ""
echo "Scanning for direct role parameter trust..."
role_violations=$(find src/services -name "*.ts" -exec grep -l "role:" {} \; | \
  xargs grep -L "context.capability\|envelope" | \
  xargs grep -c "role:" | grep -v ":0" | wc -l)

if [ "$role_violations" -gt 0 ]; then
  echo "❌ VIOLATION: Found $role_violations services with direct role parameter"
  VIOLATIONS=$((VIOLATIONS + role_violations))
fi

echo ""
echo "=== DIRECT TRUST SCANNER RESULT ==="
echo "Total violations: $VIOLATIONS"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ FAILED: $VIOLATIONS direct trust violations detected"
  exit 1
else
  echo "✅ PASSED: No unverified direct parameter trust found"
  exit 0
fi
