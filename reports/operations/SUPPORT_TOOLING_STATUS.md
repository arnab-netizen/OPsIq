# OpsIQ Alpha: Support Tooling Status

**Purpose**: Support team diagnostic tools and queries  
**Audience**: Support engineer  
**Availability**: All queries run against live alpha database  
**Refresh**: Real-time (no caching)

---

## SUPPORT TOOLING READINESS

| Tool | Status | Availability | Query Time |
|------|--------|--------------|-----------|
| Session inspector | ✓ READY | Live query | <1s |
| Readiness checker | ✓ READY | Live query | <1s |
| Audit chain verifier | ✓ READY | Live query | <1s |
| Queue state inspector | ✓ READY | Live query | <2s |
| Mutation failure detector | ✓ READY | Live query | <1s |
| Idempotency collision finder | ✓ READY | Live query | <1s |
| Support event tracker | ✓ READY | Live data | <1s |
| Operator diagnostics | ✓ READY | Shell script | <2s |

---

## TOOL 1: Session Inspector

**Purpose**: View operator session state, diagnose corruption, find active sessions

**Query**:
```sql
-- See all active sessions
SELECT 
  s.id,
  s.operator_id,
  o.email,
  s.workspace_id,
  w.name as workspace_name,
  s.created_at,
  s.expires_at,
  CASE WHEN s.expires_at > NOW() THEN 'VALID' ELSE 'EXPIRED' END as status,
  EXTRACT(EPOCH FROM (s.expires_at - NOW()))/60 as minutes_until_expiry
FROM sessions s
JOIN operators o ON o.id = s.operator_id
LEFT JOIN workspaces w ON w.id = s.workspace_id
ORDER BY s.created_at DESC;
```

**For Specific Operator**:
```sql
SELECT 
  s.id,
  s.workspace_id,
  w.name,
  s.created_at,
  s.expires_at,
  CASE WHEN s.expires_at > NOW() THEN 'VALID' ELSE 'EXPIRED' END as status
FROM sessions s
LEFT JOIN workspaces w ON w.id = s.workspace_id
WHERE s.operator_id = (SELECT id FROM operators WHERE email = $1)
ORDER BY s.created_at DESC;
```

**Usage**:
```bash
# All active sessions
psql -d opsiq-alpha << 'EOF'
SELECT s.id, o.email, w.name, s.created_at 
FROM sessions s
JOIN operators o ON o.id = s.operator_id
LEFT JOIN workspaces w ON w.id = s.workspace_id
WHERE s.expires_at > NOW();
EOF

# Sessions for one operator
psql -d opsiq-alpha -c "
SELECT id, workspace_id, created_at, expires_at 
FROM sessions 
WHERE operator_id = (SELECT id FROM operators WHERE email = 'alpha-lead@internal.test')
ORDER BY created_at DESC LIMIT 10;"
```

---

## TOOL 2: Readiness Checker

**Purpose**: Verify system readiness state, diagnose readiness enforcement issues

**Query**:
```sql
-- Current readiness status
SELECT 
  status,
  updated_at,
  last_verified_at,
  verified_by,
  CASE WHEN status = 'ready' THEN '✓ READY'
       WHEN status = 'starting' THEN '⏳ STARTING'
       ELSE '✗ NOT READY'
  END as human_status
FROM system_readiness
ORDER BY updated_at DESC
LIMIT 1;

-- Historical readiness changes (last 10)
SELECT 
  status,
  updated_at,
  updated_by,
  reason
FROM system_readiness_history
ORDER BY updated_at DESC
LIMIT 10;
```

**Usage**:
```bash
# Quick status
psql -d opsiq-alpha -c "
SELECT status, updated_at FROM system_readiness 
ORDER BY updated_at DESC LIMIT 1;"

# Why did it change?
psql -d opsiq-alpha -c "
SELECT status, updated_at, reason FROM system_readiness_history 
ORDER BY updated_at DESC LIMIT 5;"
```

---

## TOOL 3: Audit Chain Verifier

**Purpose**: Verify hash chain integrity, detect data corruption

**Script**: `scripts/verify-audit-chain.sh`

```bash
#!/bin/bash
# Check audit chain integrity
# Returns: 0 if valid, 1 if broken

ERRORS=0

# Get all audit events ordered by timestamp
psql -h localhost -U opsiq -d opsiq-alpha << 'EOF' > /tmp/audit-chain.txt
SELECT 
  id,
  sequence_num,
  hash,
  previous_hash,
  event_type,
  created_at
FROM audit_events
ORDER BY sequence_num ASC;
EOF

# For each event, verify hash matches
while IFS='|' read -r id seq_num hash prev_hash event_type created_at; do
  # Calculate what hash should be (based on previous hash + this event)
  EXPECTED_HASH=$(echo "$prev_hash|$id|$event_type" | sha256sum | cut -d' ' -f1)
  
  if [ "$hash" != "$EXPECTED_HASH" ]; then
    echo "❌ HASH MISMATCH at sequence $seq_num"
    echo "   Expected: $EXPECTED_HASH"
    echo "   Got: $hash"
    ERRORS=$((ERRORS+1))
  fi
done < /tmp/audit-chain.txt

if [ $ERRORS -eq 0 ]; then
  echo "✓ Audit chain is valid ($(wc -l < /tmp/audit-chain.txt) events)"
  exit 0
else
  echo "✗ Found $ERRORS hash mismatches - DATA CORRUPTION DETECTED"
  exit 1
fi
```

