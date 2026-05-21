# OpsIQ Deployment Readiness - P0 DevOps Audit

**Last Updated:** 2026-05-21  
**Status:** CODE_GOVERNANCE_READY_DEPLOYMENT_OPS_BLOCKED  
**Audience:** DevOps, Engineering Leadership, Product Management

---

## Executive Summary

OpsIQ main branch (commit `afdf004`) has **CODE GOVERNANCE GATES PASSING** (governance strict, tsc, prisma validate all PASS). **DEPLOYMENT IS BLOCKED ON 7 P0 EXTERNAL INFRASTRUCTURE BLOCKERS** that require provisioning and configuration outside the repository. These are operational prerequisites, not code defects.

**This document is a roadmap for external DevOps setup. Do not claim production-ready until all 7 blockers are verified complete.**

### Status by Dimension

| Dimension | Status | Details |
|-----------|--------|---------|
| **Code Governance** | ✓ PASS | Governance strict=PASS, tsc=PASS, prisma validate=PASS |
| **TypeScript** | ✓ PASS | Zero type errors |
| **Prisma Schema** | ✓ PASS | Valid, 37 migrations defined |
| **Auth Governance** | ✓ PASS | 135/144 routes protected, 9 exempt with justification |
| **Build** | ⚠ BLOCKED | Requires DATABASE_URL (expected, documented) |
| **Database** | ✗ EXTERNAL BLOCKER | Requires provisioning (Neon, RDS, Supabase, etc.) |
| **Secrets Management** | ✗ EXTERNAL BLOCKER | Requires secrets manager configuration |
| **Stripe Webhooks** | ✗ EXTERNAL BLOCKER | Requires Stripe dashboard registration |
| **Monitoring Setup** | ✗ EXTERNAL BLOCKER | Requires Sentry/Datadog/CloudWatch integration |
| **Rollback Procedure** | ⚠ DOCUMENTED | Procedures defined, need testing in staging |
| **Smoke Tests** | ✓ READY | Suite created, automation defined |

---

## The 7 P0 Operational Blockers

### 1. Database Provisioning and DATABASE_URL
**Status:** FAIL (requires external setup)  
**Blocker:** Application fails to build/start without DATABASE_URL  
**What's Required:**
- [ ] Provision PostgreSQL database (Neon, Supabase, RDS, or self-managed)
- [ ] Generate connection string with sslmode=require
- [ ] Set DATABASE_URL environment variable in production secrets
- [ ] Verify connectivity: `psql $DATABASE_URL -c "SELECT 1"`

**Timeline:** 2-3 hours (procurement + provisioning)  
**Owner:** DevOps / Infrastructure  
**Doc:** `.env.example`, `docs/DEPLOYMENT_READINESS.md`

---

### 2. Prisma Migration Deployment Procedure
**Status:** PARTIAL (procedure defined, not yet executed)  
**Blocker:** Migrations must be applied before app can access database  
**What's Required:**
- [ ] Backup production database before deployment
- [ ] Run `npx prisma migrate deploy` during deployment pipeline
- [ ] Verify all 37 migrations apply without error
- [ ] Verify database schema matches code

**Timeline:** Automated, <2 minutes during deployment  
**Owner:** DevOps / CI/CD  
**Doc:** `docs/MIGRATION_DEPLOYMENT_RUNBOOK.md`

---

### 3. Environment Variables and Secrets Management
**Status:** PARTIAL (.env.example incomplete for production)  
**Blocker:** Application needs 12+ environment variables, some secrets  
**What's Required:**
- [ ] Update `.env.example` with all required production variables ✓ (DONE)
- [ ] Set up secrets manager (AWS Secrets Manager, GitHub Secrets, etc.)
- [ ] Configure each variable:
  - DATABASE_URL
  - AUTH_SECRET (random 32+ chars)
  - STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET
  - LOG_LEVEL (production=info or warn)
  - SENTRY_DSN (optional, for error tracking)
  - Plus 6 others (see `.env.example`)
- [ ] Verify no secrets in .env files (only in secrets manager)
- [ ] Run `npm run validate:deployment` at startup

