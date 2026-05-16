# STAGING VERIFICATION CHECKLISTS

## RP4: Staging Readiness Verification Package

All checklists must be completed BEFORE production deployment.

---

## 1. STAGING VERIFICATION CHECKLIST

### Pre-Deployment

- [ ] Code merged to main branch
- [ ] All CI tests passing (GitHub Actions green)
- [ ] Security scanner passing (0 unprotected routes)
- [ ] TypeScript compilation successful
- [ ] Prisma schema validates
- [ ] All environment variables documented in `.env.example`
- [ ] Secrets (STRIPE_API_KEY, STRIPE_WEBHOOK_SECRET) stored in staging vault
- [ ] Database backups configured for staging
- [ ] Monitoring/alerting configured and tested
- [ ] PagerDuty/incident response configured
- [ ] Team on-call rotation confirmed

### Database Setup

- [ ] PostgreSQL 16 running on staging
- [ ] DATABASE_URL configured and valid
- [ ] `npx prisma migrate deploy` executed successfully
- [ ] All migrations applied without error
- [ ] Seed data loaded (if applicable)
- [ ] Database user permissions verified (non-root, least privilege)
- [ ] Connection pool settings optimized for staging load
- [ ] Backup automated (daily or per policy)
- [ ] Restore test performed (can restore from backup)

### Application Deployment

- [ ] Latest code deployed to staging environment
- [ ] All environment variables loaded correctly
- [ ] Next.js build successful (`npm run build`)
- [ ] Server started without errors
- [ ] Startup logs show "ready - started server on 0.0.0.0:3000"
- [ ] No startup warnings or errors
- [ ] Memory usage stable after startup
- [ ] CPU usage minimal at idle

### Smoke Tests

- [ ] `GET /api/health` returns 200
- [ ] `GET /api/readiness` returns 200
- [ ] `GET /api/liveness` returns 200
- [ ] `/api/startup` completes without error
- [ ] Database connectivity confirmed (can write/read test data)
- [ ] All 144 routes compile without errors
- [ ] Non-DB tests pass (358 growth tests)
- [ ] Route scanner: 0 unprotected routes outside exemptions

### Security Verification

- [ ] All 135 protected routes have auth enforcement
- [ ] 9 exempted routes documented (health, startup, public, auth, webhook)
- [ ] Unauthenticated requests return 401 (not 500)
- [ ] Missing capability returns 403 (not 500)
- [ ] Workspace isolation enforced (cross-workspace request blocked)
- [ ] DTO boundaries enforced (no internal field leakage)
- [ ] CORS headers correct for staging domain
- [ ] CSP headers configured
- [ ] HTTPS enforced (if applicable)
- [ ] Rate limiting active and tested

### Stripe Integration

- [ ] STRIPE_API_KEY set to test account key
- [ ] STRIPE_WEBHOOK_SECRET set to staging webhook secret
- [ ] Webhook endpoint registered in Stripe dashboard
- [ ] Test webhook delivery successful (can send sample event)
- [ ] Signature verification working (invalid signature returns 401)
- [ ] Idempotency key implementation prevents duplicates
- [ ] Stripe test charge creates subscription
- [ ] Webhook delivery retries after failure

### Data Integrity

- [ ] No cross-workspace data leakage observed
- [ ] Audit trail populated for operations
- [ ] Event sourcing replay produces identical state
- [ ] Snapshots restore correctly
- [ ] Projection rebuild matches materialized data

---

## 2. MIGRATION ROLLBACK CHECKLIST

### Before Rollback

- [ ] Reason for rollback documented
- [ ] Affected data identified
- [ ] Rollback impact assessed
- [ ] Team notified
- [ ] Stakeholders informed of timeline
- [ ] Backup confirmed available
- [ ] Rollback command tested in dev

### Rollback Execution

- [ ] Take database snapshot (pre-rollback state)
- [ ] `npx prisma migrate resolve --rolled-back <migration_name>`
- [ ] Verify previous migration state
- [ ] Revert application code to previous version
- [ ] Restart application
- [ ] Verify `/api/health` responding
- [ ] Verify database state correct
- [ ] Run smoke tests

### Post-Rollback

- [ ] Application functioning normally
- [ ] No errors in logs
- [ ] Data integrity verified
- [ ] Users notified of status
- [ ] Root cause analysis started
- [ ] Staging deployment halted pending fix
- [ ] Fix implemented and tested in dev before retry

---