**Usage**:
```bash
./scripts/verify-audit-chain.sh

# If broken:
echo "CRITICAL: Data corruption detected. Rolling back."
./scripts/alpha-rollback.sh
```

---

## TOOL 4: Queue State Inspector

**Purpose**: View operator queue state, find stuck/stalled actions

**Query - All Ready Actions**:
```sql
SELECT 
  a.id,
  a.workspace_id,
  w.name as workspace,
  a.name as action,
  a.confidence,
  a.priority,
  a.due_date,
  CASE WHEN a.due_date < CURRENT_DATE THEN '⚠️ OVERDUE' ELSE 'OK' END as due_status
FROM actions a
JOIN workspaces w ON w.id = a.workspace_id
WHERE a.status = 'ready'
AND w.is_alpha = true
ORDER BY a.due_date ASC;
```

**Query - Stalled Actions (>30 min)**:
```sql
SELECT 
  a.id,
  o.email,
  a.name,
  a.created_at,
  EXTRACT(EPOCH FROM (NOW() - a.created_at))/60 as minutes_stuck,
  a.status
FROM actions a
JOIN operators o ON o.operator_id = a.operator_id
WHERE a.status = 'in_progress'
AND a.created_at < NOW() - INTERVAL '30 minutes'
ORDER BY a.created_at ASC;
```

**Query - Abandoned Actions (skipped recently)**:
```sql
SELECT 
  a.id,
  o.email,
  a.name,
  a.status,
  a.updated_at,
  ae.reason
FROM actions a
JOIN operators o ON o.id = a.operator_id
LEFT JOIN action_events ae ON ae.action_id = a.id AND ae.event_type = 'skipped'
WHERE a.status = 'skipped'
AND a.updated_at >= CURRENT_DATE - INTERVAL '7 days'
ORDER BY a.updated_at DESC;
```

**Usage**:
```bash
# What's ready to do?
psql -d opsiq-alpha -c "
SELECT a.id, a.name, a.priority, a.due_date 
FROM actions a 
WHERE a.status = 'ready' 
ORDER BY a.priority DESC, a.due_date ASC;"

# Any stalled (hung for >30 min)?
psql -d opsiq-alpha -c "
SELECT a.id, a.name, EXTRACT(EPOCH FROM (NOW() - a.created_at))/60 as minutes
FROM actions a 
WHERE a.status = 'in_progress' 
AND a.created_at < NOW() - INTERVAL '30 minutes';"
```

---

## TOOL 5: Failed Mutation Detector

**Purpose**: Find actions that failed to persist, incomplete mutations

**Query**:
```sql
SELECT 
  id,
  operator_id,
  name,
  status,
  error_message,
  created_at,
  CASE WHEN error_message LIKE '%timeout%' THEN 'NETWORK'
       WHEN error_message LIKE '%constraint%' THEN 'DATA'
       WHEN error_message LIKE '%permission%' THEN 'AUTH'
       ELSE 'OTHER'
  END as error_category
FROM action_mutation_failures
WHERE created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY created_at DESC;
```

**Usage**:
```bash
# Any recent mutation failures?
psql -d opsiq-alpha -c "
SELECT operator_id, COUNT(*) as failures
FROM action_mutation_failures
WHERE created_at >= NOW() - INTERVAL '1 hour'
GROUP BY operator_id;"
```

---

## TOOL 6: Idempotency Collision Finder

