# OpsIQ Alpha: Deployment Commands

**Purpose**: One-command alpha environment deployment and management  
**Target**: <30 minute environment setup for new operator cohort  
**Audience**: DevOps engineer, support team, team lead  
**Maintenance**: Run daily or as-needed for reset cycles

---

## COMMAND 1: Full Alpha Environment Startup

**Purpose**: Start complete alpha environment from zero state

**File**: `scripts/alpha-startup.sh`

```bash
#!/bin/bash
set -e

echo "🚀 OpsIQ ALPHA STARTUP"
echo "===================="
echo "Target: Full alpha environment in <30 minutes"
echo ""

# Step 1: Verify prerequisites (2 min)
echo "📋 [Step 1/7] Verifying prerequisites..."
command -v docker >/dev/null || { echo "❌ Docker not found"; exit 1; }
command -v psql >/dev/null || { echo "❌ psql not found"; exit 1; }
[ -f ".env.local" ] || { echo "❌ .env.local not found"; exit 1; }
echo "✓ Prerequisites OK"
echo ""

# Step 2: Start infrastructure (5 min)
echo "🐳 [Step 2/7] Starting Docker services..."
docker compose -f docker-compose.alpha.yml up -d postgres redis
echo "⏳ Waiting for services to be ready..."
sleep 10
docker exec opsiq-postgres pg_isready -U opsiq >/dev/null || { echo "❌ PostgreSQL not responding"; exit 1; }
echo "✓ Services running"
echo ""

# Step 3: Database setup (3 min)
echo "🗄️  [Step 3/7] Setting up database..."
psql -h localhost -U opsiq -d postgres -f scripts/sql/00-alpha-db-init.sql >/dev/null 2>&1 || true
psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT version();" >/dev/null
echo "✓ Database ready"
echo ""

# Step 4: Run migrations (3 min)
echo "📦 [Step 4/7] Running migrations..."
npm run db:migrate:alpha >/dev/null
npm run db:seed:alpha >/dev/null
echo "✓ Schema and base data ready"
echo ""

# Step 5: Start application (5 min)
echo "⚙️  [Step 5/7] Starting application server..."
NODE_ENV=alpha npm run dev > /tmp/alpha-server.log 2>&1 &
APP_PID=$!
sleep 5
echo "⏳ Waiting for application startup..."
TIMEOUT=30
while ! curl -s http://localhost:3001/health >/dev/null 2>&1 && [ $TIMEOUT -gt 0 ]; do
  sleep 1
  TIMEOUT=$((TIMEOUT-1))
done
if [ $TIMEOUT -eq 0 ]; then
  echo "❌ Application failed to start"
  cat /tmp/alpha-server.log
  exit 1
fi
echo "✓ Application running (PID: $APP_PID)"
echo ""

# Step 6: Seed alpha operator data (5 min)
echo "👥 [Step 6/7] Seeding operator accounts and workspaces..."
npm run db:seed:alpha:operators >/dev/null
npm run db:seed:alpha:workspaces >/dev/null
npm run db:seed:alpha:engagements >/dev/null
echo "✓ Operator environment ready"
echo ""

# Step 7: Verify alpha readiness (2 min)
echo "✅ [Step 7/7] Verifying alpha readiness..."
npm run alpha:verify >/dev/null
echo "✓ All systems operational"
echo ""

echo "✨ ALPHA ENVIRONMENT READY"
echo "=========================="
echo "URL: http://localhost:3001"
echo "Postgres: localhost:5432 (opsiq/[password])"
echo "Redis: localhost:6379"
echo ""
echo "Operator Accounts:"
echo "  - alpha-lead@internal.test (password in .env.alpha)"
echo "  - validator-1@internal.test (password in .env.alpha)"
echo "  - validator-2@internal.test (password in .env.alpha)"
echo ""
echo "Next: Open http://localhost:3001 and log in"
echo "Support: See ALPHA_SUPPORT_RUNBOOK.md"
echo ""
```

**Usage**:
```bash
chmod +x scripts/alpha-startup.sh
./scripts/alpha-startup.sh
```

