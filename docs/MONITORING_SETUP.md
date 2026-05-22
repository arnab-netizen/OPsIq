# Monitoring, APM, and Alerting Setup Guide

**Document:** Production Monitoring Configuration  
**Last Updated:** 2026-05-21  
**Owner:** DevOps / SRE Team  
**Severity:** P0 Blocker for Production Support

---

## Overview

OpsIQ requires three monitoring layers for production:

1. **Error Tracking** - Capture and alert on exceptions (Sentry, Rollbar, CloudWatch)
2. **APM/Metrics** - Track response times, throughput, database latency (Datadog, New Relic, CloudWatch)
3. **Alerting** - Notify team of issues (PagerDuty, Opsgenie, CloudWatch Alarms)

This document covers setup for major providers.

---

## Option A: AWS CloudWatch (Recommended for AWS deployments)

### Step 1: Create CloudWatch Log Group

```bash
# Create log group
aws logs create-log-group --log-group-name /opsiq/app

# Create retention policy (30 days for production)
aws logs put-retention-policy \
  --log-group-name /opsiq/app \
  --retention-in-days 30
```

### Step 2: Configure Application Logging

Set environment variables:

```bash
ENABLE_REQUEST_TRACING=true
LOG_LEVEL=info
LOG_FORMAT=json
```

Application automatically sends logs to CloudWatch if `CLOUDWATCH_ENABLED=true`:

```typescript
// src/infra/logger.ts
if (process.env.CLOUDWATCH_ENABLED === 'true') {
  // Logs sent to CloudWatch
}
```

### Step 3: Create CloudWatch Alarms

```bash
# Alert on error rate >5% (500+ errors in 5 min on avg 10k requests)
aws cloudwatch put-metric-alarm \
  --alarm-name opsiq-error-rate-high \
  --alarm-description "Alert if error rate exceeds 5%" \
  --metric-name ErrorCount \
  --namespace OpsIQ \
  --statistic Sum \
  --period 300 \
  --threshold 500 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 1 \
  --alarm-actions arn:aws:sns:us-east-1:123456789012:devops-alerts

# Alert on database latency >500ms
aws cloudwatch put-metric-alarm \
  --alarm-name opsiq-db-latency-high \
  --alarm-description "Alert if database latency exceeds 500ms" \
  --metric-name DatabaseLatency \
  --namespace OpsIQ \
  --statistic Average \
  --period 300 \
  --threshold 500 \
  --comparison-operator GreaterThanThreshold \
  --evaluation-periods 2
```

### Step 4: Create Dashboard

```bash
aws cloudwatch put-dashboard \
  --dashboard-name OpsIQ-Production \
  --dashboard-body file://dashboard.json
```

---

## Option B: Sentry (Error Tracking Only)

Recommended for: **Error tracking and alerting on exceptions**

### Step 1: Create Sentry Project

1. Go to https://sentry.io/auth/login/
2. Create organization if needed
3. Click **Projects** > **Create Project**
4. Select **Next.js**
5. Copy the **DSN** (looks like `https://xxx@yyy.ingest.sentry.io/123456`)

### Step 2: Install Sentry SDK

```bash
npm install @sentry/nextjs
```

### Step 3: Configure Sentry

Add to `next.config.js`:

```javascript
const { withSentryConfig } = require("@sentry/nextjs");

module.exports = withSentryConfig(
  {
    // ... existing next config
  },
  {
    org: "your-org",
    project: "opsiq",
    authToken: process.env.SENTRY_AUTH_TOKEN,
  }
);
```

### Step 4: Set Environment Variable

```bash
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/123456
```

### Step 5: Create Alert Rule

In Sentry Dashboard:
1. **Settings** > **Alerts**
2. **Create Alert Rule**
3. **Condition:** Error rate > 5%
4. **Actions:** Notify Slack or PagerDuty

---

## Option C: Datadog (Full Stack Monitoring)

Recommended for: **Everything (APM, logs, metrics, traces)**

### Step 1: Create Datadog Account

1. Go to https://www.datadoghq.com/
2. Sign up for account
3. Create organization
4. Generate API key in **Settings** > **API keys**

### Step 2: Install Datadog Packages

```bash
npm install @datadog/browser-rum @datadog/browser-logs
npm install @datadog/browser-fetch-polyfill  # For older browsers
```

### Step 3: Initialize Datadog in Application

Create `lib/datadog.ts`:

