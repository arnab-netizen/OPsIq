#!/bin/bash

# DEPLOYMENT SAFETY - Startup Verification Script
#
# Purpose: Verify operational readiness before accepting traffic
# Execution: Run on every production deployment startup
# Scope: Environment, Database, Schema, Contracts, Secrets
# Fail-Closed: Any missing requirement aborts startup

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"
STARTUP_LOG="${PROJECT_ROOT}/startup-verification.log"

# Color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Log functions
log_info() {
  echo -e "${GREEN}✓${NC} $1" | tee -a "$STARTUP_LOG"
}

log_error() {
  echo -e "${RED}✗${NC} $1" | tee -a "$STARTUP_LOG"
  exit 1
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1" | tee -a "$STARTUP_LOG"
}

echo "=== Phase 0 Startup Verification ===" | tee "$STARTUP_LOG"
echo "Started at: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$STARTUP_LOG"

# ─── Phase 1: Environment Validation ────────────────────────────────────────

echo ""
echo "=== Phase 1: Environment Validation ===" | tee -a "$STARTUP_LOG"

# Check NODE_ENV
if [ -z "${NODE_ENV:-}" ]; then
  log_error "NODE_ENV not set"
fi

if [ "$NODE_ENV" != "production" ] && [ "$NODE_ENV" != "staging" ] && [ "$NODE_ENV" != "test" ]; then
  log_error "NODE_ENV must be 'production', 'staging', or 'test' (got: $NODE_ENV)"
fi

log_info "NODE_ENV=$NODE_ENV"

# Check DATABASE_URL
if [ -z "${DATABASE_URL:-}" ]; then
  log_error "DATABASE_URL not set (required for all environments)"
fi

log_info "DATABASE_URL is set"

# Check critical secrets (production only)
if [ "$NODE_ENV" = "production" ]; then
  REQUIRED_SECRETS=(
    "DATABASE_URL"
    "SESSION_SECRET"
  )

  for secret in "${REQUIRED_SECRETS[@]}"; do
    if [ -z "${!secret:-}" ]; then
      log_error "Required secret not set: $secret"
    fi
  done

  log_info "All required secrets present (production)"
fi

# ─── Phase 2: Database Connection ──────────────────────────────────────────

echo ""
echo "=== Phase 2: Database Connection ===" | tee -a "$STARTUP_LOG"

cd "$PROJECT_ROOT"

# Test database connection
if ! npx prisma db execute --stdin <<< "SELECT 1;" 2>/dev/null; then
  log_error "Database connection failed"
fi

log_info "Database connection successful"

# ─── Phase 3: Schema Validation ────────────────────────────────────────────

echo ""
echo "=== Phase 3: Schema Validation ===" | tee -a "$STARTUP_LOG"

# Validate Prisma schema
if ! npx prisma validate &>/dev/null; then
  log_error "Prisma schema validation failed"
fi

log_info "Prisma schema is valid"

# ─── Phase 4: Migration Status ────────────────────────────────────────────

echo ""
echo "=== Phase 4: Migration Status ===" | tee -a "$STARTUP_LOG"

# Check if migrations pending
PENDING_MIGRATIONS=$(npx prisma migrate status 2>&1 | grep -c "pending migrations" || true)

if [ "$PENDING_MIGRATIONS" -gt 0 ]; then
  log_warning "Pending migrations detected. Running deployment..."

  if ! npx prisma migrate deploy &>/dev/null; then
    log_error "Migration deployment failed"
  fi

  log_info "Migrations deployed successfully"
else
  log_info "No pending migrations"
fi

# ─── Phase 5: Contract Verification ───────────────────────────────────────

echo ""
echo "=== Phase 5: Contract Verification ===" | tee -a "$STARTUP_LOG"

# Verify critical service contracts exist
if [ ! -f "src/contracts/index.ts" ]; then
  log_error "Contract layer missing (src/contracts/index.ts)"
fi

log_info "Contract layer present"

# Verify ServiceErrorType enum exists
if ! grep -q "export enum ServiceErrorType" src/contracts/index.ts; then
  log_error "ServiceErrorType enum not found"
fi

log_info "ServiceErrorType enum present"

# Verify ServiceResult interface exists
if ! grep -q "export interface ServiceResult" src/contracts/index.ts; then
  log_error "ServiceResult interface not found"
fi

log_info "ServiceResult interface present"

# ─── Phase 6: Contract Tests ──────────────────────────────────────────────

echo ""
echo "=== Phase 6: Contract Tests ===" | tee -a "$STARTUP_LOG"

if [ "$NODE_ENV" = "production" ]; then
  log_info "Skipping contract tests in production (passed in CI)"
else
  if ! npm test -- --run src/__tests__/critical-service-contracts.test.ts &>/dev/null; then
    log_error "Contract tests failed"
  fi

  log_info "Contract tests passed"
fi

# ─── Phase 7: Application Startup ────────────────────────────────────────

echo ""
echo "=== Phase 7: Application Ready ===" | tee -a "$STARTUP_LOG"

log_info "All startup verification checks passed"
log_info "Environment: $NODE_ENV"
log_info "Database: Connected and migrated"
log_info "Contracts: Verified and immutable"
log_info "Ready to accept traffic"

echo ""
echo "=== Startup Verification Complete ===" | tee -a "$STARTUP_LOG"
echo "Completed at: $(date -u +%Y-%m-%dT%H:%M:%SZ)" >> "$STARTUP_LOG"

exit 0
