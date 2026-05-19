#!/bin/bash

# R17 PHASE A+B: Master Scanner Runner
# Runs all regression prevention scanners and CI gate checks

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR/../.."

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  R17 REGRESSION PREVENTION SCANNER SUITE                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

TOTAL_VIOLATIONS=0

# Run all scanners
for scanner in "$SCRIPT_DIR"/01-*.sh "$SCRIPT_DIR"/02-*.sh "$SCRIPT_DIR"/03-*.sh "$SCRIPT_DIR"/04-*.sh; do
  if [ -f "$scanner" ]; then
    echo "Running: $(basename $scanner)"
    if bash "$scanner"; then
      echo "✅ $(basename $scanner) PASSED"
    else
      echo "❌ $(basename $scanner) FAILED"
      TOTAL_VIOLATIONS=$((TOTAL_VIOLATIONS + 1))
    fi
    echo ""
  fi
done

echo "╔════════════════════════════════════════════════════════════╗"
echo "║  SCANNER RESULTS                                           ║"
echo "╚════════════════════════════════════════════════════════════╝"

if [ "$TOTAL_VIOLATIONS" -eq 0 ]; then
  echo "✅ ALL SCANNERS PASSED"
  echo ""
  echo "Security gates: OPEN"
  echo "Build status: READY FOR DEPLOYMENT"
  exit 0
else
  echo "❌ SCANNER FAILURES: $TOTAL_VIOLATIONS"
  echo ""
  echo "Security gates: CLOSED"
  echo "Build status: FAILED - Fix violations before deploying"
  exit 1
fi
