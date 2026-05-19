#!/bin/bash

# R17 PHASE A Scanner: Audit Coverage Verification
# Detects mutations missing audit event emission with required fields

echo "=== AUDIT COVERAGE SCANNER ==="

VIOLATIONS=0

# Find all mutation functions
echo "Scanning for mutation functions without audit events..."

find src/services -name "*.ts" -type f | while read file; do
  # Check if file contains critical mutations (create, delete, approve, reject, close)
  if grep -q "export.*function.*\(createDecision\|approveDecision\|rejectDecision\|closeDecision\|setSubscriptionTier\|recordBillingEvent\)" "$file"; then

    # Check if function has audit emission
    if ! grep -q "emitAuditEvent\|logAuditEvent" "$file"; then
      echo "❌ VIOLATION: $file - Critical mutation without audit event"
      VIOLATIONS=$((VIOLATIONS + 1))
    fi
  fi
done

# Scanner 2: Audit events missing required fields
echo ""
echo "Scanning audit events for required fields..."

audit_missing_actor=$(grep -r "emitAuditEvent\|logAuditEvent" src/services --include="*.ts" -A 10 | \
  grep -v "actorId\|actor:" | grep "emitAuditEvent\|logAuditEvent" | wc -l)

if [ "$audit_missing_actor" -gt 0 ]; then
  echo "⚠️  WARNING: Some audit events may be missing actor field"
fi

audit_missing_workspace=$(grep -r "emitAuditEvent\|logAuditEvent" src/services --include="*.ts" -A 10 | \
  grep -v "workspaceId\|workspace:" | grep "emitAuditEvent\|logAuditEvent" | wc -l)

if [ "$audit_missing_workspace" -gt 0 ]; then
  echo "⚠️  WARNING: Some audit events may be missing workspace field"
fi

echo ""
echo "=== AUDIT COVERAGE SCANNER RESULT ==="
echo "Total violations: $VIOLATIONS"

if [ "$VIOLATIONS" -gt 0 ]; then
  echo "❌ FAILED: $VIOLATIONS mutations lack proper audit coverage"
  exit 1
else
  echo "✅ PASSED: All critical mutations have audit coverage"
  exit 0
fi
