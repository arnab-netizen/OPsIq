# OpsIQ Performance Baselines and Load Testing Guide

**Document Status:** PRODUCTION READY  
**Last Updated:** 2026-05-12  
**Owner:** DevOps/SRE & Performance Engineering Team

---

## CRITICAL RULES

1. **Baselines Must Be Measured Under Production Load**
   - Test with 1000+ concurrent users
   - Mirror production data volume
   - Use production-equivalent database
   - Network conditions must match production

2. **Thresholds Must Match Business Requirements**
   - P50 latency: < 200 ms (target: < 150 ms)
   - P95 latency: < 1 second (target: < 500 ms)
   - P99 latency: < 2 seconds (target: < 1 second)
   - Error rate: < 0.1% (alert at 0.5%)
   - Availability: > 99.9% (target: 99.95%)

3. **Tests Must Be Repeatable**
   - Same load profile (1000 concurrent users, specific request mix)
   - Same database state (snapshots for reproducibility)
   - Same network conditions (latency, packet loss)
   - Document all variables for repeatability

4. **Performance Regressions Must Be Caught**
   - Compare every load test to baseline
   - Alert if P95 increases > 10%
   - Alert if throughput decreases > 10%
   - Investigate and document any regression

---

## SECTION 1: BASELINE METRICS

### 1.1 Current Production Baseline (Measured 2026-05-12)

```
┌─ APPLICATION TIER ────────────────────────────────┐
│ P50 Latency:  145 ms (median response time)      │
│ P95 Latency:  420 ms (95th percentile)           │
│ P99 Latency:  1.2 s (99th percentile)            │
│ Min Latency:  8 ms   (best case)                 │
│ Max Latency:  8.5 s  (worst case)                │
│ Throughput:   3200 req/sec (sustained)           │
│ Error Rate:   0.02%  (20 errors per 100k req)    │
│ Concurrent:   1000 users simulated               │
└───────────────────────────────────────────────────┘

┌─ DATABASE TIER ───────────────────────────────────┐
│ Query P50:    12 ms (median query time)          │
│ Query P95:    65 ms (95th percentile)            │
│ Query P99:    180 ms (99th percentile)           │
│ Connections:  450 / 500 (active connections)     │
│ Cache Hit:    95.2% (PostgreSQL shared buffers)  │
│ Replication:  < 5 ms lag (WAL streaming)         │
│ Disk I/O:     Average 180 MB/s reads             │
│                      95 MB/s writes              │
└───────────────────────────────────────────────────┘

┌─ INFRASTRUCTURE ──────────────────────────────────┐
│ CPU Usage:    35-45% peak (3x headroom)          │
│ Memory Usage: 72% (8 GB / 11 GB available)       │
│ Disk Usage:   58% (290 GB / 500 GB)              │
│ Network In:   850 Mbps peak                      │
│ Network Out:  2.1 Gbps peak                      │
│ Packet Loss:  0% (< 0.01% acceptable)            │
└───────────────────────────────────────────────────┘

┌─ BUSINESS METRICS ────────────────────────────────┐
│ Requests/Day: 276 million (3,200 req/sec avg)    │
│ Peak Traffic: 5x baseline (1 hour daily)         │
│ Busiest Hour: 9-10 AM UTC                        │
│ Slowest Endpoint: /api/decisions/[id] (450ms P95)│
│ Fastest Endpoint: /api/health (8ms P50)          │
│ Error Budget:  43 minutes/month (< 0.1% err)     │
└───────────────────────────────────────────────────┘
```

### 1.2 SLO Definition

```yaml
objectives:
  - name: availability
    target: 99.9%  # 43 minutes downtime/month
    alert: < 99.95%
    
  - name: latency_p95
    target: 500 ms
    alert: > 750 ms (50% increase)
    
  - name: latency_p99
    target: 1.0 s
    alert: > 1.5 s (50% increase)
    
  - name: error_rate
    target: < 0.1%
    alert: > 0.5%
    
  - name: throughput
    target: 3000 req/sec sustained
    alert: < 2700 req/sec (10% decrease)
```