**Timeline:** 1-2 hours (setup + verification)  
**Owner:** DevOps / Security  
**Doc:** `.env.example`, `docs/DEPLOYMENT_READINESS.md`

---

### 4. Stripe Billing and Webhook Runtime Readiness
**Status:** PARTIAL (code ready, Stripe account setup incomplete)  
**Blocker:** Payment processing fails without live Stripe webhook registration  
**What's Required:**
- [ ] Get Stripe account live API keys (sk_live_*, pk_live_*)
- [ ] Register webhook endpoint: `https://yourdomain.com/api/webhooks/stripe`
- [ ] Select events: customer.*, subscription.*, payment_intent.*
- [ ] Copy webhook signing secret (whsec_*)
- [ ] Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET env vars
- [ ] Test webhook delivery from Stripe dashboard
- [ ] Verify webhook is processed (check logs)

**Timeline:** 30-45 minutes (manual setup + verification)  
**Owner:** DevOps / Finance  
**Doc:** `docs/STRIPE_WEBHOOK_SETUP.md`

---

### 5. Monitoring, APM, Logging, and Alerting
**Status:** UNKNOWN (infrastructure stubs in code, no external tool configured)  
**Blocker:** Cannot debug production issues or alert on failures without monitoring  
**What's Required:**
- [ ] Choose monitoring stack (Sentry + Datadog recommended)
  - Error tracking: Sentry or CloudWatch
  - APM: Datadog, New Relic, or CloudWatch
  - Log aggregation: CloudWatch Logs or Datadog
  - Alerting: PagerDuty or CloudWatch Alarms
- [ ] Configure integrations (npm install, API keys)
- [ ] Create critical alerts:
  - Error rate >5% for >5 min
  - Database unavailable
  - Webhook failures
  - Health check fails
- [ ] Create warning alerts:
  - Error rate 5-10%
  - Response time p95 >2s
  - Memory >80%
  - Disk >85%
- [ ] Set up on-call rotation (PagerDuty/Opsgenie)

**Timeline:** 4-6 hours (tool selection + integration + alert configuration)  
**Owner:** DevOps / SRE  
**Doc:** `docs/MONITORING_SETUP.md`

---

### 6. Rollback Procedure
**Status:** UNKNOWN (documented, needs testing)  
**Blocker:** Failed deployment cannot be reversed without tested rollback plan  
**What's Required:**
- [ ] Document rollback steps (✓ DONE - see `docs/ROLLBACK_RUNBOOK.md`)
- [ ] Test rollback in staging environment
  - Deploy broken version to staging
  - Execute rollback procedure
  - Verify rollback works
  - Record any issues
- [ ] Validate backup/restore works
- [ ] Measure rollback RTO (target: <15 minutes)
- [ ] Brief team on rollback procedures

**Timeline:** 2-3 hours (testing + validation)  
**Owner:** DevOps  
**Doc:** `docs/ROLLBACK_RUNBOOK.md`

---

### 7. Production Smoke Tests and Health Checks
**Status:** PARTIAL (health endpoints ready, automated smoke suite defined)  
**Blocker:** Cannot verify deployment success without post-deployment tests  
**What's Required:**
- [ ] Validate health check endpoints work:
  - `GET /api/health` (detailed checks)
  - `GET /api/ops/readiness` (ready for traffic)
  - `GET /api/liveness` (process alive)
- [ ] Run automated smoke tests: `npm run smoke:prod` ✓ (SCRIPT READY)
- [ ] Verify critical flows work:
  - Create workspace
  - Create engagement
  - Create action
  - Export decision
- [ ] Manual UI testing in browser
- [ ] Stripe webhook delivery test
- [ ] Monitor for 1 hour post-deployment

**Timeline:** 10-15 minutes (manual) + 1 hour monitoring  
**Owner:** QA / DevOps  
**Doc:** `docs/PRODUCTION_SMOKE_TESTS.md`, `scripts/smoke-tests.ts`

---

## Deployment Readiness by Infrastructure Type

### For AWS (ECS/EC2 + RDS)

