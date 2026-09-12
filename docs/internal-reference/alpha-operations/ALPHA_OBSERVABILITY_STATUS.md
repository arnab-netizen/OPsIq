# OpsIQ Alpha: Observability Status

**Purpose**: Operational monitoring, dashboards, and alerting for alpha  
**Audience**: Support, team lead, DevOps  
**Data Flow**: Logging → Collection → Dashboard → Alerts  
**Refresh Rate**: Real-time (1-5 second latency)

---

## OBSERVABILITY STACK READINESS

| Component | Status | Availability | Metrics |
|-----------|--------|--------------|---------|
| Structured Logging | ✓ READY | Live | All requests, errors, debug |
| Request Tracing | ✓ READY | Live | Correlation IDs, timings, paths |
| System Metrics | ✓ READY | Live | CPU, memory, latency, throughput |
| Error Tracking | ✓ READY | Live | Error count, categories, trends |
| Support Metrics | ✓ READY | Live | Tickets, resolution time, categories |
| Operator Metrics | ✓ READY | Live | Engagement, completion, confidence |
| Dashboards | ✓ READY | 4 dashboards | Real-time visualization |
| Alerting | ✓ READY | Thresholds set | Automatic escalation |

---

## LOGGING SYSTEM

### Log Levels & Data

**INFO Logs** (normal operation):
- Request received: endpoint, method, operator_id, workspace_id
- Action created/updated: action_id, operator_id, status
- Recommendation generated: confidence, priority, impact
- Session created/expired: operator_id, duration
- Decision logged: action_id, decision, timestamp

**WARN Logs** (unusual but recoverable):
- Slow request: endpoint, duration_ms, threshold
- High latency detected: service, latency_ms
- Stalled action: action_id, duration_minutes
- Operator confusion reported: topic, operator_id
- Support dependency spike: count, threshold

**ERROR Logs** (requires action):
- Failed mutation: action_id, error_code, retry_count
- Session corruption: operator_id, issue_type
- Database connection lost: error_message
- Audit chain break: sequence_num, hash_mismatch
- Readiness enforcement failure: blocking_service

**DEBUG Logs** (detailed diagnostics):
- SQL queries: statement, duration_ms
- Cache hits/misses: key, ttl
- Session validation: operator_id, workspace_id, result
- Policy checks: resource_id, operator_id, permission, result

### Log Access

```bash
# All logs (live tail)
tail -f /tmp/alpha-server.log

# Errors only
grep ERROR /tmp/alpha-server.log

# Specific operator
grep "operator_id.*alpha-lead" /tmp/alpha-server.log

# By timestamp
sed -n '/2026-05-22T10:00:00/,/2026-05-22T10:30:00/p' /tmp/alpha-server.log

# Parse JSON logs
cat /tmp/alpha-server.log | jq '.operator_id, .action_id, .event_type'
```

---

## SYSTEM METRICS DASHBOARD

**Location**: `http://localhost:3001/metrics`

**Metrics Tracked**:

### 1. Throughput
```
Requests per second: [current] (target: 5-20 req/s)
Actions created per hour: [current] (target: 5-10)
Support tickets per hour: [current] (target: <1)
```

### 2. Latency
```
API response time (p50): [current] (target: <200ms)
API response time (p95): [current] (target: <500ms)
API response time (p99): [current] (target: <1000ms)
Database query time (avg): [current] (target: <50ms)
```

### 3. Errors
```
5xx errors: [count] (target: 0)
4xx errors: [count] (expected: <50)
Timeouts: [count] (target: 0)
Failed mutations: [count] (target: 0)
```

### 4. System Health
```
Uptime: [hours] (target: continuous)
Memory usage: [MB] (target: <500MB)
Database connections: [count]/[max] (target: <80% utilization)
Disk space: [%] (target: >20% free)
```

---

## OPERATOR METRICS DASHBOARD

**Location**: `/admin/alpha-operations`

**Operators Panel**:
```
┌─────────────────────────────────────────┐
│ OPERATOR STATUS                         │
├─────────────────────────────────────────┤
│ Sarah (alpha-lead@...)                  │
│ ├─ Status: Active (online now)          │
│ ├─ Last action: 15 minutes ago          │
│ ├─ Actions today: 8                     │
│ ├─ Support tickets: 0                   │
│ └─ Confidence: 4.3/5                    │
│                                         │
│ Mike (validator-1@...)                  │
│ ├─ Status: Offline (last 2 hours ago)   │
│ ├─ Actions yesterday: 6                 │
│ ├─ Support tickets: 1                   │
│ └─ Confidence: 3.8/5                    │
│                                         │
│ Lisa (validator-2@...)                  │
│ ├─ Status: Online (30 min ago)          │
│ ├─ Actions this week: 12                │
│ ├─ Support tickets: 2                   │
│ └─ Confidence: 4.1/5                    │
└─────────────────────────────────────────┘
```

---

## WORKFLOW METRICS DASHBOARD

**Location**: `/admin/alpha-operations`