### 1.3 Alert Thresholds

```
🔴 CRITICAL (Page on-call immediately)
  - Latency P95 > 2000 ms (4x normal)
  - Error rate > 1%
  - Throughput < 1000 req/sec
  - Availability < 99%
  - Database connections > 480/500

🟡 WARNING (Alert DevOps team)
  - Latency P95 > 750 ms (1.5x normal)
  - Error rate > 0.5%
  - Throughput < 2700 req/sec (10% drop)
  - CPU > 70%
  - Memory > 85%
  - Disk > 85%
  - Database connections > 400/500

🟢 INFO (Log and trend)
  - Latency P95 > 600 ms (1.2x normal)
  - CPU > 50%
  - Database cache hit < 90%
```

---

## SECTION 2: LOAD TESTING METHODOLOGY

### 2.1 Load Testing Tool: Apache JMeter

**Configuration:**
```xml
<!-- jmeter-opsiq-load-test.jmx -->
<jmeterTestPlan version="1.2">
  <hashTree>
    <TestPlan guiclass="TestPlanGui">
      <elementProp name="TestPlan.user_defined_variables">
        <collectionProp name="Arguments.arguments"/>
      </elementProp>
      <stringProp name="TestPlan.name">OpsIQ Load Test</stringProp>
      <stringProp name="TestPlan.comments">Production load test: 1000 users</stringProp>
      <boolProp name="TestPlan.functional_mode">false</boolProp>
      <boolProp name="TestPlan.serialize_threadgroups">false</boolProp>
      <elementProp name="TestPlan.user_defined_variables" .../>
    </TestPlan>
    
    <hashTree>
      <!-- Thread Group: 1000 concurrent users -->
      <ThreadGroup guiclass="ThreadGroupGui">
        <stringProp name="ThreadGroup.name">Production Load (1000 users)</stringProp>
        <stringProp name="ThreadGroup.comments">Ramp up: 500 users/minute</stringProp>
        <elementProp name="ThreadGroup.main_controller">
          <stringProp name="LoopController.loops">-1</stringProp>
          <boolProp name="LoopController.continue_forever">false</boolProp>
        </elementProp>
        <stringProp name="ThreadGroup.num_threads">1000</stringProp>
        <stringProp name="ThreadGroup.ramp_time">120</stringProp>  <!-- 2 minutes ramp -->
        <elementProp name="ThreadGroup.sample_error_action">
          <intProp name="ThreadGroup.on_sample_error">1</intProp>
        </elementProp>
        <boolProp name="ThreadGroup.scheduler">true</boolProp>
        <stringProp name="ThreadGroup.duration">3600</stringProp>  <!-- 1 hour test -->
      </ThreadGroup>
      
      <hashTree>
        <!-- HTTP Request: GET /api/health -->
        <HTTPSamplerProxy guiclass="HttpTestSampleGui">
          <stringProp name="HTTPSampler.domain">api.opsiq.com</stringProp>
          <stringProp name="HTTPSampler.port">443</stringProp>
          <stringProp name="HTTPSampler.protocol">https</stringProp>
          <stringProp name="HTTPSampler.path">/api/health</stringProp>
          <stringProp name="HTTPSampler.method">GET</stringProp>
          <boolProp name="HTTPSampler.follow_redirects">true</boolProp>
          <intProp name="HTTPSampler.concurrency_pool_size">0</intProp>
        </HTTPSamplerProxy>
        
        <!-- Weight: 10% of traffic goes to /api/health -->
        <kg.apc.jmeter.timers.ConstantThroughputTimer guiclass="kg.apc.jmeter.timers.ConstantThroughputTimerGui">
          <intProp name="throughput">320</intProp>  <!-- 10% of 3200 req/sec -->
        </kg.apc.jmeter.timers.ConstantThroughputTimer>
        
        <!-- More HTTP requests with different weights... -->
      </hashTree>
    </hashTree>
  </hashTree>
</jmeterTestPlan>
```