## 3. RUNTIME ENVIRONMENT CHECKLIST

### Node.js & Runtime

- [ ] Node.js version matches .nvmrc (v22.x)
- [ ] npm version >= 10.x
- [ ] NODE_ENV=production
- [ ] Memory limit set appropriately (2GB+ recommended)
- [ ] CPU allocation verified (2+ cores recommended)
- [ ] Timezone set to UTC

### Environment Variables

- [ ] DATABASE_URL configured
- [ ] DATABASE_URL_TEST configured (if using separate test DB)
- [ ] STRIPE_API_KEY set
- [ ] STRIPE_WEBHOOK_SECRET set
- [ ] SECRET_KEY set (for session encryption)
- [ ] NODE_ENV=production
- [ ] LOG_LEVEL set (recommend "info" for staging)
- [ ] All vars in `.env.example` accounted for

### File System

- [ ] `/tmp` writeable (for session store if using temp)
- [ ] Disk space > 10GB available
- [ ] Disk I/O benchmarked (no bottlenecks)
- [ ] Logs directory exists and writeable
- [ ] Permission model: least privilege (no world-writeable)

### Network

- [ ] Inbound traffic from load balancer allowed
- [ ] Outbound traffic to PostgreSQL allowed
- [ ] Outbound traffic to Stripe API allowed
- [ ] Outbound traffic to email service allowed (if sending emails)
- [ ] DNS resolution working
- [ ] NTP synchronized (time critical for webhook verification)

---

## 4. OBSERVABILITY CHECKLIST

### Logs

- [ ] Log shipping configured (CloudWatch, DataDog, etc.)
- [ ] Logs include correlation ID
- [ ] Logs exclude sensitive data (passwords, tokens)
- [ ] Log level appropriate (info for staging, debug only if needed)
- [ ] Log retention policy set (30 days recommended)
- [ ] Log searching/filtering working

### Metrics

- [ ] Metrics collection active (Prometheus, CloudWatch, etc.)
- [ ] Request latency histogram tracked
- [ ] Error rate histogram tracked
- [ ] Database query latency tracked
- [ ] Memory usage monitored
- [ ] CPU usage monitored
- [ ] Disk usage monitored
- [ ] Connection pool metrics visible

### Alerts

- [ ] Alert: Error rate > 5% → page on-call
- [ ] Alert: Response latency p99 > 2s → page on-call
- [ ] Alert: Database unavailable → page on-call
- [ ] Alert: Memory > 90% → page on-call
- [ ] Alert: Disk > 90% → page on-call
- [ ] Alert: Stripe webhook failures > 10 → page on-call
- [ ] Alert: 5xx error rate > 1% → page on-call

### Tracing

- [ ] Distributed tracing enabled (optional but recommended)
- [ ] Trace sampling rate appropriate (10% for staging)
- [ ] Correlation IDs propagated across services
- [ ] Async operations traced
- [ ] Database queries traced

---

## 5. BACKUP & RESTORE DRILL CHECKLIST

### Backup Configuration

- [ ] Automated backups running daily
- [ ] Backup storage encrypted
- [ ] Backup retention policy set (30 days recommended)
- [ ] Point-in-time recovery available
- [ ] Off-site backup replication (if applicable)

### Restore Test

- [ ] Create test restore in isolated environment
- [ ] Verify restored data integrity
- [ ] Verify restored state matches original
- [ ] Measure restore duration
- [ ] Document restore procedure
- [ ] Restore test passed: [ ] Date: _______________

### Disaster Recovery

- [ ] RTO (Recovery Time Objective) defined: _______ minutes
- [ ] RPO (Recovery Point Objective) defined: _______ minutes
- [ ] Disaster recovery plan documented
- [ ] Team trained on recovery procedures
- [ ] Recovery runbook reviewed quarterly

---

## 6. STRIPE TEST-MODE UAT CHECKLIST

### Stripe Account

- [ ] Stripe test account created
- [ ] STRIPE_API_KEY (test mode) configured
- [ ] STRIPE_WEBHOOK_SECRET (test mode) configured
- [ ] Webhook endpoint registered in Stripe dashboard

### Test Scenarios

- [ ] Create test subscription with test card
  - [ ] Card: 4242 4242 4242 4242
  - [ ] Expiry: Any future date
  - [ ] CVC: Any 3 digits
- [ ] Subscription status transitions
  - [ ] pending → active
  - [ ] active → past_due
  - [ ] past_due → active (after payment)
  - [ ] active → canceled