```
1. Create RDS PostgreSQL instance
   - Engine: PostgreSQL 14+
   - Instance type: db.t3.medium (production) or db.t3.micro (staging)
   - Storage: 20GB (can auto-scale)
   - Multi-AZ: Yes (for production)
   - Backup: 7 days retention
   - Estimated cost: $50-150/month

2. Create VPC security group
   - Allow port 5432 from app subnet
   - Deny all other inbound

3. Create secrets in AWS Secrets Manager
   - DATABASE_URL
   - AUTH_SECRET
   - STRIPE_SECRET_KEY
   - STRIPE_WEBHOOK_SECRET

4. Create CloudWatch log group
   - /opsiq/app
   - 30-day retention

5. Configure ECS task definition
   - Set environment variables from Secrets Manager
   - Set DATABASE_URL from Secrets Manager
   - Set log driver to CloudWatch

6. Deploy with Terraform or CloudFormation
   See: ./infrastructure/terraform/main.tf (if exists)
```

### For Vercel

```
1. Push code to GitHub (main branch)

2. Create Vercel project
   - Link GitHub repository
   - Select Next.js framework

3. Configure environment variables
   - DATABASE_URL (PostgreSQL connection)
   - AUTH_SECRET
   - STRIPE_* keys
   - SENTRY_DSN

4. Configure custom domain
   - Add domain in Vercel dashboard
   - Update DNS to point to Vercel

5. Deploy
   - Push to main
   - Vercel auto-deploys

6. Add database
   - Neon, Supabase, or managed PostgreSQL
   - Connection string goes in DATABASE_URL

Note: Vercel doesn't support background jobs out of the box.
      For webhooks/background jobs, consider:
      - Railway for background workers
      - AWS Lambda for webhook processing
      - or run separate worker service
```

### For Docker + Kubernetes

```
1. Build Docker image
   - Dockerfile: npm ci && npm run build
   - Image registry: Docker Hub, ECR, GCR

2. Create PostgreSQL deployment
   - Kubernetes StatefulSet or managed service (RDS/Cloud SQL)
   - PVC for persistence
   - Backup cronjob

3. Create Kubernetes secrets
   - database-url
   - auth-secret
   - stripe-secret-key
   - stripe-webhook-secret

4. Deploy application
   - Deployment manifest with replica count
   - Service for load balancing
   - Ingress for TLS/HTTPS

5. Configure monitoring
   - Prometheus ServiceMonitor
   - Grafana dashboards
   - Alert rules

See: ./infrastructure/kubernetes/ (if exists)
```

---

## Critical Path to Production

### Week 1-2: Infrastructure Setup

```
Day 1:
  - [ ] Decide infrastructure (AWS/Vercel/self-managed)
  - [ ] Procure database (RDS provisioning takes 5-10 min)
  - [ ] Create secrets manager account
  
Day 2-3:
  - [ ] Configure PostgreSQL
  - [ ] Set DATABASE_URL, test connectivity
  - [ ] Generate AUTH_SECRET
  - [ ] Get Stripe API keys from Stripe dashboard
  - [ ] Set all environment variables in secrets manager
  
Day 4-5:
  - [ ] Set up error tracking (Sentry account)
  - [ ] Set up APM monitoring (Datadog trial account)
  - [ ] Configure alert rules in monitoring
  - [ ] Brief team on alerts and on-call
  
Day 6-7:
  - [ ] Test rollback procedure in staging
  - [ ] Create backup and restore test
  - [ ] Document any issues
```

### Week 2-3: Deployment Readiness

```
Day 8:
  - [ ] Run all validation checks locally
  - [ ] Deploy to staging
  - [ ] Run smoke tests in staging
  - [ ] 48-hour monitoring window (watch for issues)
  
Day 9-10:
  - [ ] Fix any staging issues
  - [ ] Final security review
  - [ ] Create deployment runbook specific to your infra
  
Day 11-12:
  - [ ] Schedule production maintenance window
  - [ ] Notify customer support/success
  - [ ] Prepare customer communication
  - [ ] Brief engineering team
  
Day 13-14:
  - [ ] DEPLOYMENT DAY
  - [ ] Run smoke tests (expected: all pass)
  - [ ] Monitor for 1 hour
  - [ ] Monitor for 24 hours
```