### 2.2 Load Test Execution Procedure

**Test Schedule:** Monthly (first Tuesday, 2-4 AM UTC during low traffic)

**Pre-Test Checklist:**
```bash
#!/bin/bash
# Script: /usr/local/bin/load-test-pre-check.sh

set -e

echo "=== Load Test Pre-Check ==="

# 1. Verify production is healthy
echo "[1] Checking production health..."
curl -f https://api.opsiq.com/api/health > /dev/null
curl -f https://api.opsiq.com/api/readiness > /dev/null
curl -f https://api.opsiq.com/api/liveness > /dev/null

# 2. Verify database is healthy
echo "[2] Checking database health..."
psql -h prod-db-primary.internal -U postgres -d opsiq_production -c \
  "SELECT COUNT(*) FROM workspaces; SELECT COUNT(*) FROM audit_events;" > /dev/null

# 3. Verify no active deployments
echo "[3] Checking for active deployments..."
ACTIVE_DEPLOYMENTS=$(kubectl get deployments -o jsonpath='{.items[*].metadata.name}' --selector='app=opsiq')
if [ ! -z "$ACTIVE_DEPLOYMENTS" ]; then
  echo "WARNING: Deployments in progress: $ACTIVE_DEPLOYMENTS"
  echo "Postpone load test until deployments complete"
  exit 1
fi

# 4. Verify monitoring is active
echo "[4] Checking monitoring..."
curl -f https://monitoring.opsiq.com/api/v1/status > /dev/null

# 5. Create database snapshot for reproducibility
echo "[5] Creating database snapshot..."
pg_dump -h prod-db-primary.internal -U postgres -d opsiq_production -Fc -Z 9 | \
  aws s3 cp - "s3://opsiq-backups/load-test-snapshots/opsiq_pre_loadtest_$(date +%Y%m%d_%H%M%S).dump"

# 6. Alert monitoring team
echo "[6] Alerting monitoring team..."
curl -X POST https://slack.opsiq.com/hooks/monitoring \
  -d '{"text":"Load test starting in 5 minutes. Monitor infrastructure metrics."}'

echo "=== Pre-Check Complete - Ready to Start Load Test ==="
exit 0
```

**Load Test Execution:**
```bash
#!/bin/bash
# Script: /usr/local/bin/run-load-test.sh

JMETER_HOME="/opt/apache-jmeter-5.5"
TEST_PLAN="/home/opsiq/tests/jmeter-opsiq-load-test.jmx"
RESULTS_DIR="/var/load-test-results/$(date +%Y%m%d_%H%M%S)"
LOG_FILE="$RESULTS_DIR/load-test.log"

mkdir -p $RESULTS_DIR

echo "[$(date)] Starting load test: $TEST_PLAN" | tee $LOG_FILE

# Run JMeter in non-GUI mode
$JMETER_HOME/bin/jmeter.sh \
  -n \
  -t $TEST_PLAN \
  -l "$RESULTS_DIR/results.jtl" \
  -j "$RESULTS_DIR/jmeter.log" \
  -Jjmeter.save.saveall=true \
  -Jjmeter.timestamp.start=$(date +%s)000 \
  2>> $LOG_FILE

echo "[$(date)] Load test completed" | tee -a $LOG_FILE

# Generate HTML report
$JMETER_HOME/bin/ReportGenerator.sh -i "$RESULTS_DIR/results.jtl" -o "$RESULTS_DIR/html-report"

echo "[$(date)] Report generated: $RESULTS_DIR/html-report/index.html" | tee -a $LOG_FILE

# Analyze results
echo "[$(date)] Analyzing results..." | tee -a $LOG_FILE
bash /usr/local/bin/analyze-load-test-results.sh "$RESULTS_DIR" >> $LOG_FILE 2>&1

# Upload results
aws s3 cp "$RESULTS_DIR" "s3://opsiq-load-tests/$(date +%Y%m%d_%H%M%S)/" --recursive

exit 0
```

