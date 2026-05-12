# OpsIQ Operations Runbook

## Table of Contents
1. [System Overview](#system-overview)
2. [Deployment Procedures](#deployment-procedures)
3. [Common Issues & Resolution](#common-issues--resolution)
4. [Incident Response](#incident-response)
5. [Monitoring & Alerts](#monitoring--alerts)
6. [Backup & Recovery](#backup--recovery)
7. [Performance Tuning](#performance-tuning)

---

## System Overview

### Architecture
```
Users
  ↓
[Load Balancer / Reverse Proxy]
  ↓
[Next.js Application Servers]
  ↓
[PostgreSQL Database]
  ↓
[Backup System]
```

### Key Components
- **Application:** Node.js 18.x, Next.js 16.x
- **Database:** PostgreSQL 15
- **Caching:** (Optional) Redis for session/cache
- **Monitoring:** Sentry (error tracking), CloudWatch/DataDog (metrics)
- **Deployments:** GitHub Actions → Docker → Kubernetes/Serverless

### SLA Targets
- Uptime: 99.5% (4.5 hours downtime/month acceptable)
- Response Time p95: < 500ms
- Error Rate: < 0.1%
- RTO (Recovery Time Objective): < 30 minutes
- RPO (Recovery Point Objective): < 1 hour

---

## Deployment Procedures

### Staging Deployment

```bash
# 1. Verify readiness
npm run validate:deployment

# 2. Deploy to staging
git push origin main
# (Automatically triggers GitHub Actions)

# 3. Run smoke tests
curl https://staging.opsiq.app/health
# Verify response 200 OK with all services green

# 4. Test critical paths (manual)
# - Login with test account
# - Create a test action
# - Verify action appears in list
# - Test API endpoints with curl
```

### Production Deployment

```bash
# 1. Validate staging health (from previous step)
curl https://staging.opsiq.app/health

# 2. Schedule deployment
# - Avoid peak hours (usually 2-4 AM UTC)
# - Notify team 1 hour before
# - Ensure on-call engineer available

# 3. Verify deployment readiness
npm run validate:deployment

# 4. Tag release
git tag -a v1.2.4 -m "Production release: Features X, Y"
git push origin v1.2.4

# 5. Trigger production deployment
gh workflow run deploy-production.yml

# 6. Monitor deployment
# - Watch GitHub Actions logs
# - Monitor Sentry for errors
# - Monitor CloudWatch metrics
# - Check uptime monitoring

# 7. Post-deployment verification
curl https://opsiq.app/health
# Verify response 200 OK

# 8. Verify critical paths
# - Run post-deployment tests
# - Test 3-4 critical user flows manually

# 9. Communicate status
# - Update status page
# - Post in Slack #ops channel
# - Celebrate if successful! 🎉
```

### Rollback Procedure

**If critical issue detected post-deployment:**

```bash
# See: docs/ROLLBACK_PROCEDURE.md

# Quick version:
# 1. Assess severity (2 min)
# 2. Declare incident (1 min)
# 3. Backup state (2 min)
# 4. Execute rollback (5 min)
# 5. Verify health (5 min)
# 6. Resume operations (2 min)
# Total: ~15 minutes
```

---

## Common Issues & Resolution

### Issue: Database Connection Timeout

**Symptoms:**
- API returns 503 Service Unavailable
- Logs: `Error: connect timeout`
- High latency on database queries

**Resolution:**
```bash
# 1. Check database status
psql $DATABASE_URL -c "SELECT 1"

# 2. Check connection pool
psql $DATABASE_URL -c \
  "SELECT count(*) FROM pg_stat_activity"
# Should be < max_connections (default 100)

# 3. If pool exhausted, restart app servers
kubectl rollout restart deployment/opsiq

# 4. If still failing, check database CPU
gcloud sql instances describe opsiq-prod
# Check CPU % and connections

# 5. Scale up database if needed
# (Depends on cloud provider)
```

### Issue: High Memory Usage

**Symptoms:**
- Response time increasing
- OOM (Out of Memory) errors
- Container restarts

**Resolution:**
```bash
# 1. Check memory usage
kubectl top pods

# 2. Check for memory leaks
# (Depends on monitoring tool)

# 3. Identify leaky code
# - Check recent deployments
# - Review Sentry for patterns
# - Check Node memory profiler

# 4. Restart pod to free memory (temporary)
kubectl delete pod <pod-name>

# 5. Increase memory limit (permanent)
# Edit deployment manifest and redeploy
```

### Issue: High Error Rate

**Symptoms:**
- Sentry shows > 1% error rate
- User reports features broken
- Error alerts triggered

**Resolution:**
```bash
# 1. Check error types
curl https://your-sentry-dsn/api/events \
  ?statsPeriod=1h | jq '.[] | .error'

# 2. Check deployment timing
git log --oneline | head -5
# Did error rate spike after deployment?

# 3. If post-deployment:
# See: Rollback Procedure

# 4. If pre-deployment:
# Check infrastructure (database, network, etc.)

# 5. Check logs for patterns
# Grep logs for error keyword
# Look for stack traces or repeated errors
```

### Issue: Slow API Responses

**Symptoms:**
- p95 response time > 1 second
- User complaints about slowness
- Dashboard shows spike in latency

**Resolution:**
```bash
# 1. Check database query performance
# Enable slow query log:
psql $DATABASE_URL -c \
  "SET log_min_duration_statement = 1000"
# Then grep logs for slow queries

# 2. Check query count (N+1 detection)
# Use Sentry Performance to find N+1 queries

# 3. Add database index if needed
# Example: CREATE INDEX idx_actions_workspace 
# ON actions(workspace_id)

# 4. Check API endpoint bottleneck
# Profile the slow endpoint using:
# - Node.js profiler
# - Sentry performance monitoring
# - Application performance metrics

# 5. Scale horizontally if CPU-bound
kubectl scale deployment opsiq --replicas=3

# 6. Cache expensive computations
# (Depends on data freshness requirements)
```

---

## Incident Response

### Severity Levels

| Severity | Impact | Response Time | Example |
|----------|--------|----------------|---------|
| **Critical** | System down, data at risk | < 5 min | Authentication broken, data corruption |
| **Major** | Core feature broken | < 15 min | Cannot create actions, payments failing |
| **Minor** | Degraded experience | < 1 hour | Single endpoint slow, UI glitch |

### Incident Checklist

```
[ ] 1. Assess severity (what's broken, who's affected)
[ ] 2. Declare incident (notify team, #incidents channel)
[ ] 3. Assign incident commander (who's leading response)
[ ] 4. Establish bridge (Slack + optional Zoom)
[ ] 5. Investigate root cause (what's the actual problem)
[ ] 6. Execute fix or rollback
[ ] 7. Verify resolution (health checks, user testing)
[ ] 8. Communicate status (update status page)
[ ] 9. Post-incident review (prevent recurrence)
```

### Escalation Path

- **Tier 1 (on-call engineer):** < 5 min response
- **Tier 2 (engineering lead):** 15 min if Tier 1 cannot resolve
- **Tier 3 (CTO/VP Eng):** 30 min if customer data at risk

---

## Monitoring & Alerts

### Key Metrics to Monitor

```
Error Rate:
  - Alert if > 1% for 5 minutes
  - Critical if > 5% for any duration

Response Time (p95):
  - Alert if > 1 second for 10 minutes
  - Critical if > 5 seconds

Database:
  - Connection pool > 80%
  - Slow queries > 100ms
  - CPU > 80%

Server:
  - Memory > 85%
  - CPU > 80%
  - Disk > 90%
```

### Monitoring Tools

- **Error Tracking:** Sentry (URL: https://sentry.io/projects/opsiq)
- **Metrics:** CloudWatch or DataDog (depends on deployment platform)
- **Uptime:** Uptime Robot or similar (URL: https://status.opsiq.app)
- **Logs:** CloudWatch Logs or ELK Stack

### Viewing Metrics

```bash
# Sentry errors (last hour)
curl https://sentry.io/api/0/projects/opsiq/events \
  ?statsPeriod=1h | jq '.[] | {error, count}'

# CloudWatch metrics
aws cloudwatch get-metric-statistics \
  --metric-name ErrorCount \
  --namespace AWS/ApplicationELB \
  --start-time 2026-05-11T00:00:00Z \
  --end-time 2026-05-12T00:00:00Z \
  --period 300 \
  --statistics Sum
```

---

## Backup & Recovery

### Backup Schedule

| Type | Frequency | Retention | Location |
|------|-----------|-----------|----------|
| Full Database | Daily (2 AM UTC) | 30 days | S3/GCS |
| Transaction Log | Hourly | 7 days | S3/GCS |
| Application Code | Per deployment | Indefinite | GitHub + Docker Registry |

### Backup Verification

```bash
# Weekly: Test backup restoration
# Steps:
# 1. Restore backup to staging database
# 2. Verify data integrity (count all tables)
# 3. Run critical queries to ensure consistency
# 4. Delete test database

# Monthly: Full recovery test
# Steps:
# 1. Simulate production failure
# 2. Restore from backup (cold start)
# 3. Time the recovery (must be < RTO)
# 4. Verify all data present
```

### Recovery Procedure

```bash
# Database recovery (if corruption/loss)
# See: Rollback Procedure section

# Application recovery (if code issue)
# 1. Check recent deployments
# 2. Identify last good commit
# 3. Rollback using: kubectl rollout undo
# 4. Verify health

# Full system recovery (if all systems down)
# 1. Provision new infrastructure
# 2. Restore database from backup
# 3. Deploy application code
# 4. Update DNS if needed
# 5. Run smoke tests
```

---

## Performance Tuning

### Database Optimization

```bash
# Identify slow queries
SELECT * FROM pg_stat_statements 
WHERE mean_exec_time > 100 
ORDER BY total_exec_time DESC 
LIMIT 10;

# Add index for slow query
CREATE INDEX idx_table_column 
ON table(column) 
WHERE condition;

# Analyze query plan
EXPLAIN ANALYZE 
SELECT * FROM actions 
WHERE workspace_id = $1;
```

### Connection Pooling

- Use PgBouncer or similar for connection pooling
- Set max_connections to 20-30 per server
- Monitor connection wait times

### Caching Strategy

- Cache frequently accessed data (workspaces, users)
- Use Redis for session storage
- Set appropriate TTLs (1 hour for user data)
- Invalidate cache on mutations

### Application Tuning

- Enable gzip compression
- Minimize bundle size (tree-shake unused code)
- Optimize images (use WebP with JPEG fallback)
- Enable HTTP/2 at load balancer
- Use CDN for static assets

---

## On-Call Duties

### Daily Tasks
- [ ] Review error logs (Sentry)
- [ ] Check system health dashboard
- [ ] Review any customer-reported issues

### When Alerted
- [ ] Respond within 5 minutes
- [ ] Assess severity
- [ ] Escalate if needed
- [ ] Keep team informed
- [ ] Execute fix or rollback

### End of Week
- [ ] Review all incidents from week
- [ ] Update runbook with lessons learned
- [ ] Hand off context to next on-call

---

## Contact Information

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| CTO | | | |
| VP Engineering | | | |
| Tech Lead | | | |
| On-Call (Week of X) | | | |

**Status Page:** https://status.opsiq.app
**Incident Channel:** #incidents (Slack)
**On-Call Rotation:** (PagerDuty/OpsGenie link)

---

**Last Updated:** 2026-05-12
**Version:** 1.0
**Owner:** Engineering Team