```typescript
import { datadogRum } from "@datadog/browser-rum";
import { datadogLogs } from "@datadog/browser-logs";

export function initDatadog() {
  if (typeof window === "undefined") return; // Skip on server

  datadogRum.init({
    applicationId: process.env.NEXT_PUBLIC_DATADOG_APP_ID || "",
    clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN || "",
    site: process.env.NEXT_PUBLIC_DATADOG_SITE || "datadoghq.com",
    service: "opsiq",
    env: process.env.NODE_ENV,
    version: process.env.npm_package_version,
    sessionSampleRate: 100,
    sessionReplaySampleRate: 20,
    trackUserInteractions: true,
    trackResources: true,
    trackLongTasks: true,
    defaultPrivacyLevel: "mask-user-input",
  });

  datadogRum.startSessionReplayRecording();

  datadogLogs.init({
    clientToken: process.env.NEXT_PUBLIC_DATADOG_CLIENT_TOKEN || "",
    site: process.env.NEXT_PUBLIC_DATADOG_SITE || "datadoghq.com",
    service: "opsiq",
    env: process.env.NODE_ENV,
  });
}
```

Initialize in `app/layout.tsx`:

```typescript
import { initDatadog } from "@/lib/datadog";

export default function RootLayout() {
  useEffect(() => {
    initDatadog();
  }, []);

  return <html>{/* ... */}</html>;
}
```

### Step 4: Set Environment Variables

```bash
NEXT_PUBLIC_DATADOG_APP_ID=your-app-id
NEXT_PUBLIC_DATADOG_CLIENT_TOKEN=your-client-token
NEXT_PUBLIC_DATADOG_SITE=datadoghq.com
```

### Step 5: Create Monitors

In Datadog Dashboard:
1. **Monitors** > **New Monitor**
2. **Type:** Metric
3. **Metric:** `trace.web.request.duration`
4. **Condition:** `avg(last_5m) > 2000` (2 seconds)
5. **Alert:** Notify team

---

## Option D: New Relic (Full Stack Monitoring)

Recommended for: **Enterprise deployments**

### Step 1: Create New Relic Account

1. Go to https://newrelic.com/
2. Create organization
3. Create APM application
4. Copy **License Key**

### Step 2: Install New Relic Agent

```bash
npm install @newrelic/next
```

### Step 3: Configure New Relic

Create `newrelic.js` in root:

```javascript
exports.config = {
  app_name: ["opsiq"],
  license_key: process.env.NEW_RELIC_LICENSE_KEY,
  logging: {
    level: "info",
  },
  distributed_tracing: {
    enabled: true,
  },
};
```

Import in `server.ts` or startup script:

```typescript
require("newrelic");
```

### Step 4: Set Environment Variable

```bash
NEW_RELIC_LICENSE_KEY=your-license-key
```

---

## Recommended Alert Configuration

### Critical Alerts (Page on-call immediately)

```
1. Error rate > 10% for >5 minutes
2. Database unavailable (connection failures)
3. Payment processing failing (webhook delivery fails)
4. Application not responding (health check fails)
```

### Warning Alerts (Notify Slack only)

```
1. Error rate 5-10%
2. Response time p95 > 2 seconds
3. Database latency > 500ms
4. Memory usage > 80%
5. Disk usage > 85%
```

### Info Alerts (Log only)

```
1. Deployment started
2. Deployment completed
3. Database backup created
4. Migration deployed
```

---

## Health Check Endpoints for Monitoring

OpsIQ provides three health endpoints:

### 1. Liveness Check

```bash
GET /api/liveness
```

Returns 200 if application is running (even if unhealthy).

**Use for:** Kubernetes liveness probe, restart if unhealthy

### 2. Readiness Check

```bash
GET /api/ops/readiness
```

Returns 200 only if application is fully ready to serve traffic.

**Use for:** Kubernetes readiness probe, remove from load balancer if unhealthy

### 3. Health Check

```bash
GET /api/health
```

Returns detailed health information:

```json
{
  "status": "healthy",
  "checks": {
    "database": {
      "status": "healthy",
      "latencyMs": 45
    },
    "memory": {
      "status": "healthy",
      "usage": "45%"
    },
    "uptime": {
      "status": "healthy",
      "uptimeSeconds": 3600
    },
    "runtime": {
      "status": "healthy",
      "nodeVersion": "v18.0.0",
      "environment": "production"
    }
  }
}
```

**Use for:** Manual health checks, monitoring dashboards

---

## Configure Health Checks in Monitoring Tools

### Datadog