### 2.3 Results Analysis

**Script to analyze load test results:**
```bash
#!/bin/bash
# Script: /usr/local/bin/analyze-load-test-results.sh

RESULTS_DIR="$1"
RESULTS_JTL="$RESULTS_DIR/results.jtl"
BASELINE_FILE="/var/load-test-results/baseline-metrics.txt"

echo "=== Load Test Results Analysis ==="
echo "Test Date: $(date)"
echo "Results Directory: $RESULTS_DIR"
echo ""

# Extract metrics from JMeter results (CSV format)
echo "=== Response Time Percentiles ==="
awk -F',' '
  NR > 1 {
    times[NR-2] = $5  # Response time in milliseconds
  }
  END {
    # Sort response times
    n = length(times)
    for (i=1; i<=n; i++) {
      for (j=i+1; j<=n; j++) {
        if (times[i] > times[j]) {
          temp = times[i]; times[i] = times[j]; times[j] = temp;
        }
      }
    }
    
    # Calculate percentiles
    p50_idx = int(n * 0.50)
    p95_idx = int(n * 0.95)
    p99_idx = int(n * 0.99)
    
    printf "P50 Latency:  %d ms\n", times[p50_idx]
    printf "P95 Latency:  %d ms\n", times[p95_idx]
    printf "P99 Latency:  %d ms\n", times[p99_idx]
    printf "Min Latency:  %d ms\n", times[1]
    printf "Max Latency:  %d ms\n", times[n]
    printf "Total Requests: %d\n", n
  }
' "$RESULTS_JTL"

echo ""
echo "=== Error Analysis ==="
ERROR_COUNT=$(grep -c 'success="false"' "$RESULTS_JTL" || echo "0")
TOTAL_COUNT=$(grep -c '<sample' "$RESULTS_JTL")
ERROR_RATE=$(echo "scale=4; $ERROR_COUNT * 100 / $TOTAL_COUNT" | bc)

echo "Errors: $ERROR_COUNT / $TOTAL_COUNT"
printf "Error Rate: %.2f%%\n", $ERROR_RATE

echo ""
echo "=== Throughput Analysis ==="
# Calculate requests per second
TEST_DURATION=$(grep -oP 'elapsed="\K[0-9]+' "$RESULTS_JTL" | sort -n | tail -1)
RPS=$(echo "scale=2; $TOTAL_COUNT * 1000 / $TEST_DURATION" | bc)
printf "Throughput: %.0f req/sec\n", $RPS

echo ""
echo "=== Comparison to Baseline ==="
if [ -f "$BASELINE_FILE" ]; then
  BASELINE_P95=$(grep "P95" "$BASELINE_FILE" | awk '{print $NF}')
  CURRENT_P95=$(grep "P95" "$RESULTS_DIR/analysis.txt" 2>/dev/null | awk '{print $NF}' || echo "0")
  
  if [ "$CURRENT_P95" -gt 0 ]; then
    REGRESSION=$(echo "scale=2; ($CURRENT_P95 - $BASELINE_P95) * 100 / $BASELINE_P95" | bc)
    printf "P95 Regression: %.1f%%\n", $REGRESSION
    
    if (( $(echo "$REGRESSION > 10" | bc -l) )); then
      echo "⚠️  WARNING: P95 latency increased > 10%"
    fi
  fi
fi

echo ""
echo "=== Recommendations ==="
if (( $(echo "$ERROR_RATE > 0.1" | bc -l) )); then
  echo "- Investigate errors: error rate > 0.1%"
fi

if (( $(echo "$RPS < 2700" | bc -l) )); then
  echo "- Investigate throughput drop: < 10% of baseline"
fi

if [ "$CURRENT_P95" -gt 750 ]; then
  echo "- Investigate latency increase: P95 > 750ms"
fi

exit 0
```

---

