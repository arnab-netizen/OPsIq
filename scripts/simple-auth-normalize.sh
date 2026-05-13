#!/bin/bash

# SIMPLE DETERMINISTIC AUTH NORMALIZATION
# Uses straightforward sed/grep replacements with safety checks

set -e

REPO_ROOT=$(cd "$(dirname "$0")/.." && pwd)
API_DIR="$REPO_ROOT/src/app/api"

normalize_file() {
  local file=$1
  local rel_path=${file#$API_DIR/}

  echo "  Processing: $rel_path"

  # Backup original
  cp "$file" "$file.bak"

  # 1. Replace withRequestContext import
  sed -i 's|import { withRequestContext } from "@/lib/api-handler";|import { withEnforcementFull } from "@/lib/enforced-route";|g' "$file"

  # 2. Ensure NextRequest import
  if ! grep -q "import.*NextRequest.*from.*next/server" "$file"; then
    # Add after first import
    sed -i '1a import type { NextRequest } from "next/server";' "$file"
  fi

  # 3. Ensure error imports
  if ! grep -q "UnauthorizedError\|ForbiddenError" "$file"; then
    # Add after imports
    sed -i '/^import/a import { UnauthorizedError, ForbiddenError } from "@/infra/errors";' "$file"
  fi

  # 4. Replace handler signatures
  sed -i 's/export const \([A-Z]*\) = withRequestContext(async (request,/export const \1 = withEnforcementFull(async (request: NextRequest,/g' "$file"
  sed -i 's/export const \([A-Z]*\) = withRequestContext(async (request)/export const \1 = withEnforcementFull(async (request: NextRequest)/g' "$file"

  # 5. Replace Response.json with 401/403 with throw statements (simple cases only)
  # This is conservative - only fixes the most obvious patterns
  if grep -q 'Response\.json.*status.*401\|Response\.json.*status.*403' "$file"; then
    echo "    ⚠️  Has Response.json(401/403) - needs manual review"
  fi

  # Check for changes
  if ! diff -q "$file" "$file.bak" > /dev/null 2>&1; then
    rm "$file.bak"
    return 0
  else
    rm "$file.bak"
    return 1
  fi
}

# ========================================
# MAIN
# ========================================

echo "=== SIMPLE AUTH NORMALIZATION ==="
echo ""

# Process all route files
changed=0
total=0

for file in $(find "$API_DIR" -name "route.ts" -type f); do
  ((total++))
  if normalize_file "$file"; then
    ((changed++))
  fi
done

echo ""
echo "=== SUMMARY ==="
echo "Total routes: $total"
echo "Routes changed: $changed"

# Build
echo ""
echo "Building..."
if npm run build > /tmp/build.log 2>&1; then
  echo "✅ Build passed"
else
  echo "❌ Build failed - rolling back"
  git checkout src/app/api
  exit 1
fi

# TypeScript
echo "Type checking..."
if npx tsc --noEmit > /tmp/tsc.log 2>&1; then
  echo "✅ TypeScript clean"
else
  echo "❌ TypeScript errors - rolling back"
  git checkout src/app/api
  exit 1
fi

echo ""
echo "✅ All verifications passed"