---

## Deployment Checklist (Copy & Print)

```
PRODUCTION DEPLOYMENT SIGN-OFF
Date: ___________  Time: ___________

PRE-DEPLOYMENT (Day Before)
 [ ] Latest code tested in staging for 48 hours
 [ ] Rollback procedure tested and documented
 [ ] Database backup created and verified
 [ ] All environment variables configured in secrets manager
 [ ] Monitoring alerts configured and tested
 [ ] Team notified of maintenance window
 [ ] Status page updated to "investigating"
 [ ] Customer communication prepared

DEPLOYMENT EXECUTION
 [ ] Database backup created (immediate pre-deployment)
 [ ] Deploy code: git push origin main
 [ ] CI pipeline: All checks pass
 [ ] Run migrations: npx prisma migrate deploy
 [ ] Start application
 [ ] Health check: curl /api/health (should return 200)
 [ ] Run smoke tests: npm run smoke:prod

POST-DEPLOYMENT (Immediate)
 [ ] All smoke tests passed
 [ ] Error rate < 1%
 [ ] Response time p95 < 500ms
 [ ] No ERROR logs in app logs
 [ ] Stripe webhooks processing
 [ ] Database latency < 200ms

POST-DEPLOYMENT (1 Hour)
 [ ] Still healthy
 [ ] No customer reports
 [ ] Monitoring shows normal traffic

POST-DEPLOYMENT (24 Hours)
 [ ] No unexpected errors
 [ ] No performance degradation
 [ ] Backup completed successfully

SIGN-OFF
Technical Lead:  __________________ Date: _________
DevOps Engineer: __________________ Date: _________
On-Call Lead:    __________________ Date: _________
Product Manager: __________________ Date: _________

Status: [ ] Successful [ ] Rolled Back
```

---

## Estimated Timeline and Costs

### Timeline

```
Week 0 (Prep):     Infrastructure setup, secrets, monitoring (5-7 days)
Week 1 (Staging):  Deploy to staging, validate, monitor (2-3 days)
Week 2 (Go-Live):  Production deployment (1 day)
Total:             ~10-14 business days
```

### Costs (Monthly Estimate)

```
Database (RDS PostgreSQL t3.medium):    $50-150
Monitoring (Sentry + Datadog):          $300-500
Load Balancer / CDN:                    $20-100
Backup Storage (AWS S3):                $1-5
Domain + SSL:                           $15-50
On-Call Platform (PagerDuty):           $30-100
Miscellaneous:                          $50
────────────────────────────────────────────────
Total:                                  ~$500-1,000/month
```

---

## For DevOps Operators: External Deployment Execution Checklist

**See:** `docs/EXTERNAL_DEPLOYMENT_EXECUTION_CHECKLIST.md`

This document provides a practical, step-by-step checklist for executing the 7 P0 external infrastructure blockers:

- Phase 1: Planning (Day 1)
- Phase 2: Database provisioning (Days 2-3)
- Phase 3: Environment variables (Days 2-4)
- Phase 4: Stripe webhook registration (Days 3-4)
- Phase 5: Monitoring setup (Days 4-5)
- Phase 6: Staging deployment (Days 6-8)
- Phase 7: Migration deployment (Day of release)
- Phase 8: Production deployment (Day of release)
- Phase 9: Final go/no-go checklist

**⚠️ CRITICAL:** Do NOT claim production-ready until all items are verified complete.

---

## What's Already Done ✓

The engineering team has completed:

```
✓ Code passes all governance gates
✓ Zero TypeScript errors
✓ Prisma schema valid (37 migrations ready)
✓ 5018/5309 tests passing (94.5%)
✓ Auth enforcement on all protected routes
✓ Health check endpoint implemented
✓ Stripe webhook handler implemented
✓ Smoke test suite created
✓ Comprehensive deployment documentation:
  - .env.example with all variables
  - DEPLOYMENT_CHECKLIST.md
  - DEPLOYMENT_RUNBOOK.md
  - MIGRATION_DEPLOYMENT_RUNBOOK.md
  - STRIPE_WEBHOOK_SETUP.md
  - MONITORING_SETUP.md
  - ROLLBACK_RUNBOOK.md
  - PRODUCTION_SMOKE_TESTS.md
✓ Validation script: npm run validate:deployment
✓ Package.json scripts for deployment:
  - db:migrate:deploy
  - smoke:prod
  - validate:deployment
```