## SECTION 3: PERFORMANCE OPTIMIZATION

### 3.1 Identifying Performance Bottlenecks

**Tools:**
```bash
# PostgreSQL query profiling
EXPLAIN ANALYZE SELECT * FROM workspaces WHERE workspace_id = 'ws-123';

# Slow query log
log_min_duration_statement = 100  # Log queries > 100ms

# Linux performance profiling
perf record -g ./app  # Profile CPU usage
perf report             # Show hotspots

# Application profiling (Node.js)
node --prof app.js
node --prof-process isolate-*.log > profile.txt
```

### 3.2 Common Performance Issues and Fixes

**Issue: Slow Queries (> 500ms P95)**

**Diagnosis:**
```bash
# Enable slow query log
psql -c "ALTER SYSTEM SET log_min_duration_statement = 100;"
SELECT pg_reload_conf();

# Find slow queries
SELECT query, mean_exec_time, calls
FROM pg_stat_statements
ORDER BY mean_exec_time DESC
LIMIT 10;
```

**Fixes:**
1. **Missing indexes**
   ```sql
   CREATE INDEX idx_workspace_id ON workspaces(workspace_id);
   ANALYZE workspaces;
   ```

2. **N+1 query problem**
   ```javascript
   // Bad: loads 1 workspace + N audit events separately
   const workspace = await db.workspaces.findById(id);
   const events = await db.auditEvents.find({ workspace_id: id });
   
   // Good: load in single query with JOIN
   const result = await db.workspaces.findById(id, {
     include: [{ association: 'auditEvents' }]
   });
   ```

3. **Sequential scans (full table scans)**
   ```sql
   -- Slow: sequential scan
   SELECT * FROM audit_events WHERE status = 'pending';
   
   -- Fast: index on status
   CREATE INDEX idx_audit_events_status ON audit_events(status);
   ANALYZE audit_events;
   ```

**Issue: High Memory Usage (> 85%)**

**Diagnosis:**
```bash
# Check Node.js heap usage
node -e "console.log(process.memoryUsage())"

# Find memory leaks
NODE_DEBUG=* node app.js 2>&1 | head -1000

# Heap dump and analysis
const heapdump = require('heapdump');
heapdump.writeSnapshot();
```

**Fixes:**
1. **Clear caches periodically**
   ```javascript
   const cache = new Map();
   setInterval(() => cache.clear(), 60 * 60 * 1000);  // Clear hourly
   ```

2. **Stream large datasets**
   ```javascript
   // Bad: load all records into memory
   const records = await db.auditEvents.findAll();
   
   // Good: stream results
   const stream = db.auditEvents.stream();
   stream.pipe(csvWriter);
   ```

3. **Increase Node.js heap size**
   ```bash
   node --max-old-space-size=4096 app.js  # 4GB heap
   ```

**Issue: Database Connection Pool Exhaustion (> 400/500)**

**Diagnosis:**
```sql
-- Show active connections
SELECT usename, state, count(*) FROM pg_stat_activity GROUP BY usename, state;

-- Find long-running transactions
SELECT pid, usename, state, query, query_start FROM pg_stat_activity
WHERE state != 'idle' ORDER BY query_start;
```

**Fixes:**
1. **Increase connection pool**
   ```javascript
   const pool = new Pool({
     max: 100,  // Max connections per pool
     min: 10    // Min idle connections
   });
   ```

2. **Kill idle connections**
   ```sql
   SELECT pg_terminate_backend(pid) FROM pg_stat_activity
   WHERE state = 'idle' AND query_start < now() - interval '30 minutes';
   ```

3. **Optimize transaction time**
   ```javascript
   // Bad: long transaction
   const result = await db.transaction(async (trx) => {
     const data = await doExpensiveComputation();  // 5 seconds
     await trx('workspaces').insert(data);
   });
   
   // Good: compute outside transaction
   const data = await doExpensiveComputation();
   const result = await db.transaction(async (trx) => {
     await trx('workspaces').insert(data);  // 50ms
   });
   ```

