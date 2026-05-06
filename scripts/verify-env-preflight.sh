#!/bin/bash
set -euo pipefail

# Phase 0 Environment Preflight Check
# This script verifies that required environment variables are configured
# WITHOUT printing their values (to avoid exposing secrets in logs)

CONTEXT="${CI:-local}"
EXIT_CODE=0

echo "=== Phase 0 Environment Preflight Check ==="
echo "Context: $CONTEXT"
echo ""

# Check DATABASE_URL for CI, or local configuration
if [ "$CONTEXT" = "true" ]; then
  # CI environment - requires DATABASE_URL_TEST secret
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "❌ DATABASE_URL_TEST: NOT SET (CI_TEST_ENV_BLOCKED)"
    echo "   Action: Configure DATABASE_URL_TEST secret in GitHub repository settings"
    echo "   Environment: test"
    echo "   Pattern: Must contain 'test', 'ci', 'staging', or 'ephemeral'"
    EXIT_CODE=1
  else
    echo "✓ DATABASE_URL_TEST: SET (CI environment detected)"
  fi
else
  # Local environment - DATABASE_URL optional
  if [ -z "${DATABASE_URL:-}" ]; then
    echo "⚠ DATABASE_URL: NOT SET (LOCAL_ENV_NOT_CONFIGURED)"
    echo "   Action: Set DATABASE_URL environment variable locally"
    echo "   Example: export DATABASE_URL='postgresql://user:password@localhost:5432/opsiq_test'"
    echo "   Or copy .env.example to .env and fill in DATABASE_URL"
    echo ""
    echo "Phase 0 can continue without DATABASE_URL locally (tests will be skipped),"
    echo "but CI verification requires DATABASE_URL_TEST to be set via secrets."
    EXIT_CODE=0
  else
    echo "✓ DATABASE_URL: SET (local environment)"
  fi
fi

echo ""
echo "=== Preflight Check Complete ==="

if [ $EXIT_CODE -ne 0 ]; then
  echo "Status: BLOCKED (See errors above)"
  exit 1
else
  echo "Status: PASSED"
  exit 0
fi
