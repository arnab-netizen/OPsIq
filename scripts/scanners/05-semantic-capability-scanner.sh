#!/bin/bash

# R18 PHASE C+D: Semantic Scanner - Capability-Operation Matching
# Verifies that operations are protected by correct capabilities

echo "=== SEMANTIC CAPABILITY SCANNER ==="
echo ""

VIOLATIONS=0

# Load workflow capabilities
WORKFLOWS_FILE="/home/user/OPsIq/workflow-capabilities.json"

if [ ! -f "$WORKFLOWS_FILE" ]; then
  echo "❌ Workflow capabilities file not found"
  exit 1
fi

# Extract all capability requirements from workflows
jq '.workflows[].steps[] | "\(.operation)=\(.capability)"' "$WORKFLOWS_FILE" -r | while read mapping; do
  operation=$(echo "$mapping" | cut -d= -f1)
  required_capability=$(echo "$mapping" | cut -d= -f2)

  echo "Checking operation: $operation (requires: $required_capability)"

  # Find the service function
  service_file=$(find src/services -name "*.ts" -exec grep -l "export.*function.*$operation" {} \;)

  if [ -z "$service_file" ]; then
    echo "  ⚠️  Operation not found in services"
    continue
  fi

  # Check if service uses ServiceCapabilityContext
  if grep -q "ServiceCapabilityContext" "$service_file"; then
    echo "  ✅ Has ServiceCapabilityContext"
  else
    echo "  ❌ Missing ServiceCapabilityContext"
    VIOLATIONS=$((VIOLATIONS + 1))
  fi

  # Check if it validates the capability envelope
  if grep -q "requireCapabilityEnvelope" "$service_file"; then
    echo "  ✅ Validates envelope"
  else
    echo "  ⚠️  May not validate envelope"
  fi

  # Find corresponding route
  route_pattern="${operation//_/-}"
  route_file=$(find src/app/api -name "route.ts" -exec grep -l "$operation" {} \;)

  if [ -n "$route_file" ]; then
    # Check if route requires the correct capability
    if grep -q "requireCapabilities.*$required_capability" "$route_file"; then
      echo "  ✅ Route requires: $required_capability"
    else
      echo "  ❌ Route missing capability requirement: $required_capability"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi

  echo ""
done

echo "=== SEMANTIC SCANNER RESULT ==="
echo "Total violations: $VIOLATIONS"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ FAILED: $VIOLATIONS semantic mismatches detected"
  exit 1
else
  echo "✅ PASSED: All operations correctly protected"
  exit 0
fi
