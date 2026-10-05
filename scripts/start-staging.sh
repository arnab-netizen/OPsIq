#!/bin/bash

# R2 Staging Environment - One-Command Start Script
#
# Usage:
#   ./scripts/start-staging.sh [OPTIONS]
#
# Options:
#   --reset        Reset database before starting
#   --reseed       Reset and reseed database
#   --fresh        Full reset (compose down + restart)
#   --logs         Follow logs after startup
#   --detach       Run in background

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
cd "$PROJECT_ROOT"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Configuration
COMPOSE_FILE="docker-compose.staging.yml"
ENV_FILE=".env.staging"
DOCKER_COMPOSE_CMD="docker-compose -f $COMPOSE_FILE"
FOLLOW_LOGS=false
DETACH=false

# Parse arguments
RESET_DB=false
RESEED_DB=false
FRESH_START=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --reset)
      RESET_DB=true
      shift
      ;;
    --reseed)
      RESET_DB=true
      RESEED_DB=true
      shift
      ;;
    --fresh)
      FRESH_START=true
      shift
      ;;
    --logs)
      FOLLOW_LOGS=true
      shift
      ;;
    --detach)
      DETACH=true
      shift
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

# Functions
log() {
  echo -e "${GREEN}[STAGING]${NC} $1"
}

error() {
  echo -e "${RED}[ERROR]${NC} $1"
  exit 1
}

warn() {
  echo -e "${YELLOW}[WARN]${NC} $1"
}

# Main

log "OpsIQ Staging Environment"
log "========================="
log ""

# Check prerequisites
if ! command -v docker-compose &> /dev/null; then
  error "docker-compose not found. Please install Docker Compose."
fi

if ! command -v docker &> /dev/null; then
  error "docker not found. Please install Docker."
fi

# Check env file
if [ ! -f "$ENV_FILE" ]; then
  log "Creating $ENV_FILE from example..."
  cp "${ENV_FILE}.example" "$ENV_FILE"
  warn "⚠️ Edit $ENV_FILE with your configuration"
fi

# Fresh start (optional)
if [ "$FRESH_START" = true ]; then
  log "Performing fresh start (compose down)..."
  $DOCKER_COMPOSE_CMD down -v
  log "✓ Cleaned up"
fi

# Start services
log "Starting Docker Compose services..."
if [ "$DETACH" = true ]; then
  $DOCKER_COMPOSE_CMD up -d
else
  $DOCKER_COMPOSE_CMD up &
  COMPOSE_PID=$!
fi

log "Waiting for services to be healthy..."
sleep 10

# Check database health
log "Verifying database connectivity..."
if ! $DOCKER_COMPOSE_CMD exec -T postgres pg_isready -U postgres &> /dev/null; then
  error "Database failed to start. Check logs with: docker-compose -f $COMPOSE_FILE logs postgres"
fi
log "✓ Database healthy"

# Run migrations
log "Running database migrations..."
# The compose database is local; name that explicitly (single-label compose service host "postgres").
PRISMA_LOCAL_ENV="-e OPSIQ_DB_TARGET=local -e OPSIQ_LOCAL_DB_EXTRA_HOSTS=postgres"
$DOCKER_COMPOSE_CMD exec -T $PRISMA_LOCAL_ENV app npx prisma migrate deploy || {
  warn "Migrations may have failed. Attempting fresh deploy..."
  $DOCKER_COMPOSE_CMD exec -T $PRISMA_LOCAL_ENV app npx prisma db push
}
log "✓ Migrations complete"

# Reset database (optional)
if [ "$RESET_DB" = true ]; then
  log "Resetting database..."
  if [ "$RESEED_DB" = true ]; then
    $DOCKER_COMPOSE_CMD exec -T $PRISMA_LOCAL_ENV app npx ts-node scripts/reset-staging.ts --reseed
    log "✓ Database reset and seeded"
  else
    $DOCKER_COMPOSE_CMD exec -T $PRISMA_LOCAL_ENV app npx ts-node scripts/reset-staging.ts
    log "✓ Database reset"
  fi
fi

# Seed database (default)
if [ "$RESET_DB" = false ]; then
  log "Seeding database with test data..."
  $DOCKER_COMPOSE_CMD exec -T app npx ts-node scripts/seed-staging.ts || {
    warn "Seeding had issues. Check if data already exists."
  }
fi

log "✓ Staging environment ready!"
log ""
log "Access the application:"
log "  Web: http://localhost:3001"
log "  API: http://localhost:3001/api"
log ""
log "Test credentials (from seed):"
log "  User 1: test1@staging.local"
log "  User 2: test2@staging.local"
log "  User 3: test3@staging.local"
log ""
log "Database:"
log "  Host: localhost:5433"
log "  User: postgres"
log "  Password: postgres"
log "  Database: opsiq_staging"
log ""

if [ "$FOLLOW_LOGS" = true ]; then
  log "Following logs (Ctrl+C to stop)..."
  $DOCKER_COMPOSE_CMD logs -f
fi

# Keep script running if in detach mode
if [ "$DETACH" = true ]; then
  log "Running in detached mode."
  log "View logs with: docker-compose -f $COMPOSE_FILE logs -f"
  log "Stop with: docker-compose -f $COMPOSE_FILE down"
fi
