#!/bin/bash

# R17 PHASE A Scanner: Service Mutation Envelope Coverage
# Detects service mutations missing ServiceCapabilityContext validation

echo "=== SERVICE MUTATION ENVELOPE SCANNER ==="

VIOLATIONS=0

# Find all service mutation functions
echo "Scanning for unprotected mutations..."

find src/services -name "*.ts" -type f | while read file; do
  # Check if file contains mutation patterns
  if grep -q "export.*function.*\(create\|update\|delete\|transition\|approve\|reject\|block\|close\|add\|remove\)" "$file"; then

    # Get all exported mutation functions from this file
    grep -n "^export.*function.*\(create\|update\|delete\|transition\|approve\|reject\|block\|close\|add\|remove\)" "$file" | while read line; do
      line_num=$(echo "$line" | cut -d: -f1)
      func_sig=$(echo "$line" | cut -d: -f2-)

      # Extract function name
      func_name=$(echo "$func_sig" | grep -oE '\b\w+\(' | head -1 | tr -d '(')

      # Check if function uses ServiceCapabilityContext
      # Search in the function body (next 50 lines)
      if ! sed -n "${line_num},$((line_num+50))p" "$file" | grep -q "ServiceCapabilityContext\|requireCapabilityEnvelope"; then
        # Exclude read-only functions
        if ! echo "$func_name" | grep -qE "^(get|fetch|list|find|check|can|has|calculate|compute|read|view)"; then
          echo "❌ VIOLATION: $file:$line_num - $func_name missing ServiceCapabilityContext"
          VIOLATIONS=$((VIOLATIONS + 1))
        fi
      fi
    done
  fi
done

echo ""
echo "=== SERVICE MUTATION SCANNER RESULT ==="
echo "Total violations: $VIOLATIONS"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ FAILED: $VIOLATIONS mutation functions lack envelope validation"
  exit 1
else
  echo "✅ PASSED: All mutation services properly protected"
  exit 0
fi