**Output**: Full alpha environment ready in ~30 minutes

---

## COMMAND 2: Reset Alpha to Clean State

**Purpose**: Remove all operator history, reset to initial state (for between-cohort cycles)

**File**: `scripts/alpha-reset.sh`

```bash
#!/bin/bash
set -e

echo "🔄 OpsIQ ALPHA RESET"
echo "===================="
echo "This will reset all operator data to initial state"
echo "WARNING: This is destructive. Are you sure? (type 'yes' to confirm)"
read CONFIRM
[ "$CONFIRM" = "yes" ] || { echo "Cancelled"; exit 0; }
echo ""

echo "🛑 [Step 1/4] Stopping application..."
pkill -f "node.*alpha" || true
sleep 2
echo "✓ Application stopped"
echo ""

echo "🗑️  [Step 2/4] Dropping operator data..."
psql -h localhost -U opsiq -d opsiq-alpha << 'EOF' >/dev/null
BEGIN;
-- Delete in reverse dependency order
DELETE FROM audit_events WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true);
DELETE FROM actions WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true);
DELETE FROM engagements WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true);
DELETE FROM workspace_memberships WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true);
DELETE FROM workspaces WHERE is_alpha = true;
DELETE FROM operators WHERE email LIKE '%@internal.test';
DELETE FROM feedback_confusion WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
DELETE FROM feedback_safety WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
DELETE FROM feedback_daily WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
DELETE FROM support_tickets WHERE created_at >= CURRENT_DATE - INTERVAL '30 days';
COMMIT;
EOF
echo "✓ Operator data removed"
echo ""

echo "🌱 [Step 3/4] Reseeding initial data..."
npm run db:seed:alpha:operators >/dev/null
npm run db:seed:alpha:workspaces >/dev/null
npm run db:seed:alpha:engagements >/dev/null
npm run db:seed:alpha:initial-actions >/dev/null
echo "✓ Initial state restored"
echo ""

echo "⚙️  [Step 4/4] Restarting application..."
NODE_ENV=alpha npm run dev > /tmp/alpha-server.log 2>&1 &
sleep 5
curl -s http://localhost:3001/health >/dev/null || { echo "❌ Startup failed"; exit 1; }
echo "✓ Application running"
echo ""

echo "✨ ALPHA RESET COMPLETE"
echo "All operator data removed, initial state restored"
echo ""
```

**Usage**:
```bash
./scripts/alpha-reset.sh
```

---

## COMMAND 3: Reseed Specific Operator Data

**Purpose**: Reload a single operator's workspace without full reset

**File**: `scripts/alpha-reseed-operator.sh`

```bash
#!/bin/bash
set -e

OPERATOR_EMAIL=${1:-"alpha-lead@internal.test"}

echo "🌱 OpsIQ ALPHA RESEED OPERATOR"
echo "=============================="
echo "Operator: $OPERATOR_EMAIL"
echo ""

echo "[Step 1/3] Clearing operator data..."
psql -h localhost -U opsiq -d opsiq-alpha << EOF >/dev/null
BEGIN;
DELETE FROM audit_events WHERE workspace_id IN (
  SELECT w.id FROM workspaces w
  JOIN workspace_memberships wm ON wm.workspace_id = w.id
  JOIN operators o ON o.id = wm.operator_id
  WHERE o.email = '$OPERATOR_EMAIL'
);
DELETE FROM actions WHERE workspace_id IN (
  SELECT w.id FROM workspaces w
  JOIN workspace_memberships wm ON wm.workspace_id = w.id
  JOIN operators o ON o.id = wm.operator_id
  WHERE o.email = '$OPERATOR_EMAIL'
);
DELETE FROM engagements WHERE workspace_id IN (
  SELECT w.id FROM workspaces w
  JOIN workspace_memberships wm ON wm.workspace_id = w.id
  JOIN operators o ON o.id = wm.operator_id
  WHERE o.email = '$OPERATOR_EMAIL'
);
COMMIT;
EOF
echo "✓ Data cleared"
echo ""

echo "[Step 2/3] Reseeding engagements..."
npm run db:seed:alpha:engagements:for-operator -- --email "$OPERATOR_EMAIL" >/dev/null
echo "✓ Engagements reloaded"
echo ""

echo "[Step 3/3] Verifying operator state..."
WORKSPACE_COUNT=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT COUNT(DISTINCT w.id) FROM workspaces w
  JOIN workspace_memberships wm ON wm.workspace_id = w.id
  JOIN operators o ON o.id = wm.operator_id
  WHERE o.email = '$OPERATOR_EMAIL'
")
ACTION_COUNT=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT COUNT(*) FROM actions WHERE workspace_id IN (
    SELECT w.id FROM workspaces w
    JOIN workspace_memberships wm ON wm.workspace_id = w.id
    JOIN operators o ON o.id = wm.operator_id
    WHERE o.email = '$OPERATOR_EMAIL'
  )
")
echo "✓ $WORKSPACE_COUNT workspace(s), $ACTION_COUNT action(s)"
echo ""

echo "✨ OPERATOR RESEED COMPLETE"
echo ""
```