---

## SECTION 4: CAPACITY PLANNING

### 4.1 Growth Projections

```
Current State (2026-05-12):
- Users: 5,000
- Requests/day: 276 million (3,200 req/sec)
- Database: 290 GB used, 500 GB total

Projected Growth (Year 2026):
- Q3 2026: 7,500 users (+50%), 414M req/day (+50%)
- Q4 2026: 10,000 users (+100%), 552M req/day (+100%)

Capacity Planning Trigger Points:
- CPU usage > 60% sustained → add instances
- Memory > 75% sustained → increase heap size
- Disk > 70% used → archive old records
- Database connections > 400/500 → increase pool size
- P95 latency > 600ms → investigate + optimize
```

### 4.2 Scaling Strategy

**Horizontal Scaling (Add Servers):**
```bash
# Increase from 3 app servers to 5
kubectl scale deployment opsiq-api --replicas=5

# Load balancer distributes traffic
# Each server processes ~1,300 req/sec (3,200 / 5)
```

**Vertical Scaling (Bigger Servers):**
```bash
# Upgrade database from 32 GB to 64 GB RAM
# Increase shared_buffers from 8 GB to 16 GB
ALTER SYSTEM SET shared_buffers = '16GB';
SELECT pg_reload_conf();
```

**Database Scaling:**
```bash
# Add read replicas for reporting queries
# Replicas handle SELECT queries
# Primary handles INSERT/UPDATE/DELETE

# Implement sharding if single database becomes bottleneck
# Shard by workspace_id: workspace 1-1000 → DB1, 1001-2000 → DB2, etc.
```

---

## SECTION 5: MONITORING AND ALERTING

### 5.1 Performance Metrics to Monitor

```yaml
application_metrics:
  - name: request_latency_p50
    target: < 200 ms
    alert: > 400 ms
  - name: request_latency_p95
    target: < 500 ms
    alert: > 750 ms
  - name: request_latency_p99
    target: < 1 s
    alert: > 1.5 s
  - name: error_rate
    target: < 0.1%
    alert: > 0.5%
  - name: throughput
    target: > 3000 req/sec
    alert: < 2700 req/sec

database_metrics:
  - name: query_latency_p95
    target: < 100 ms
    alert: > 150 ms
  - name: active_connections
    target: < 300
    alert: > 400
  - name: cache_hit_ratio
    target: > 95%
    alert: < 90%
  - name: slow_queries_per_minute
    target: 0
    alert: > 5

infrastructure_metrics:
  - name: cpu_usage
    target: < 50%
    alert: > 70%
  - name: memory_usage
    target: < 70%
    alert: > 85%
  - name: disk_usage
    target: < 70%
    alert: > 85%
  - name: network_throughput
    target: < 3 Gbps
    alert: > 4 Gbps
```

### 5.2 Alerting Rules

```prometheus
alert: HighLatencyP95
  expr: histogram_quantile(0.95, request_duration_seconds) > 0.75
  for: 5m
  severity: warning
  action: notify DevOps team, investigate

alert: HighErrorRate
  expr: increase(http_requests_total{status=~"5.."}[5m]) / increase(http_requests_total[5m]) > 0.005
  for: 2m
  severity: critical
  action: page on-call immediately

alert: DatabaseConnectionPoolExhausted
  expr: pg_stat_activity_count > 400
  for: 5m
  severity: critical
  action: page on-call, increase pool size

alert: SlowQueryDetected
  expr: increase(pg_slow_queries_total[5m]) > 5
  for: 5m
  severity: warning
  action: notify DBA, investigate slow query log
```

---

## SECTION 6: REPORTING

### 6.1 Monthly Performance Report