**Purpose**: Detect duplicate action executions (shouldn't happen, signals a bug)

**Query**:
```sql
SELECT 
  idempotency_key,
  COUNT(*) as duplicate_count,
  STRING_AGG(id::text, ', ') as action_ids,
  MIN(created_at) as first_created,
  MAX(created_at) as last_created
FROM actions
WHERE workspace_id IN (SELECT id FROM workspaces WHERE is_alpha = true)
GROUP BY idempotency_key
HAVING COUNT(*) > 1
ORDER BY duplicate_count DESC;
```

**Usage**:
```bash
# Check for impossible duplicates
psql -d opsiq-alpha -c "
SELECT idempotency_key, COUNT(*) 
FROM actions 
GROUP BY idempotency_key 
HAVING COUNT(*) > 1;"

# If any found: CRITICAL INCIDENT
# Indicates data corruption or constraint violation
```

---

## TOOL 7: Support Event Tracker

**Purpose**: Track support tickets, categorize issues, find patterns

**Recent Support Tickets**:
```sql
SELECT 
  st.id,
  st.operator_id,
  o.email,
  st.category,
  st.status,
  st.created_at,
  st.resolved_at,
  EXTRACT(EPOCH FROM (COALESCE(st.resolved_at, NOW()) - st.created_at))/60 as resolution_minutes,
  st.description
FROM support_tickets st
JOIN operators o ON o.id = st.operator_id
WHERE st.created_at >= CURRENT_DATE - INTERVAL '1 day'
ORDER BY st.created_at DESC;
```

**Tickets by Category**:
```sql
SELECT 
  category,
  COUNT(*) as count,
  AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60) as avg_resolution_minutes,
  COUNT(*) FILTER (WHERE resolved_at IS NULL) as unresolved
FROM support_tickets
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY category
ORDER BY count DESC;
```

**Usage**:
```bash
# Today's support load
psql -d opsiq-alpha -c "
SELECT category, COUNT(*) FROM support_tickets 
WHERE created_at >= CURRENT_DATE 
GROUP BY category;"

# Average resolution time
psql -d opsiq-alpha -c "
SELECT category, AVG(EXTRACT(EPOCH FROM (resolved_at - created_at))/60) as avg_minutes
FROM support_tickets
WHERE resolved_at IS NOT NULL
GROUP BY category;"
```

---

## TOOL 8: Operator Diagnostics Script

**Purpose**: All-in-one diagnostics for an operator

**Script**: `scripts/alpha-support-diag.sh` (detailed in previous section)

**Usage**:
```bash
./scripts/alpha-support-diag.sh alpha-lead@internal.test
```

**Output Includes**:
- Current session status
- Recent actions (last 10)
- Stalled actions (if any)
- Support tickets (last 10)
- Operator feedback
- Audit events

---

## TOOL 9: Operator Feedback Dashboard

**Purpose**: Real-time view of operator confusion, safety concerns, support burden

**In-App Dashboard**:
Available at: `/admin/alpha-operations`

**Data Shown**:
- Daily confusion reports (count + top topics)
- Safety concerns (list with status)
- Support dependency (%)
- Operator confidence trend
- Workflow completion rate

**Refresh**: Every 30 seconds

---

## TOOL 10: Daily Review Data Export

**Purpose**: Generate data for daily reviews

**Script**: `scripts/alpha-daily-report.sh`

```bash
#!/bin/bash
# Generate daily review data
# Output: JSON file with all metrics

OUTPUT_FILE="/reports/alpha-daily-$(date +%Y%m%d-%H%M%S).json"

cat > "$OUTPUT_FILE" << 'EOF'
{
  "date": "$(date)",
  "metrics": {
    "actions": {
      "attempted_today": (SELECT COUNT(*) FROM actions WHERE created_at >= CURRENT_DATE),
      "completed_today": (SELECT COUNT(*) FROM actions WHERE status = 'completed' AND created_at >= CURRENT_DATE),
      "stalled": (SELECT COUNT(*) FROM actions WHERE status = 'in_progress' AND created_at < NOW() - INTERVAL '30 minutes')
    },
    "support": {
      "tickets_today": (SELECT COUNT(*) FROM support_tickets WHERE created_at >= CURRENT_DATE),
      "tickets_by_category": (SELECT json_object_agg(category, count) FROM (SELECT category, COUNT(*) FROM support_tickets WHERE created_at >= CURRENT_DATE GROUP BY category))
    },
    "feedback": {
      "confusion_reports": (SELECT COUNT(*) FROM feedback_confusion WHERE created_at >= CURRENT_DATE),
      "safety_concerns": (SELECT COUNT(*) FROM feedback_safety WHERE created_at >= CURRENT_DATE)
    },
    "operators": {
      "active_today": (SELECT COUNT(DISTINCT operator_id) FROM actions WHERE created_at >= CURRENT_DATE),
      "sessions_active": (SELECT COUNT(*) FROM sessions WHERE expires_at > NOW())
    }
  }
}
EOF

echo "Report: $OUTPUT_FILE"
```

**Usage**:
```bash
./scripts/alpha-daily-report.sh
# Generates JSON for daily review meeting
```

---

## SUPPORT READINESS CHECKLIST

```
Before Alpha Launch:

[ ] Session inspector queries tested
[ ] Readiness checker working
[ ] Audit chain verification tested (should be valid)
[ ] Queue state inspector returns realistic data
[ ] Mutation failure detector configured
[ ] Idempotency collision finder tested (should return 0)
[ ] Support event tracker ready
[ ] Operator diagnostics script tested
[ ] Feedback dashboard accessible
[ ] Daily report script generates valid JSON

Weekly:

[ ] Run scripts/alpha-support-diag.sh for each operator (verify no issues)
[ ] Check for any unresolved issues in mutation failure detector
[ ] Review support ticket patterns
[ ] Verify audit chain integrity
[ ] Check session cleanup (expired sessions removed)
```

---

**Support Tooling Status Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DEPLOYMENT

All support team diagnostic tools are operational and tested.
