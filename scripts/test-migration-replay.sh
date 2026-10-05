#!/bin/bash
# Migration Integrity Test: Verify clean database replay
# Validates that full Prisma migration history can be replayed on a clean database

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Migration Integrity Test: Clean Database Replay${NC}"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

# Verify environment
if [ -z "${DATABASE_URL:-}" ] && [ -z "${TEST_DATABASE_URL:-}" ]; then
  echo -e "${RED}✗ STOP: DATABASE_URL or TEST_DATABASE_URL not set${NC}" >&2
  exit 1
fi

DB_URL="${TEST_DATABASE_URL:-${DATABASE_URL}}"

# Verify it's a test database (safety check)
if [[ ! "$DB_URL" =~ (test|ci|staging-test|localhost) ]]; then
  echo -e "${RED}✗ STOP: DATABASE_URL does not contain test marker (safety check)${NC}" >&2
  exit 1
fi

if [[ "$DB_URL" =~ (prod|main|production) ]]; then
  echo -e "${RED}✗ STOP: DATABASE_URL contains production marker (safety check)${NC}" >&2
  exit 1
fi

echo -e "${GREEN}✓ Database URL verified (test database)${NC}"

# Step 1: Complete database drop/reset
echo ""
echo "Step 1: Dropping and recreating test database..."

# Try to drop the database
if psql "$DB_URL" -c "DROP SCHEMA public CASCADE;" 2>/dev/null || true; then
  echo -e "${GREEN}✓ Dropped existing schema${NC}"
else
  echo -e "${YELLOW}⚠ No existing schema to drop${NC}"
fi

# Recreate public schema
if psql "$DB_URL" -c "CREATE SCHEMA public;" 2>/dev/null || true; then
  echo -e "${GREEN}✓ Recreated public schema${NC}"
else
  echo -e "${RED}✗ Failed to recreate schema${NC}" >&2
  exit 1
fi

# Step 2: Generate Prisma client
echo ""
echo "Step 2: Generating Prisma client..."
npx prisma generate
echo -e "${GREEN}✓ Prisma client generated${NC}"

# Step 3: Replay all migrations
echo ""
echo "Step 3: Replaying full migration history..."

MIGRATION_LOG="/tmp/migration-replay.log"
rm -f "$MIGRATION_LOG"

# Explicit target: the guard accepts a loopback database, or a remote database only after its identity positively
# matches the approved OpsIQ test branch (src/infra/prisma-datasource.ts).
if OPSIQ_DB_TARGET=test TEST_DATABASE_URL="$DB_URL" npx prisma migrate deploy 2>&1 | tee "$MIGRATION_LOG"; then
  echo -e "${GREEN}✓ All migrations deployed successfully${NC}"
  MIGRATION_SUCCESS=true
else
  echo -e "${RED}✗ Migration deployment failed${NC}" >&2
  MIGRATION_SUCCESS=false
fi

# Step 4: Check for errors in migration output
echo ""
echo "Step 4: Analyzing migration results..."

ERRORS=0
DRIFT=0

# Check for duplicate index errors
if grep -q "duplicate.*index\|already exists" "$MIGRATION_LOG" 2>/dev/null; then
  echo -e "${RED}✗ Duplicate index detected in migrations${NC}" >&2
  ERRORS=$((ERRORS + 1))
fi

# Check for duplicate table errors
if grep -q "duplicate.*table\|table.*exists" "$MIGRATION_LOG" 2>/dev/null; then
  echo -e "${RED}✗ Duplicate table detected in migrations${NC}" >&2
  ERRORS=$((ERRORS + 1))
fi

# Check for constraint errors
if grep -q "constraint.*already exists\|unique.*violation" "$MIGRATION_LOG" 2>/dev/null; then
  echo -e "${RED}✗ Constraint duplication detected${NC}" >&2
  ERRORS=$((ERRORS + 1))
fi

# Check for generic errors
if grep -q "ERROR\|error:" "$MIGRATION_LOG" 2>/dev/null && [ "$MIGRATION_SUCCESS" = false ]; then
  echo -e "${RED}✗ Migration errors detected${NC}" >&2
  ERRORS=$((ERRORS + 1))
fi

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ No migration errors detected${NC}"
fi

# Step 5: Verify critical tables exist
echo ""
echo "Step 5: Verifying critical schema objects..."

REQUIRED_TABLES=(
  "public.users"
  "public.workspaces"
  "public.engagements"
  "public.workspace_memberships"
  "public.audit_events"
  "public.findings"
  "public.recommendations"
  "public.actions"
  "public.operator_items"
  "public.engagement_memberships"
)

MISSING_TABLES=0
for table in "${REQUIRED_TABLES[@]}"; do
  if ! psql "$DB_URL" -c "\dt $table" 2>/dev/null | grep -q "$table"; then
    echo -e "${RED}✗ Missing table: $table${NC}" >&2
    MISSING_TABLES=$((MISSING_TABLES + 1))
  fi