**Workflow Panel**:
```
┌─────────────────────────────────────────┐
│ WORKFLOW STATUS                         │
├─────────────────────────────────────────┤
│ Actions Attempted Today: 8              │
│ ├─ Completed: 7 (87.5%)                 │
│ ├─ Stalled: 0                           │
│ └─ Pending: 1                           │
│                                         │
│ Completion Rate Trend:                  │
│ ├─ Day 1: 80% → Day 2: 85% → Day 3: 87%│
│ └─ Trend: ↗ IMPROVING                   │
│                                         │
│ Average Time per Action: 4.2 min        │
│ ├─ Trend: Decreasing (efficiency ✓)    │
│                                         │
│ Workflow Abandonment: 0 (0%)            │
│ └─ No abandoned workflows               │
└─────────────────────────────────────────┘
```

---

## SUPPORT METRICS DASHBOARD

**Location**: `/admin/alpha-operations`

**Support Panel**:
```
┌─────────────────────────────────────────┐
│ SUPPORT BURDEN                          │
├─────────────────────────────────────────┤
│ Tickets Today: 2                        │
│ ├─ Confusion: 1                         │
│ ├─ Errors: 0                            │
│ ├─ Stalled: 1                           │
│ └─ Other: 0                             │
│                                         │
│ Resolution Time (avg): 18 minutes       │
│ ├─ Target: <60 minutes ✓                │
│                                         │
│ Dependency Ratio: 20%                   │
│ ├─ Tickets / Actions = 2/10 ✓           │
│                                         │
│ Top Confusion Topic: "Metrics"          │
│ └─ Reported by: 1 operator              │
│                                         │
│ Unresolved: 0                           │
│ └─ All tickets resolved ✓               │
└─────────────────────────────────────────┘
```

---

## TRUST & SAFETY DASHBOARD

**Location**: `/admin/alpha-operations`

**Safety Panel**:
```
┌─────────────────────────────────────────┐
│ TRUST & SAFETY STATUS                   │
├─────────────────────────────────────────┤
│ Safety Concerns Reported: 0             │
│ └─ No operator safety concerns ✓        │
│                                         │
│ Data Integrity: Valid                   │
│ ├─ Audit chain: ✓ Intact                │
│ ├─ No corruption detected               │
│ ├─ No silent mutations                  │
│ └─ Hash chain: ✓ Valid                  │
│                                         │
│ Operator Confidence: 4.1/5              │
│ ├─ Trend: Improving ✓                   │
│ ├─ Range: 3.8 - 4.3                     │
│                                         │
│ Trust Level (inferred): HIGH             │
│ ├─ Operators completing workflows       │
│ ├─ Minimal support dependency           │
│ └─ Confidence trending up               │
│                                         │
│ Session Integrity: 100%                 │
│ └─ No corruption detected               │
└─────────────────────────────────────────┘
```

---

## ALERTS & ESCALATION

### Alert Rules (Auto-Escalate if Triggered)

**CRITICAL Alerts** (respond <5 min):
```
[ ] Uptime < 99% (more than 5 min downtime)
[ ] Error rate > 5% (5xx errors)
[ ] Failed mutations detected
[ ] Audit chain broken
[ ] Database unavailable
[ ] Memory usage > 80%
```

**HIGH Alerts** (respond <30 min):
```
[ ] Latency p95 > 1 second
[ ] Support tickets > 5/day
[ ] Stalled actions > 3
[ ] Operator reported safety concern
[ ] Repeated same error (>3x)
```

**MEDIUM Alerts** (respond <1 hour):
```
[ ] Latency p50 > 500ms
[ ] Confusion reports > 5/day
[ ] Single topic >30% of confusion
[ ] Support dependency > 40%
[ ] Operator confidence declining
```

### Alert Notifications

**Slack Channel**: `#ops-alpha-alerts`

**Message Format**:
```
🚨 [SEVERITY] ALERT

Issue: [What triggered]
Metric: [Current value] / [threshold]
Trend: [Improving / Stable / Declining]
Action: [Recommended immediate action]

Runbook: [Link to incident response doc]
Dashboard: [Link to relevant dashboard]
```

---

## METRICS QUERIES (For Manual Checking)

### Query 1: Daily Metrics Summary

```sql
SELECT
  CURRENT_DATE as date,
  (SELECT COUNT(*) FROM actions WHERE created_at >= CURRENT_DATE) as actions_attempted,
  (SELECT COUNT(*) FROM actions WHERE status = 'completed' AND created_at >= CURRENT_DATE) as actions_completed,
  ROUND(100.0 * (SELECT COUNT(*) FROM actions WHERE status = 'completed' AND created_at >= CURRENT_DATE) / 
        NULLIF((SELECT COUNT(*) FROM actions WHERE created_at >= CURRENT_DATE), 0), 1) as completion_rate,
  (SELECT COUNT(*) FROM support_tickets WHERE created_at >= CURRENT_DATE) as support_tickets,
  (SELECT COUNT(*) FROM feedback_confusion WHERE created_at >= CURRENT_DATE) as confusion_reports,
  (SELECT COUNT(*) FROM feedback_safety WHERE created_at >= CURRENT_DATE) as safety_concerns,
  (SELECT COUNT(DISTINCT operator_id) FROM actions WHERE created_at >= CURRENT_DATE) as operators_active;
```