- [ ] Webhook delivery for all event types
  - [ ] customer.created
  - [ ] customer.subscription.created
  - [ ] customer.subscription.updated
  - [ ] customer.subscription.deleted
  - [ ] invoice.created
  - [ ] invoice.paid
  - [ ] invoice.payment_failed
- [ ] Idempotency: send same webhook twice
  - [ ] Second delivery doesn't create duplicate
  - [ ] System returns 200 with duplicate flag
- [ ] Timeout handling: webhook takes > 30s
  - [ ] Stripe retries after timeout
  - [ ] Idempotency prevents double-processing
- [ ] Signature verification: forge invalid signature
  - [ ] System returns 401
  - [ ] No processing occurs
- [ ] Quota enforcement: exceed subscription limits
  - [ ] System returns 429 (too many requests)
  - [ ] Operation blocked

### Entitlement Sync

- [ ] Subscription created → entitlement enabled
- [ ] Subscription canceled → entitlement disabled
- [ ] Subscription downgraded → capabilities reduced
- [ ] Subscription upgraded → new capabilities enabled
- [ ] Quota limits enforced per tier

---

## 7. INCIDENT RESPONSE CHECKLIST

### Incident Detection

- [ ] Alert triggered and acknowledged
- [ ] Severity assessed (P0/P1/P2/P3)
- [ ] On-call engineer notified
- [ ] Stakeholders notified

### Initial Response (0-15 min)

- [ ] Incident channel created (Slack, PagerDuty, etc.)
- [ ] Timeline started
- [ ] Command center established
- [ ] Triage performed
  - [ ] Is system degraded or fully down?
  - [ ] How many users affected?
  - [ ] Is customer data at risk?

### Mitigation (15-30 min)

- [ ] Rollback decision made or alternative mitigation
- [ ] Rollback executed (if needed)
- [ ] System restored to previous state
- [ ] Monitoring confirms recovery
- [ ] Stakeholders updated

### Resolution (30+ min)

- [ ] Root cause identified
- [ ] Permanent fix developed
- [ ] Fix tested in dev/staging
- [ ] Deployed to production
- [ ] Monitoring confirms success

### Post-Incident

- [ ] Timeline documented
- [ ] Root cause analysis completed
- [ ] Action items assigned
- [ ] Post-mortem scheduled (within 48 hours)
- [ ] Learnings documented
- [ ] Preventive measures implemented

---

## 8. DEPLOYMENT SMOKE-TEST CHECKLIST

### Pre-Deployment

- [ ] Code reviewed and approved
- [ ] All CI checks passing
- [ ] No emergency hotfixes pending
- [ ] Deployment window agreed with team
- [ ] Rollback plan confirmed

### Deployment Execution

- [ ] Maintenance mode enabled (if applicable)
- [ ] Database migrations run successfully
- [ ] Application deployed
- [ ] No errors in deployment logs
- [ ] Application process started successfully
- [ ] Memory usage stable
- [ ] CPU usage stable

### Post-Deployment Smoke Tests

- [ ] `GET /api/health` returns 200
- [ ] `GET /api/readiness` returns 200
- [ ] `GET /api/liveness` returns 200
- [ ] Database connectivity verified
- [ ] Authentication working
- [ ] Authorization working
- [ ] Stripe integration functional
- [ ] Webhooks receiving events
- [ ] Logs flowing normally
- [ ] Metrics flowing normally
- [ ] Alerts configured correctly
- [ ] No increase in error rate

### User-Facing Verification

- [ ] Can create account
- [ ] Can login
- [ ] Can create decision
- [ ] Can view dashboard
- [ ] Can receive notifications (if applicable)
- [ ] Can export data (if applicable)

### Maintenance Mode Disable

- [ ] All smoke tests passed
- [ ] Team ready for user traffic
- [ ] Maintenance mode disabled
- [ ] Users notified deployment complete

---

## Verification Sign-Off

| Role | Name | Date | Signature |
|------|------|------|-----------|
| DevOps Lead | _____________ | _____ | _____________ |
| Security Lead | _____________ | _____ | _____________ |
| Product Manager | _____________ | _____ | _____________ |
| Engineering Lead | _____________ | _____ | _____________ |

---

**Ready for Production Deployment**: [ ] YES [ ] NO

**Blockers or Concerns**:
```
[Document any remaining issues or concerns]
```

**Date Approved**: __________________