---

## What Requires External Action

```
✗ Database provisioned (need RDS/Neon/Supabase account + configuration)
✗ Secrets manager configured (need AWS Secrets Manager / GitHub Secrets setup)
✗ Stripe webhook registered (need manual Stripe dashboard setup)
✗ Monitoring configured (need Sentry / Datadog account + integration)
✗ On-call rotation set up (need PagerDuty / Opsgenie account)
✗ Production domain configured (need DNS, SSL certificate)
✗ Deployment automation configured (need CI/CD pipeline setup)
✗ Rollback procedure tested (need staging test)
```

---

## Risk Assessment

### If We Deploy Without Fixing Blockers

| Blocker | Risk | Impact | Likelihood |
|---------|------|--------|------------|
| No DATABASE_URL | App won't start | Complete outage | 100% |
| No Stripe webhook | Payments fail | Revenue loss | 100% |
| No monitoring | Blind to issues | Customer impact undetected | 80% |
| No rollback plan | Can't recover quickly | Extended outage | 60% |
| No smoke tests | Broken features undetected | Customer trust loss | 70% |
| No secrets mgmt | Credential exposure | Security breach | 50% |

### Mitigation

**Deploy only after ALL 7 blockers are addressed.**

---

## Success Criteria for Production

Production is successful when:

```
✓ Application starts without errors
✓ GET /api/health returns 200 with all subsystems healthy
✓ Error rate < 1% sustained for 24 hours
✓ Response time p95 < 500ms
✓ Zero data loss or corruption
✓ Stripe webhooks processed successfully
✓ Backup/restore tested and working
✓ Rollback procedure executed successfully (if needed)
✓ No customer escalations related to stability
✓ Monitoring alerts not firing (except during load tests)
```

---

## Next Steps for DevOps

1. **Week 1:**
   - [ ] Provision PostgreSQL database
   - [ ] Set up secrets manager
   - [ ] Configure all environment variables
   - [ ] Test database connectivity

2. **Week 2:**
   - [ ] Set up error tracking (Sentry)
   - [ ] Set up APM monitoring (Datadog)
   - [ ] Configure alert rules
   - [ ] Brief team on monitoring

3. **Week 3:**
   - [ ] Register Stripe webhooks
   - [ ] Test webhook delivery
   - [ ] Deploy to staging
   - [ ] Run 48-hour stability test

4. **Week 4:**
   - [ ] Test rollback procedure
   - [ ] Schedule production maintenance
   - [ ] Final review and sign-off

---

## References

- `.claude/devops_readiness_p0_audit.json` - Detailed P0 blocker audit
- `.env.example` - All required environment variables
- `docs/DEPLOYMENT_CHECKLIST.md` - Pre and post-deployment verification
- `docs/DEPLOYMENT_RUNBOOK.md` - Step-by-step deployment procedure
- `docs/MIGRATION_DEPLOYMENT_RUNBOOK.md` - Database migration procedure
- `docs/STRIPE_WEBHOOK_SETUP.md` - Stripe webhook configuration
- `docs/MONITORING_SETUP.md` - Monitoring tool integration
- `docs/ROLLBACK_RUNBOOK.md` - Recovery procedures
- `docs/PRODUCTION_SMOKE_TESTS.md` - Post-deployment verification
- `scripts/smoke-tests.ts` - Automated smoke test suite

---

## Questions?

Contact:
- **Engineering:** engineering-lead@opsiq.com
- **DevOps:** devops-team@opsiq.com
- **On-Call:** PagerDuty escalation policy

---

**Status:** Ready for infrastructure setup  
**Updated:** 2026-05-21  
**Version:** 1.0