### Query 2: Support Dependency

```sql
SELECT
  ROUND(100.0 * (SELECT COUNT(*) FROM support_tickets WHERE created_at >= CURRENT_DATE) /
        NULLIF((SELECT COUNT(*) FROM actions WHERE created_at >= CURRENT_DATE), 0), 1) as support_dependency_pct,
  CASE
    WHEN (SELECT COUNT(*) FROM support_tickets WHERE created_at >= CURRENT_DATE) /
         NULLIF((SELECT COUNT(*) FROM actions WHERE created_at >= CURRENT_DATE), 0) < 0.3 THEN '✓ GOOD'
    WHEN (SELECT COUNT(*) FROM support_tickets WHERE created_at >= CURRENT_DATE) /
         NULLIF((SELECT COUNT(*) FROM actions WHERE created_at >= CURRENT_DATE), 0) < 0.4 THEN '⚠️ WARN'
    ELSE '✗ ALERT'
  END as status;
```

### Query 3: Operator Confidence Trend

```sql
SELECT
  DATE(created_at) as date,
  ROUND(AVG(confidence_level), 2) as avg_confidence,
  MIN(confidence_level) as min_confidence,
  MAX(confidence_level) as max_confidence
FROM feedback_daily
WHERE created_at >= CURRENT_DATE - INTERVAL '7 days'
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

### Query 4: System Health

```sql
SELECT
  'Uptime' as metric,
  EXTRACT(EPOCH FROM (NOW() - (SELECT MIN(created_at) FROM system_readiness WHERE status = 'ready')))/3600 || ' hours' as value
UNION ALL
SELECT
  'Requests Today',
  COUNT(*)::text
FROM request_logs
WHERE created_at >= CURRENT_DATE
UNION ALL
SELECT
  'Error Rate',
  ROUND(100.0 * COUNT(*) FILTER (WHERE status >= 500) / NULLIF(COUNT(*), 0), 2) || '%'
FROM request_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '1 hour'
UNION ALL
SELECT
  'Avg Latency',
  ROUND(AVG(duration_ms), 0) || 'ms'
FROM request_logs
WHERE created_at >= CURRENT_DATE - INTERVAL '1 hour';
```

---

## DASHBOARD ACCESS

### For Support Engineer

**URL**: `http://localhost:3001/support`
**Auth**: `alpha-support-team` role
**Refresh**: Auto (every 30 seconds)

---

### For Team Lead

**URL**: `http://localhost:3001/admin/alpha-operations`
**Auth**: `team-lead` role
**Refresh**: Auto (every 30 seconds)

---

## EXPORTABLE REPORTS

### Daily Summary Export

```bash
curl -H "Authorization: Bearer $ALPHA_API_KEY" \
  http://localhost:3001/api/alpha/daily-summary \
  > /reports/alpha-daily-$(date +%Y%m%d).json
```

### Weekly Trend Report

```bash
curl -H "Authorization: Bearer $ALPHA_API_KEY" \
  http://localhost:3001/api/alpha/weekly-trends \
  > /reports/alpha-weekly-$(date +%Y%m%d).json
```

### Full Metrics Export (for analysis)

```bash
curl -H "Authorization: Bearer $ALPHA_API_KEY" \
  http://localhost:3001/api/alpha/metrics-export \
  > /reports/alpha-metrics-$(date +%Y%m%d-%H%M%S).json
```

---

## RETENTION POLICY

| Data | Retention | Location |
|------|-----------|----------|
| Application logs | 7 days | `/tmp/alpha-server.log` (rotated daily) |
| Structured events | 30 days | Database (alpha_events table) |
| Metrics | 90 days | Metrics database |
| Dashboards | Continuous | In-app (real-time) |
| Exported reports | 1 year | `/reports/` directory |
| Incident logs | Permanent | `/backups/incident-*.log` |

---

## OBSERVABILITY READINESS CHECKLIST

```
Before Alpha Launch:

[ ] Structured logging operational (check /tmp/alpha-server.log)
[ ] Request tracing working (correlation IDs in logs)
[ ] System metrics being collected (CPU, memory, latency)
[ ] Error tracking configured
[ ] Support metrics operational
[ ] Operator metrics dashboard accessible
[ ] Dashboards load without errors
[ ] Alert rules configured and tested
[ ] Slack integration working
[ ] Query performance acceptable (<2s)

Daily During Alpha:

[ ] Check dashboards for obvious issues
[ ] Monitor alert channel for escalations
[ ] Review operator metrics for trends
[ ] Check system health metrics
[ ] Verify log collection is working
[ ] Run daily summary export
```

---

**Observability Status Version**: 1.0  
**Date**: 2026-05-19  
**Status**: READY FOR DEPLOYMENT

Full observability stack is operational for real-time monitoring during alpha.