**Usage**:
```bash
./scripts/alpha-reseed-operator.sh alpha-lead@internal.test
```

---

## COMMAND 4: Health Verification

**Purpose**: Verify all alpha systems are operational

**File**: `scripts/alpha-verify.sh`

```bash
#!/bin/bash
set -e

echo "🏥 OpsIQ ALPHA HEALTH CHECK"
echo "==========================="
echo ""

HEALTH_OK=true

# Check 1: Application responding
echo -n "📱 Application: "
if curl -s http://localhost:3001/health >/dev/null; then
  echo "✓ OK"
else
  echo "✗ FAILED (not responding)"
  HEALTH_OK=false
fi

# Check 2: Database connectivity
echo -n "🗄️  Database: "
if psql -h localhost -U opsiq -d opsiq-alpha -c "SELECT 1" >/dev/null 2>&1; then
  echo "✓ OK"
else
  echo "✗ FAILED (no connection)"
  HEALTH_OK=false
fi

# Check 3: Redis connectivity
echo -n "⚡ Redis: "
if redis-cli -h localhost ping >/dev/null 2>&1; then
  echo "✓ OK"
else
  echo "✗ FAILED (not responding)"
  HEALTH_OK=false
fi

# Check 4: Readiness enforcement
echo -n "🔒 Readiness: "
READINESS_STATUS=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT status FROM system_readiness ORDER BY updated_at DESC LIMIT 1
")
if [ "$READINESS_STATUS" = "ready" ]; then
  echo "✓ OK"
else
  echo "✗ NOT READY (status: $READINESS_STATUS)"
  HEALTH_OK=false
fi

# Check 5: Operator accounts exist
echo -n "👥 Operators: "
OP_COUNT=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT COUNT(*) FROM operators WHERE email LIKE '%@internal.test'
")
if [ "$OP_COUNT" -ge 3 ]; then
  echo "✓ OK ($OP_COUNT accounts)"
else
  echo "✗ FAILED (only $OP_COUNT accounts)"
  HEALTH_OK=false
fi

# Check 6: Test workspace exists
echo -n "📦 Workspaces: "
WS_COUNT=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT COUNT(*) FROM workspaces WHERE is_alpha = true
")
if [ "$WS_COUNT" -ge 1 ]; then
  echo "✓ OK ($WS_COUNT workspace(s))"
else
  echo "✗ FAILED (no workspaces)"
  HEALTH_OK=false
fi

# Check 7: Test engagements exist
echo -n "📋 Engagements: "
ENG_COUNT=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT COUNT(*) FROM engagements
")
if [ "$ENG_COUNT" -ge 1 ]; then
  echo "✓ OK ($ENG_COUNT engagement(s))"
else
  echo "✗ FAILED (no engagements)"
  HEALTH_OK=false
fi

# Check 8: Audit trail initialized
echo -n "📝 Audit: "
AUDIT_COUNT=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT COUNT(*) FROM audit_events WHERE is_alpha = true
")
echo "✓ OK ($AUDIT_COUNT event(s))"

# Check 9: Logging operational
echo -n "📊 Logging: "
LOGS=$(tail -1 /tmp/alpha-server.log 2>/dev/null | grep -c "INFO\|WARN" || true)
if [ "$LOGS" -gt 0 ]; then
  echo "✓ OK"
else
  echo "⚠ (no recent logs)"
fi

# Check 10: Response time acceptable
echo -n "⏱️  Latency: "
LATENCY=$(curl -s -w "%{time_total}" -o /dev/null http://localhost:3001/health)
if (( $(echo "$LATENCY < 0.5" | bc -l) )); then
  echo "✓ OK (${LATENCY}s)"
else
  echo "⚠ SLOW (${LATENCY}s)"
fi

echo ""
echo "═════════════════════════════"
if [ "$HEALTH_OK" = true ]; then
  echo "✨ ALPHA HEALTHY - Ready for operators"
  exit 0
else
  echo "❌ ALPHA HAS ISSUES - See above"
  exit 1
fi
```