```python
# Create HTTP monitor
from datadog import initialize, api

options = {
    "api_key": os.environ["DD_API_KEY"],
    "app_key": os.environ["DD_APP_KEY"],
}

initialize(**options)

monitor = {
    "type": "service check",
    "query": 'http_check.http.can_connect{"url":"https://yourdomain.com/api/health"}.last("5m")',
    "name": "OpsIQ Health Check",
    "message": "OpsIQ health check failed. @pagerduty",
    "tags": ["env:production", "service:opsiq"],
}

api.Monitor.create(**monitor)
```

### AWS CloudWatch

```bash
aws cloudwatch put-metric-alarm \
  --alarm-name opsiq-health-check \
  --alarm-description "Health check for OpsIQ" \
  --metric-name HealthCheckStatus \
  --namespace AWS/ApplicationELB \
  --statistic Average \
  --period 60 \
  --threshold 1 \
  --comparison-operator LessThanThreshold
```

---

## Database Monitoring

### Monitor Connection Pool

```sql
-- Check active connections
SELECT count(*) as active_connections FROM pg_stat_activity WHERE state = 'active';

-- Alert if > 50 connections (adjust for your pool size)
-- Set pool size to 2x + 10 of expected concurrent users
```

### Monitor Slow Queries

```sql
-- Find queries taking >1 second
SELECT query, mean_exec_time 
FROM pg_stat_statements 
WHERE mean_exec_time > 1000 
ORDER BY mean_exec_time DESC;
```

Enable `pg_stat_statements` extension:

```sql
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;
```

---

## Logging Best Practices

### Structured Logging Format

OpsIQ uses JSON structured logging:

```json
{
  "timestamp": "2026-05-21T10:30:45.123Z",
  "level": "INFO",
  "message": "User created",
  "userId": "user_123",
  "workspaceId": "ws_456",
  "context": "user-signup",
  "duration_ms": 45
}
```

**Benefits:**
- Machine-parseable (easy to search/analyze)
- Includes context (user ID, workspace ID)
- Includes duration for performance tracking
- Structured fields for filtering

### Log Levels

- **DEBUG:** Verbose development logs (disable in production)
- **INFO:** Important business events (user signup, engagement created)
- **WARN:** Unexpected but recoverable errors (rate limit hit, retry needed)
- **ERROR:** Errors that need attention (database error, webhook failed)
- **CRITICAL:** System-down errors (cannot start app, all requests fail)

### Set Log Level for Production

```bash
LOG_LEVEL=info  # Hide debug logs, show INFO and above
```

---

## Metrics to Monitor

### Application Metrics

```
✓ Request latency (p50, p95, p99)
✓ Error rate (5xx, 4xx)
✓ Requests per second
✓ Active connections
✓ Response size distribution
```

### Business Metrics

```
✓ Workspaces created
✓ Engagements created
✓ Actions completed
✓ Decisions exported
✓ Stripe webhooks received
✓ Subscription activations
```

### Infrastructure Metrics

```
✓ CPU usage
✓ Memory usage
✓ Disk usage
✓ Network I/O
✓ Database connections
✓ Database query latency
✓ Connection pool utilization
```

---

## Production Checklist

Before going live:

- [ ] Error tracking configured (Sentry or CloudWatch)
- [ ] APM/metrics tool selected and integrated (Datadog, New Relic, or CloudWatch)
- [ ] Log aggregation configured (CloudWatch Logs or Datadog)
- [ ] Health endpoints returning valid data
- [ ] Critical alerts configured (error rate, database, webhooks)
- [ ] Warning alerts configured (latency, memory, disk)
- [ ] On-call rotation in place (PagerDuty/Opsgenie)
- [ ] Dashboard created for monitoring
- [ ] Team trained on reading metrics and alerts
- [ ] Escalation procedures documented

---

## Recommended Monitoring Stack

For most deployments, we recommend:

| Layer | Tool | Reason |
|-------|------|--------|
| Error Tracking | Sentry | Easiest to setup, excellent JavaScript support |
| APM | Datadog | Covers everything, great documentation |
| Logs | Datadog | Integrated with APM, great search |
| Alerting | PagerDuty | Industry standard, good integration |

**Cost estimate:** $300-500/month for small team

---

## References

- [Sentry Next.js Documentation](https://docs.sentry.io/platforms/javascript/guides/nextjs/)
- [Datadog APM for Node.js](https://docs.datadoghq.com/tracing/setup_overview/setup/nodejs/)
- [New Relic Node.js Agent](https://docs.newrelic.com/docs/agents/nodejs-agent/getting-started/introduction-new-relic-nodejs/)
- [AWS CloudWatch Documentation](https://docs.aws.amazon.com/cloudwatch/)
- [PagerDuty Integration Guide](https://support.pagerduty.com/docs/integrations)

---

**Questions?** Contact DevOps team.