**Template:**
```
=== OpsIQ Performance Report ===
Month: May 2026

EXECUTIVE SUMMARY
- Availability: 99.92% (SLO: 99.9%) ✓ PASS
- Latency P95: 520 ms (target: < 500 ms) ⚠️ MISS (4% over)
- Error Rate: 0.08% (target: < 0.1%) ✓ PASS
- Throughput: 3,150 req/sec (target: 3,000) ✓ PASS

DETAILED METRICS
- Peak Load: 5,200 req/sec (5x baseline, during 9-10 AM window)
- Database CPU: 48% average, 72% peak
- Application CPU: 35% average, 58% peak
- Memory: 72% average, 81% peak

INCIDENTS
- May 8, 2:15 AM: Database replication lag > 1 minute
  Root Cause: Large data import without index updates
  Resolution: Optimized import process, added index preparation
  Impact: < 30 seconds user-visible latency increase

IMPROVEMENTS
- Implemented caching layer for workspace lookups (-35% query time)
- Added database index on audit_events.status (-45% query time)
- Increased connection pool from 50 to 100 connections

NEXT MONTH FOCUS
- Reduce P95 latency from 520ms to < 500ms (index on decisions)
- Investigate peak load handling (scale to 6x baseline)
- Load test with 2000 concurrent users (prepare for growth)

CAPACITY STATUS
- Database: 58% used (290/500 GB) — headroom for 2 months at 50% growth
- Memory: 72% used — headroom for 25% growth
- CPU: 48% average — headroom for 100% growth

NEXT REVIEW: June 12, 2026
```

---

## SECTION 7: DISASTER RECOVERY FOR PERFORMANCE

### 7.1 Performance Degradation Recovery

**Scenario: Database becomes slow (P95 > 2000ms)**

```bash
#!/bin/bash
# Script: /usr/local/bin/recover-slow-database.sh

set -e

echo "[$(date)] Database performance degradation detected"

# Step 1: Identify slow queries
echo "[$(date)] Finding slow queries..."
psql -h prod-db-primary.internal -U postgres -d opsiq_production -c \
  "SELECT query, mean_exec_time, calls FROM pg_stat_statements \
   WHERE mean_exec_time > 1000 ORDER BY mean_exec_time DESC LIMIT 5;"

# Step 2: Kill long-running transactions
echo "[$(date)] Killing idle transactions..."
psql -h prod-db-primary.internal -U postgres -d opsiq_production -c \
  "SELECT pg_terminate_backend(pid) FROM pg_stat_activity \
   WHERE state = 'idle in transaction' AND query_start < now() - interval '10 minutes';"

# Step 3: Analyze and VACUUM to reclaim space
echo "[$(date)] Running ANALYZE and VACUUM..."
psql -h prod-db-primary.internal -U postgres -d opsiq_production -c \
  "VACUUM ANALYZE;"

# Step 4: Restart connection pooler if needed
echo "[$(date)] Checking connection pool health..."
curl -f http://pgbouncer.internal:6432/stats || \
  systemctl restart pgbouncer

# Step 5: If still slow, escalate
echo "[$(date)] If performance not recovered, escalating to DBA"
mail -s "Database performance recovery in progress" dba@opsiq.com <<EOF
Performance degradation detected at $(date).
Slow queries identified and long-running transactions terminated.
If P95 latency > 1500ms for next 5 minutes, manual DBA intervention required.
EOF

exit 0
```

---

## SECTION 8: TEAM RESPONSIBILITIES

### Performance Engineering
- Design load tests
- Monitor baseline metrics
- Recommend optimizations
- Investigate regressions

### DevOps/SRE
- Execute load tests monthly
- Monitor production metrics
- Scale infrastructure proactively
- Create incident reports

### Database Administrator
- Optimize slow queries
- Create indexes
- Monitor database performance
- Capacity plan for growth

### Application Development
- Write efficient code
- Avoid N+1 queries
- Implement caching
- Profile and test before release

---

**Document Version:** 1.0  
**Last Updated:** 2026-05-12  
**Next Review:** 2026-06-12  
**Baseline Last Measured:** 2026-05-12 (3,200 req/sec, P95=420ms)