**Usage**:
```bash
./scripts/alpha-verify.sh
```

---

## COMMAND 5: Emergency Rollback

**Purpose**: Rollback alpha to last known good state (for critical failures)

**File**: `scripts/alpha-rollback.sh`

```bash
#!/bin/bash
set -e

echo "🚨 OpsIQ ALPHA EMERGENCY ROLLBACK"
echo "=================================="
echo "This will rollback to last backup state"
echo "Recent operator data will be lost"
echo ""
echo "Type the word 'ROLLBACK' to confirm:"
read CONFIRM
[ "$CONFIRM" = "ROLLBACK" ] || { echo "Cancelled"; exit 0; }
echo ""

echo "🛑 [Step 1/4] Stopping services..."
docker compose -f docker-compose.alpha.yml stop || true
pkill -f "node.*alpha" || true
sleep 3
echo "✓ Services stopped"
echo ""

echo "💾 [Step 2/4] Restoring from backup..."
# Restore from last backup
BACKUP_FILE=$(ls -t /backups/opsiq-alpha-*.sql.gz 2>/dev/null | head -1)
if [ -z "$BACKUP_FILE" ]; then
  echo "❌ No backup found in /backups/"
  exit 1
fi
echo "Using backup: $BACKUP_FILE"
gunzip < "$BACKUP_FILE" | psql -h localhost -U opsiq -d opsiq-alpha >/dev/null 2>&1 || true
sleep 2
echo "✓ Database restored"
echo ""

echo "🚀 [Step 3/4] Restarting services..."
docker compose -f docker-compose.alpha.yml up -d postgres redis
sleep 5
NODE_ENV=alpha npm run dev > /tmp/alpha-server.log 2>&1 &
sleep 5
echo "✓ Services restarted"
echo ""

echo "[Step 4/4] Verifying rollback..."
./scripts/alpha-verify.sh >/dev/null || { echo "❌ Verification failed"; exit 1; }
echo "✓ Rollback verified"
echo ""

echo "✨ ROLLBACK COMPLETE"
echo "System restored to last backup state"
echo "Run 'alpha-reset.sh' to start fresh cycle"
echo ""
```

**Usage**:
```bash
./scripts/alpha-rollback.sh
```

---

## COMMAND 6: Support Diagnostics

**Purpose**: For support team - quick diagnostics on operator issues

**File**: `scripts/alpha-support-diag.sh`

