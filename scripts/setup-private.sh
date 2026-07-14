#!/usr/bin/env bash
# Private deployment setup script.
# Runs all prerequisite steps for a clean private-mode deployment.
# Does NOT print DATABASE_URL or any secret values.
# Exits non-zero on any step failure.

set -euo pipefail

# ---------------------------------------------------------------------------
# Required env var checks (exits 1 if any are absent)
# ---------------------------------------------------------------------------
: "${DATABASE_URL:?DATABASE_URL is required}"
: "${PRIVATE_OWNER_EMAIL:?PRIVATE_OWNER_EMAIL is required}"
: "${PRIVATE_OWNER_PASSWORD:?PRIVATE_OWNER_PASSWORD is required}"
: "${OPSIQ_PRIVATE_OWNER_USER_ID:?OPSIQ_PRIVATE_OWNER_USER_ID is required}"
: "${OPSIQ_PRIVATE_WORKSPACE_ID:?OPSIQ_PRIVATE_WORKSPACE_ID is required}"

# ---------------------------------------------------------------------------
# Node.js version check (>= 22)
# ---------------------------------------------------------------------------
node_version=$(node --version | sed 's/v//' | cut -d. -f1)
if [[ "$node_version" -lt 22 ]]; then
  echo "ERROR: Node.js >= 22 required (got $(node --version))"
  exit 1
fi
echo "✓ Node.js version: $(node --version)"

# ---------------------------------------------------------------------------
# Install dependencies
# ---------------------------------------------------------------------------
echo ""
echo "==> npm ci"
npm ci

# ---------------------------------------------------------------------------
# Validate and apply database migrations
# ---------------------------------------------------------------------------
echo ""
echo "==> npx prisma validate"
npx prisma validate

echo ""
echo "==> npx prisma migrate status"
npx prisma migrate status || true  # Non-zero exit on pending migrations is informational

echo ""
echo "==> npx prisma migrate deploy"
npx prisma migrate deploy

echo ""
echo "==> npx prisma generate"
npx prisma generate

# ---------------------------------------------------------------------------
# Build
# ---------------------------------------------------------------------------
echo ""
echo "==> npm run build"
npm run build

# ---------------------------------------------------------------------------
# Seed private owner
# ---------------------------------------------------------------------------
echo ""
echo "==> scripts/seed-private-owner.ts (SEED_CONFIRM=true)"
SEED_CONFIRM=true npx tsx scripts/seed-private-owner.ts

echo ""
echo "=== Private deployment setup complete ==="
echo ""
echo "Ensure these env vars are set in your runtime environment:"
echo "  OPSIQ_PRIVATE_WORKSPACE_ID=<value set above>"
echo "  OPSIQ_PRIVATE_OWNER_USER_ID=<value set above>"
echo ""
echo "Start the server with: npm run start  (or npm run dev for development)"
