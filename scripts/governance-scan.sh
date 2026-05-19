#!/bin/bash

# Governance Compliance Scanner (Bash version)
# Detects violations of operator UX governance

STRICT=${1:-""}
VIOLATIONS=0
ERRORS=0
WARNINGS=0

echo "🔍 Scanning for governance violations...\n"

# Count: Raw error.message usage
RAW_ERRORS=$(grep -r "\.message\s*[=:]" src --include="*.tsx" --include="*.ts" | grep -v "operator-error-governance\|operator-safe-errors\|classifyOperatorError\|toOperatorSafeError\|renderOperatorError" | wc -l)
echo "❌ Raw error.message usage: $RAW_ERRORS locations"

# Count: Error rendering without governance
UNSAFE_RENDERS=$(grep -r "setError(" src --include="*.tsx" | grep -v "govError\|classifyOperatorError\|toOperatorSafeError" | wc -l)
echo "❌ Unsafe error rendering: $UNSAFE_RENDERS locations"

# Count: Toast usage without governance
UNSAFE_TOAST=$(grep -r "toast\|notification" src --include="*.tsx" --include="*.ts" | grep -E "\.error|\.warning" | grep -v "governance\|governed\|safe" | wc -l)
echo "⚠️  Unsafe toast notifications: $UNSAFE_TOAST locations"

# Count: Raw metric displays (raw {confidence}, {priority}, etc)
RAW_METRICS=$(grep -rE "\{(confidence|priority|impact|urgency|complexity|completion|risk)\}" src --include="*.tsx" | grep -v "GovMetric\|metric-registry" | wc -l)
echo "❌ Raw metric displays: $RAW_METRICS locations"

# Count: GovernedEmptyState usage
GOVERNED_EMPTY=$(grep -r "GovernedEmptyState\|CompactEmptyState" src --include="*.tsx" | wc -l)
echo "✅ Governed empty states: $GOVERNED_EMPTY deployments"

# Count: Error governance usage
GOVERNED_ERRORS=$(grep -r "classifyOperatorError\|toOperatorSafeError\|renderOperatorError" src --include="*.tsx" --include="*.ts" | grep -v "operator-error-governance\|operator-safe-errors\|\.ts:" | wc -l)
echo "✅ Error governance deployments: $GOVERNED_ERRORS"

# Count: GovMetric usage
GOV_METRICS=$(grep -r "<GovMetric" src --include="*.tsx" | wc -l)
echo "✅ GovMetric deployments: $GOV_METRICS"

# Count: useOperatorMutation usage
GOV_MUTATIONS=$(grep -r "useOperatorMutation\|GovMutationButton" src --include="*.tsx" --include="*.ts" | grep -v "src/hooks/useOperatorMutation" | wc -l)
echo "✅ Mutation governance deployments: $GOV_MUTATIONS"

# Totals
TOTAL_VIOLATIONS=$((RAW_ERRORS + UNSAFE_RENDERS + UNSAFE_TOAST + RAW_METRICS))
TOTAL_GOVERNED=$((GOVERNED_ERRORS + GOV_METRICS + GOVERNED_EMPTY + GOV_MUTATIONS))

echo "\n📊 Summary:"
echo "   Total violations: $TOTAL_VIOLATIONS"
echo "   Total governed deployments: $TOTAL_GOVERNED"
echo "   Coverage: $(( TOTAL_GOVERNED * 100 / (TOTAL_VIOLATIONS + TOTAL_GOVERNED) ))%"

if [ "$STRICT" == "--strict" ] && [ "$TOTAL_VIOLATIONS" -gt 0 ]; then
  echo "\n❌ Strict mode: Build failed due to governance violations"
  exit 1
fi

exit 0