```bash
#!/bin/bash

OPERATOR_EMAIL=${1:-""}
[ -z "$OPERATOR_EMAIL" ] && { echo "Usage: $0 <operator_email>"; exit 1; }

echo "🔍 OpsIQ ALPHA SUPPORT DIAGNOSTICS"
echo "=================================="
echo "Operator: $OPERATOR_EMAIL"
echo ""

# Find operator
OPERATOR_ID=$(psql -h localhost -U opsiq -d opsiq-alpha -t -c "
  SELECT id FROM operators WHERE email = '$OPERATOR_EMAIL'
" | xargs)

if [ -z "$OPERATOR_ID" ]; then
  echo "❌ Operator not found"
  exit 1
fi

echo "Operator ID: $OPERATOR_ID"
echo ""

# Session status
echo "📱 SESSION STATUS:"
psql -h localhost -U opsiq -d opsiq-alpha << EOF
SELECT 
  id, 
  workspace_id,
  created_at,
  expires_at,
  CASE WHEN expires_at > NOW() THEN 'VALID' ELSE 'EXPIRED' END as status
FROM sessions 
WHERE operator_id = '$OPERATOR_ID'
ORDER BY created_at DESC 
LIMIT 5;
EOF
echo ""

# Recent actions
echo "📋 RECENT ACTIONS (last 10):"
psql -h localhost -U opsiq -d opsiq-alpha << EOF
SELECT 
  a.id,
  a.workspace_id,
  a.name,
  a.status,
  a.created_at,
  a.updated_at
FROM actions a
WHERE a.operator_id = '$OPERATOR_ID'
ORDER BY created_at DESC
LIMIT 10;
EOF
echo ""

# Stalled actions (>30 min in progress)
echo "⚠️  STALLED ACTIONS (in progress >30 min):"
psql -h localhost -U opsiq -d opsiq-alpha << EOF
SELECT 
  id,
  name,
  created_at,
  EXTRACT(EPOCH FROM (NOW() - created_at))/60 as minutes_stuck
FROM actions
WHERE operator_id = '$OPERATOR_ID'
AND status = 'in_progress'
AND created_at < NOW() - INTERVAL '30 minutes';
EOF
echo ""

# Support tickets
echo "🎫 SUPPORT TICKETS:"
psql -h localhost -U opsiq -d opsiq-alpha << EOF
SELECT 
  id,
  category,
  status,
  created_at,
  resolved_at,
  EXTRACT(EPOCH FROM (COALESCE(resolved_at, NOW()) - created_at))/60 as resolution_minutes
FROM support_tickets
WHERE operator_id = '$OPERATOR_ID'
ORDER BY created_at DESC
LIMIT 10;
EOF
echo ""

# Feedback
echo "💭 OPERATOR FEEDBACK:"
psql -h localhost -U opsiq -d opsiq-alpha << EOF
SELECT 
  created_at,
  CASE 
    WHEN EXISTS (SELECT 1 FROM feedback_confusion WHERE operator_id = '$OPERATOR_ID' AND feedback_confusion.created_at = fc.created_at) THEN 'CONFUSION'
    WHEN EXISTS (SELECT 1 FROM feedback_safety WHERE operator_id = '$OPERATOR_ID' AND feedback_safety.created_at = fs.created_at) THEN 'SAFETY'
  END as type,
  'Check individual tables'
FROM feedback_confusion fc, feedback_safety fs
WHERE operator_id = '$OPERATOR_ID'
ORDER BY created_at DESC
LIMIT 10;
EOF
echo ""

# Audit events
echo "📝 RECENT AUDIT EVENTS:"
psql -h localhost -U opsiq -d opsiq-alpha << EOF
SELECT 
  created_at,
  event_type,
  action_name,
  CASE WHEN hash_valid THEN '✓' ELSE '✗' END as integrity
FROM audit_events
WHERE operator_id = '$OPERATOR_ID'
ORDER BY created_at DESC
LIMIT 10;
EOF
echo ""

echo "✨ DIAGNOSTICS COMPLETE"
echo "For issues, see ALPHA_SUPPORT_RUNBOOK.md"
```

**Usage**:
```bash
./scripts/alpha-support-diag.sh alpha-lead@internal.test
```

---

## Summary: Command Reference

| Command | Purpose | Runtime |
|---------|---------|---------|
| `alpha-startup.sh` | Full fresh deployment | ~30 min |
| `alpha-reset.sh` | Reset to initial state (between cohorts) | ~5 min |
| `alpha-reseed-operator.sh EMAIL` | Reset single operator's data | ~2 min |
| `alpha-verify.sh` | Health check all systems | <1 min |
| `alpha-rollback.sh` | Emergency rollback to backup | ~5 min |
| `alpha-support-diag.sh EMAIL` | Operator diagnostics | <1 min |

---

**Deployment Commands Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DEPLOYMENT
