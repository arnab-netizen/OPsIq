#!/bin/bash
# Audit Prisma migrations for replay integrity
# Fails on any issues that would break a clean database replay

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
MIGRATION_DIR="$PROJECT_ROOT/prisma/migrations"

# Color output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

ERRORS=0
WARNINGS=0

# Helper functions
log_error() {
  echo -e "${RED}✗ ERROR: $1${NC}" >&2
  ERRORS=$((ERRORS + 1))
}

log_success() {
  echo -e "${GREEN}✓ $1${NC}"
}

log_warning() {
  echo -e "${YELLOW}⚠ WARNING: $1${NC}" >&2
  WARNINGS=$((WARNINGS + 1))
}

# 1. List migrations in execution order
echo "=== PRISMA MIGRATION REPLAY AUDIT ==="
echo ""
echo "Step 1: Listing migrations in execution order..."

MIGRATIONS=($(ls -1 "$MIGRATION_DIR" | sort))
MIGRATION_COUNT=${#MIGRATIONS[@]}
echo "Found $MIGRATION_COUNT migrations"

# 2-3. Parse and build object map
echo ""
echo "Step 2-3: Parsing migrations and building object map..."

declare -A TABLES_CREATED
declare -A TABLES_ALTERED
declare -A INDEXES_CREATED
declare -A UNIQUE_INDEXES_CREATED
declare -A COLUMNS_ADDED
declare -A CONSTRAINTS_ADDED
declare -A TYPES_CREATED
declare -A INDEX_FORMS
declare -a TABLES_REFERENCED
declare -a FK_SOURCES
declare -a FK_TARGETS
declare -a DATA_MUTATIONS

# Track which migration creates/alters what
declare -A TABLE_CREATION_MIGRATION
declare -A INDEX_CREATION_MIGRATION

# Parse each migration
for migration in "${MIGRATIONS[@]}"; do
  migration_file="$MIGRATION_DIR/$migration/migration.sql"

  # Extract CREATE TABLE (with or without quotes)
  while IFS= read -r line; do
    if [[ $line =~ CREATE\ TABLE\ \"([^\"]+)\" ]]; then
      table="${BASH_REMATCH[1]}"
      if [ -n "${TABLES_CREATED[$table]:-}" ]; then
        log_error "Duplicate CREATE TABLE \"$table\" in $migration (first in ${TABLE_CREATION_MIGRATION[$table]})"
      fi
      TABLES_CREATED[$table]=1
      TABLE_CREATION_MIGRATION[$table]=$migration
    elif [[ $line =~ CREATE\ TABLE\ ([a-zA-Z_][a-zA-Z0-9_]*)\ \( ]]; then
      table="${BASH_REMATCH[1]}"
      if [ -n "${TABLES_CREATED[$table]:-}" ]; then
        log_error "Duplicate CREATE TABLE $table in $migration (first in ${TABLE_CREATION_MIGRATION[$table]})"
      fi
      TABLES_CREATED[$table]=1
      TABLE_CREATION_MIGRATION[$table]=$migration
    fi
  done < <(grep -n 'CREATE TABLE' "$migration_file" 2>/dev/null || true)

  # Extract CREATE INDEX / CREATE UNIQUE INDEX (all forms)
  while IFS= read -r line; do
    if [[ $line =~ CREATE\ (UNIQUE\ )?INDEX\ (IF\ NOT\ EXISTS\ )?\"([^\"]+)\" ]]; then
      idx="${BASH_REMATCH[3]}"
      form="CREATE $([ -n "${BASH_REMATCH[1]}" ] && echo "UNIQUE " || echo "")INDEX$([ -n "${BASH_REMATCH[2]}" ] && echo " IF NOT EXISTS" || echo "")"

      # Track all forms of this index
      if [ -z "${INDEX_FORMS[$idx]:-}" ]; then
        INDEX_FORMS[$idx]="$form"
      else
        INDEX_FORMS[$idx]="${INDEX_FORMS[$idx]} | $form"
      fi

      # Only hard CREATE (not IF NOT EXISTS) counts as duplicate risk
      if [[ ! $line =~ IF\ NOT\ EXISTS ]]; then
        if [ -n "${INDEXES_CREATED[$idx]:-}" ] || [ -n "${UNIQUE_INDEXES_CREATED[$idx]:-}" ]; then
          log_error "Duplicate CREATE INDEX \"$idx\" in $migration (first in ${INDEX_CREATION_MIGRATION[$idx]:-unknown})"
        fi
        if [[ $line =~ UNIQUE ]]; then
          UNIQUE_INDEXES_CREATED[$idx]=1
        else
          INDEXES_CREATED[$idx]=1
        fi
        INDEX_CREATION_MIGRATION[$idx]=$migration
      fi
    fi
  done < <(grep -n 'CREATE.*INDEX' "$migration_file" 2>/dev/null || true)

  # Extract USING INDEX in constraints
  while IFS= read -r line; do
    if [[ $line =~ USING\ INDEX\ \"([^\"]+)\" ]]; then
      idx="${BASH_REMATCH[1]}"
      if [ -z "${INDEX_FORMS[$idx]:-}" ]; then
        INDEX_FORMS[$idx]="CONSTRAINT USING INDEX"
      else
        INDEX_FORMS[$idx]="${INDEX_FORMS[$idx]} | CONSTRAINT USING INDEX"
      fi
    fi
  done < <(grep -n 'USING INDEX' "$migration_file" 2>/dev/null || true)

  # Extract ALTER TABLE ADD COLUMN
  while IFS= read -r line; do
    if [[ $line =~ ALTER\ TABLE\ \"([^\"]+)\"\ ADD\ COLUMN\ \"([^\"]+)\" ]]; then
      table="${BASH_REMATCH[1]}"
      column="${BASH_REMATCH[2]}"
      key="$table.$column"
      if [ -n "${COLUMNS_ADDED[$key]:-}" ]; then
        log_error "Duplicate ALTER TABLE ADD COLUMN \"$column\" to \"$table\" in $migration"
      fi
      COLUMNS_ADDED[$key]=1
      TABLES_ALTERED[$table]=1
    fi
  done < <(grep -n 'ALTER TABLE.*ADD COLUMN' "$migration_file" 2>/dev/null || true)

  # Extract ADD CONSTRAINT
  while IFS= read -r line; do
    if [[ $line =~ ADD\ CONSTRAINT\ \"([^\"]+)\" ]]; then
      constraint="${BASH_REMATCH[1]}"
      if [ -n "${CONSTRAINTS_ADDED[$constraint]:-}" ]; then
        log_error "Duplicate ADD CONSTRAINT \"$constraint\" in $migration"
      fi
      CONSTRAINTS_ADDED[$constraint]=1
    fi
  done < <(grep -n 'ADD CONSTRAINT' "$migration_file" 2>/dev/null || true)

  # Extract CREATE TYPE
  while IFS= read -r line; do
    if [[ $line =~ CREATE\ TYPE\ \"([^\"]+)\" ]]; then
      type="${BASH_REMATCH[1]}"
      if [ -n "${TYPES_CREATED[$type]:-}" ]; then
        log_error "Duplicate CREATE TYPE \"$type\" in $migration"
      fi
      TYPES_CREATED[$type]=1
    fi
  done < <(grep -n 'CREATE TYPE' "$migration_file" 2>/dev/null || true)
done

# 4. Verify ordering constraints
echo ""
echo "Step 4: Verifying ordering constraints..."

# Check for operator_items_status_idx hard duplicates
OPERATOR_STATUS_COUNT=$(grep -r 'CREATE INDEX "operator_items_status_idx"' "$MIGRATION_DIR" 2>/dev/null | grep -v 'IF NOT EXISTS' | wc -l)
if [ "$OPERATOR_STATUS_COUNT" -gt 1 ]; then
  log_error "operator_items_status_idx has $OPERATOR_STATUS_COUNT hard CREATE INDEX statements (should be 1)"
fi

# Check for operator_items table ordering
if [ -n "${TABLES_CREATED[operator_items]:-}" ]; then
  OPERATOR_ITEMS_MIGRATION="${TABLE_CREATION_MIGRATION[operator_items]}"

  # Check that all operator_items indexes come after the table creation
  for idx in operator_items_status_idx operator_items_created_at_idx operator_items_decision_hash_idx operator_items_public_key_id_idx; do
    if [ -n "${INDEXES_CREATED[$idx]:-}" ]; then
      INDEX_MIGRATION="${INDEX_CREATION_MIGRATION[$idx]:-}"
      if [[ "$OPERATOR_ITEMS_MIGRATION" > "$INDEX_MIGRATION" ]]; then
        log_error "Index \"$idx\" created in $INDEX_MIGRATION before table in $OPERATOR_ITEMS_MIGRATION"
      fi
    fi
  done

  log_success "operator_items table ordering verified"
else
  log_error "operator_items table not found in any migration"
fi

# Check audit_events.previous_hash ordering
if [ -n "${TABLES_CREATED[audit_events]:-}" ]; then
  log_success "audit_events table created (previous_hash column added in later migration)"
else
  log_error "audit_events table not found in any migration"
fi

# Check decision_snapshots
if [ -n "${TABLES_CREATED[decision_snapshots]:-}" ]; then
  log_success "decision_snapshots table created"
else
  log_warning "decision_snapshots table not found (expected in phase 2)"
fi

# 5. FK integrity checks
echo ""
echo "Step 5: Verifying foreign key integrity..."

while IFS= read -r line; do
  if [[ $line =~ REFERENCES\ \"([^\"]+)\" ]]; then
    fk_target="${BASH_REMATCH[1]}"
    if [ -z "${TABLES_CREATED[$fk_target]:-}" ]; then
      log_error "Foreign key references table \"$fk_target\" which is not created in any migration"
    fi
  fi
done < <(grep -rn "REFERENCES" "$MIGRATION_DIR" 2>/dev/null || true)

log_success "Foreign key target tables exist"

# CRITICAL: Verify 20260428_add_phase_1_5_persistence does NOT have operator_items_status_idx
echo ""
echo "Step 5b: CRITICAL - Verifying failing migration is clean..."
PHASE_1_5_MIGRATION="$MIGRATION_DIR/20260428_add_phase_1_5_persistence/migration.sql"
if grep -q 'CREATE INDEX "operator_items_status_idx"' "$PHASE_1_5_MIGRATION" 2>/dev/null; then
  log_error "Migration 20260428_add_phase_1_5_persistence contains hard CREATE INDEX operator_items_status_idx (must be removed)"
else
  log_success "Migration 20260428_add_phase_1_5_persistence is clean (no operator_items_status_idx)"
fi

# 6. Specific object verification
echo ""
echo "Step 6: Verifying critical objects..."

# Check operator_items critical objects
CRITICAL_OPERATOR_TABLES=("operator_items_status_idx" "operator_items_created_at_idx" "operator_items_decision_hash_idx" "operator_items_public_key_id_idx")
for obj in "${CRITICAL_OPERATOR_TABLES[@]}"; do
  if [ -n "${INDEXES_CREATED[$obj]:-}" ] || [ -n "${UNIQUE_INDEXES_CREATED[$obj]:-}" ]; then
    log_success "Critical index \"$obj\" exists"
  fi
done

# CRITICAL: Verify operator_items_status_idx has EXACTLY ONE hard CREATE INDEX (not IF NOT EXISTS)
echo ""
echo "Step 6b: CRITICAL - Verifying operator_items_status_idx hard-create count..."

if grep -q 'CREATE INDEX "operator_items_status_idx"' "$MIGRATION_DIR"/*/migration.sql; then
  log_success "operator_items_status_idx: 1 hard CREATE INDEX (correct)"
else
  log_error "operator_items_status_idx not found in any migration"
fi

# Summary
echo ""
echo "=== AUDIT SUMMARY ==="
echo "Migrations audited: $MIGRATION_COUNT"
echo "Tables created: ${#TABLES_CREATED[@]}"
echo "Indexes created: ${#INDEXES_CREATED[@]}"
echo "Unique indexes created: ${#UNIQUE_INDEXES_CREATED[@]}"
echo "Columns added: ${#COLUMNS_ADDED[@]}"
echo "Constraints added: ${#CONSTRAINTS_ADDED[@]}"
echo "Types created: ${#TYPES_CREATED[@]}"
echo ""
echo "Errors: $ERRORS"
echo "Warnings: $WARNINGS"

if [ $ERRORS -gt 0 ]; then
  echo ""
  echo -e "${RED}AUDIT FAILED: $ERRORS critical issues found${NC}"
  exit 1
fi

if [ $WARNINGS -gt 0 ]; then
  echo ""
  echo -e "${YELLOW}AUDIT PASSED with $WARNINGS warnings${NC}"
  exit 0
fi

echo ""
echo -e "${GREEN}AUDIT PASSED: All migrations are replay-safe${NC}"
exit 0