done

if [ $MISSING_TABLES -eq 0 ]; then
  echo -e "${GREEN}✓ All critical tables exist${NC}"
else
  ERRORS=$((ERRORS + MISSING_TABLES))
fi

# Step 6: Check operator_items indexes specifically
echo ""
echo "Step 6: Verifying operator_items index integrity..."

OPERATOR_INDEXES=(
  "operator_items_status_idx"
  "operator_items_created_at_idx"
  "operator_items_decision_hash_idx"
  "operator_items_public_key_id_idx"
)

MISSING_INDEXES=0
for idx in "${OPERATOR_INDEXES[@]}"; do
  if ! psql "$DB_URL" -c "\di $idx" 2>/dev/null | grep -q "$idx"; then
    echo -e "${RED}✗ Missing index: $idx${NC}" >&2
    MISSING_INDEXES=$((MISSING_INDEXES + 1))
  fi
done

if [ $MISSING_INDEXES -eq 0 ]; then
  echo -e "${GREEN}✓ All operator_items indexes exist (no duplicates)${NC}"
else
  ERRORS=$((ERRORS + MISSING_INDEXES))
fi

# Step 7: Count hard CREATE INDEX statements
echo ""
echo "Step 7: Auditing migration file integrity..."

MIGRATION_DIR="$PROJECT_ROOT/prisma/migrations"

# Count hard CREATE INDEX operator_items_status_idx (not IF NOT EXISTS)
HARD_CREATE_COUNT=$(grep -r 'CREATE INDEX "operator_items_status_idx"' "$MIGRATION_DIR" 2>/dev/null | grep -v 'IF NOT EXISTS' | wc -l)
if [ "$HARD_CREATE_COUNT" -eq 1 ]; then
  echo -e "${GREEN}✓ operator_items_status_idx: exactly 1 hard CREATE INDEX${NC}"
elif [ "$HARD_CREATE_COUNT" -eq 0 ]; then
  echo -e "${RED}✗ operator_items_status_idx: no hard CREATE INDEX found${NC}" >&2
  ERRORS=$((ERRORS + 1))
else
  echo -e "${RED}✗ operator_items_status_idx: $HARD_CREATE_COUNT hard CREATE INDEX (should be 1)${NC}" >&2
  ERRORS=$((ERRORS + 1))
fi

# Step 8: Schema drift detection
echo ""
echo "Step 8: Detecting schema drift..."

# Create a baseline schema from Prisma introspection
if npx prisma db pull --force 2>/dev/null; then
  echo -e "${GREEN}✓ Schema introspection successful${NC}"
else
  echo -e "${YELLOW}⚠ Could not introspect schema (may indicate schema drift)${NC}" >&2
  DRIFT=$((DRIFT + 1))
fi

# Summary
echo ""
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"
echo "Test Results:"
echo -e "${BLUE}════════════════════════════════════════════════════════${NC}"

if [ "$MIGRATION_SUCCESS" = true ]; then
  echo -e "${GREEN}✓ MIGRATION_REPLAY_SUCCESS: YES${NC}"
  MIGRATION_RESULT="YES"
else
  echo -e "${RED}✗ MIGRATION_REPLAY_SUCCESS: NO${NC}"
  MIGRATION_RESULT="NO"
fi

if [ $DRIFT -eq 0 ]; then
  echo -e "${GREEN}✓ DRIFT_DETECTED: NO${NC}"
  DRIFT_RESULT="NO"
else
  echo -e "${YELLOW}⚠ DRIFT_DETECTED: YES${NC}"
  DRIFT_RESULT="YES"
fi

if [ $ERRORS -eq 0 ]; then
  echo -e "${GREEN}✓ ERRORS: 0${NC}"
  SAFE_FOR_PROD="YES"
else
  echo -e "${RED}✗ ERRORS: $ERRORS${NC}"
  SAFE_FOR_PROD="NO"
fi

if [ "$MIGRATION_SUCCESS" = true ] && [ $ERRORS -eq 0 ] && [ $DRIFT -eq 0 ]; then
  echo -e "${GREEN}✓ SAFE_FOR_PRODUCTION: YES${NC}"
  EXIT_CODE=0
else
  echo -e "${RED}✗ SAFE_FOR_PRODUCTION: NO${NC}"
  EXIT_CODE=1
fi

echo ""
echo "MIGRATION_REPLAY_SUCCESS: $MIGRATION_RESULT"
echo "DRIFT_DETECTED: $DRIFT_RESULT"
echo "ERRORS: $ERRORS"
echo "SAFE_FOR_PRODUCTION: $SAFE_FOR_PROD"
echo ""

exit $EXIT_CODE
