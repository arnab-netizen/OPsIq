# External DevOps Deployment Execution Checklist

**Document:** Practical checklist for DevOps operator/engineer  
**Last Updated:** 2026-05-21  
**Status:** CODE_GOVERNANCE_READY_DEPLOYMENT_OPS_BLOCKED  
**Owner:** DevOps/SRE Team

---

## ⚠️ CRITICAL DISCLAIMER

**This checklist covers EXTERNAL infrastructure setup only.**

- Do NOT start here without reading: `.claude/devops_readiness_p0_audit.json`
- Do NOT claim production-ready until ALL 7 blockers are VERIFIED COMPLETE
- Code governance gates are PASSING. Deployment gates are BLOCKED ON EXTERNAL SETUP.
- This repo is CODE_GOVERNANCE_READY_DEPLOYMENT_OPS_BLOCKED

**Estimated Timeline:** 10-14 business days

---

## Phase 1: Planning (Day 1)

### 1.1 Review Requirements

- [ ] Read `.claude/devops_readiness_p0_audit.json`
- [ ] Read `docs/DEPLOYMENT_READINESS.md`
- [ ] Understand 7 P0 blockers
- [ ] Identify your infrastructure provider (AWS, Vercel, self-managed, etc.)

### 1.2 Assign Owners

- [ ] Database provisioning owner: _____________ (target: Day 2-3)
- [ ] Secrets management owner: _____________ (target: Day 2-3)
- [ ] Stripe integration owner: _____________ (target: Day 3-4)
- [ ] Monitoring setup owner: _____________ (target: Day 4-5)
- [ ] DevOps/deployment owner: _____________ (overall)

### 1.3 Choose Infrastructure Stack

Choose one option for each:

**Database:**
- [ ] AWS RDS PostgreSQL
- [ ] Neon (recommended for simplicity)
- [ ] Supabase (includes auth, optional)
- [ ] Self-managed PostgreSQL
- [ ] Other: _________________

**Secrets Manager:**
- [ ] AWS Secrets Manager
- [ ] GitHub Secrets
- [ ] HashiCorp Vault
- [ ] Hosting provider's built-in secrets
- [ ] Other: _________________

**Monitoring:**
- [ ] Sentry (recommended, easiest)
- [ ] Datadog (comprehensive, but complex)
- [ ] New Relic
- [ ] AWS CloudWatch
- [ ] Other: _________________

**Deployment:**
- [ ] Vercel (easiest for Next.js)
- [ ] AWS ECS/Fargate
- [ ] Kubernetes
- [ ] Manual EC2 deployment
- [ ] Other: _________________

---

## Phase 2: Database Provisioning (Day 2-3)

### 2.1 Choose and Create PostgreSQL Instance

**Option A: Neon (Recommended - Fastest)**

```bash
# 1. Go to https://console.neon.tech/
# 2. Create account
# 3. Create project → OpsIQ-production
# 4. Wait for provisioning (1-2 minutes)
# 5. Click "Dashboard" > copy connection string
# 6. Connection string format:
#    postgresql://user:password@host:5432/dbname?sslmode=require
```

**Option B: AWS RDS PostgreSQL**

```bash
# 1. Go to AWS Console > RDS > Create database
# 2. Engine: PostgreSQL 14.7
# 3. Template: Production
# 4. Instance: db.t3.medium or larger
# 5. Storage: 20-50GB, enable auto-scaling
# 6. Backup: 7-day retention
# 7. Multi-AZ: Yes (for production)
# 8. Wait for provisioning (10-15 minutes)
# 9. In RDS dashboard, click database > copy endpoint
# 10. Generate connection string:
#     postgresql://postgres:PASSWORD@endpoint:5432/opsiq?sslmode=require
```

**Option C: Supabase**

```bash
# 1. Go to https://supabase.com/
# 2. Create project
# 3. Wait for provisioning
# 4. Go to Project Settings > Database
# 5. Copy connection string (includes pooler)
```

### 2.2 Test Connectivity

```bash
# Set environment variable
export DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"

# Test with psql (if installed locally)
psql $DATABASE_URL -c "SELECT 1"

# Expected output:
#  ?column?
# ----------
#         1
# (1 row)

# If no psql, test from app (next step)
```

**Verification:**
- [ ] Connection string created
- [ ] Connection string includes `sslmode=require` (for cloud databases)
- [ ] `psql $DATABASE_URL -c "SELECT 1"` succeeds (or equivalent test)
- [ ] Network security: only app can connect (firewall/security group)

### 2.3 Document Database Connection

Create a secure document (not in git) with:

```
DATABASE_URL: postgresql://...@....amazonaws.com:5432/opsiq?sslmode=require
DATABASE_PROVIDER: postgresql
DATABASE_HOST: opsiq-prod.cxxxxxx.us-east-1.rds.amazonaws.com
DATABASE_PORT: 5432
DATABASE_NAME: opsiq
DATABASE_USER: postgres
DATABASE_PASSWORD: [SECURE - not in repo]
BACKUP_BUCKET: s3://opsiq-backups-prod (if using AWS)
```

**DO NOT commit this to git.**

---

## Phase 3: Environment Variables Setup (Day 2-4)

### 3.1 Create Secrets Manager Entry

Choose your secrets manager and create entry for all these variables:

**REQUIRED (Production):**

```
DATABASE_URL=postgresql://...  ← From Phase 2

NODE_ENV=production

AUTH_SECRET=[Generate: openssl rand -base64 32]
# Output example: X3k+K9mL2nP4qR6sT8uV0wX1yZ2aB3cD4eF5gH6jI7kL8mN9oP0qR1sT2=

NEXT_PUBLIC_APP_URL=https://yourdomain.com

STRIPE_SECRET_KEY=sk_live_XXXXX (from Stripe dashboard, or sk_test_ for staging)
NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=pk_live_XXXXX (from Stripe dashboard)
STRIPE_WEBHOOK_SECRET=whsec_XXXXX (from Stripe webhook registration, Phase 4)

LOG_LEVEL=info
```

**OPTIONAL (Recommended for Production):**

```
SENTRY_DSN=https://xxx@yyy.ingest.sentry.io/123456 (from Sentry project)
DATADOG_API_KEY=xxx (if using Datadog)
ENABLE_REQUEST_TRACING=true
ENABLE_AUDIT_LOGGING=true
```

### 3.2 Verify All Required Variables

```bash
# Checklist: Required env vars from .env.example
# ✓ DATABASE_URL
# ✓ NODE_ENV
# ✓ NEXT_PUBLIC_APP_URL
# ✓ AUTH_SECRET
# ✓ STRIPE_SECRET_KEY
# ✓ STRIPE_WEBHOOK_SECRET
# ✓ NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY
# ✓ LOG_LEVEL
# ✓ SENTRY_DSN (optional but recommended)
# ✓ No hardcoded secrets in .env files
# ✓ All secrets in secrets manager only
```

**Verification:**
- [ ] All required env vars defined in secrets manager
- [ ] AUTH_SECRET is 32+ random characters
- [ ] DATABASE_URL matches provisioned database
- [ ] STRIPE keys are sk_live_* and pk_live_* (NOT sk_test_*)
- [ ] No .env files in production (only secrets manager)
- [ ] Secrets manager access is restricted (IAM roles, not keys)

### 3.3 Test Environment Validation

If deploying to a platform that pulls env vars:

```bash
# After deploying application with env vars configured:
curl https://yourdomain.com/api/health

# Should return:
# {
#   "status": "healthy",
#   "checks": {
#     "database": {"status": "healthy", "latencyMs": 45}
#   }
# }

# If database check fails:
# - DATABASE_URL is wrong
# - Database is not running
# - Network connectivity issue
# - Fix and re-test
```

---

## Phase 4: Stripe Webhook Registration (Day 3-4)

### 4.1 Get Stripe API Keys

**For LIVE (Production):**

1. Go to https://dashboard.stripe.com (live account)
2. Click **Developers** > **API keys** (top bar)
3. Switch to "Live data" toggle (top right, if not already)
4. Copy **Live Publishable key** (pk_live_...)
5. Copy **Live Secret key** (sk_live_...)

**For TEST (Staging):**

1. Same steps, but keep "Test data" toggle ON
2. Copy **Test Publishable key** (pk_test_...)
3. Copy **Test Secret key** (sk_test_...)

### 4.2 Register Webhook Endpoint

1. In Stripe Dashboard, click **Developers** > **Webhooks**
2. Click **Add an endpoint**
3. **Endpoint URL:** `https://yourdomain.com/api/webhooks/stripe`
4. **API version:** (keep default)
5. Click **Select events** and choose:
   - customer.created
   - customer.subscription.created
   - customer.subscription.updated
   - customer.subscription.deleted
   - payment_intent.succeeded
   - payment_intent.payment_failed
   - invoice.payment_succeeded
6. Click **Add endpoint**

### 4.3 Get Webhook Signing Secret

1. In the webhooks list, click your endpoint
2. Scroll down to **Signing secret**
3. Click **Reveal**
4. Copy the value (starts with whsec_)
5. Add to env vars: `STRIPE_WEBHOOK_SECRET=whsec_...`

### 4.4 Test Webhook Delivery

```bash
# In Stripe Dashboard, find your webhook endpoint
# Click on it
# Scroll to "Recent events"
# Click "Send a test event"
# Select any event type (e.g., customer.created)
# Click "Send event"

# Expected: Status shows 200 (green checkmark)

# Check application logs:
kubectl logs deployment/opsiq | grep webhook

# Expected output:
# [INFO] Webhook received: event_id=evt_...
# [INFO] Event processed: status=processed
```

**Verification:**
- [ ] Webhook endpoint registered in Stripe dashboard
- [ ] STRIPE_SECRET_KEY set to sk_live_* (not sk_test_*)
- [ ] STRIPE_WEBHOOK_SECRET set (whsec_*)
- [ ] NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY set to pk_live_*
- [ ] Test webhook sent and received successfully (HTTP 200)
- [ ] Application logs show webhook processing

---

## Phase 5: Monitoring Setup (Day 4-5)

### 5.1 Choose Monitoring Provider

**Minimum Viable: Sentry Only**

```bash
# 1. Go to https://sentry.io/
# 2. Create organization
# 3. Create project > Next.js
# 4. Copy SENTRY_DSN
# 5. Set SENTRY_DSN in environment variables
# 6. Deploy application
# 7. Trigger test error: GET https://yourdomain.com/api/test-error
# 8. Check Sentry dashboard > error appears within 30s
```

**Recommended: Sentry + Datadog**

See: `docs/MONITORING_SETUP.md` for detailed instructions.

### 5.2 Create Critical Alerts

**Minimum Viable Alerts:**

```
1. Error rate > 5% for >5 minutes
   Action: Page on-call engineer
   
2. Database unavailable (health check returns database:unhealthy)
   Action: Page on-call engineer
   
3. Health check fails (health check returns non-200)
   Action: Page on-call engineer
   
4. Stripe webhook failures (consecutive failures)
   Action: Notify DevOps team
```

### 5.3 Set Up On-Call Rotation

- [ ] Create on-call schedule in PagerDuty or Opsgenie
- [ ] Add alert routing: Monitoring → PagerDuty
- [ ] Test: Trigger test alert, verify on-call gets paged

**Verification:**
- [ ] Error tracking integration working (Sentry or equivalent)
- [ ] Critical alerts configured and tested
- [ ] On-call rotation in place
- [ ] Alert notification delivery verified

---

## Phase 6: Deploy to Staging (Day 6-8)

### 6.1 Create Staging Database

Same as Phase 2, but for staging:

```
DATABASE_URL_STAGING=postgresql://...staging...
```

### 6.2 Deploy Code to Staging

Push code (from main branch) to staging environment:

```bash
# Ensure main branch is deployed to staging
git checkout main
git pull

# Deploy (using your CI/CD pipeline or manual deployment)
# Example for Vercel:
vercel --prod --name opsiq-staging
```

### 6.3 Run Migrations in Staging

```bash
# Set staging env vars
export DATABASE_URL="postgresql://...staging..."
export NODE_ENV=staging

# Deploy migrations
npx prisma migrate deploy

# Expected output:
# Applying migration 20260415_000000_init
# Applying migration 20260415_add_finding_recommendation_stage
# ... (all 37 migrations)
# All migrations have been successfully applied.

# Verify
npx prisma migrate status
# Expected: No pending migrations
```

### 6.4 Run Smoke Tests in Staging

```bash
# Set app URL
export NEXT_PUBLIC_APP_URL="https://staging.yourdomain.com"

# Run automated smoke tests
npm run smoke:staging

# Expected output:
# ✓ Health check endpoint (45ms)
# ✓ Readiness probe (30ms)
# ✓ Liveness probe (25ms)
# ✓ Authentication enforcement (40ms)
# ✓ Database connectivity (50ms)
# ✓ Memory health (15ms)
# ✓ Runtime environment (20ms)
# ✓ Application uptime (10ms)
# ✓ Webhook endpoint ready (35ms)
#
# All smoke tests passed! Deployment is healthy.
```

### 6.5 Monitor Staging for 48 Hours

- [ ] Error rate < 1%
- [ ] Response time p95 < 500ms
- [ ] No ERROR logs
- [ ] Webhook test in Stripe succeeds
- [ ] No database issues
- [ ] Memory/CPU stable

### 6.6 Test Rollback Procedure in Staging

See: `docs/ROLLBACK_RUNBOOK.md`

```bash
# 1. Deploy broken version to staging
# 2. Verify smoke tests fail
# 3. Execute rollback procedure
# 4. Verify smoke tests pass
# 5. Document any issues
```

**Verification:**
- [ ] Staging deployment successful
- [ ] All migrations applied
- [ ] Smoke tests pass
- [ ] 48-hour monitoring completed
- [ ] Rollback procedure tested
- [ ] Ready for production

---

## Phase 7: Prisma Migration Deployment (Day of Production Deployment)

### 7.1 Pre-Migration Backup

```bash
# Create database backup BEFORE migration
./scripts/backup-database.sh /backups/opsiq verify

# Expected output:
# Backup file created: opsiq_backup_2026-05-21_14-30-45.sql.gz
# Backup size: 245MB

# Verify backup exists
ls -lh /backups/opsiq/opsiq_backup_*.sql.gz | head -1
```

### 7.2 Deploy Migrations

```bash
# Set production DATABASE_URL
export DATABASE_URL="postgresql://...production..."
export NODE_ENV=production

# Deploy migrations
npx prisma migrate deploy

# Expected output:
# Applying migration 20260415_000000_init
# ... (all 37 migrations, should be quick if already applied)
# All migrations have been successfully applied.

# Verify
npx prisma validate

# Expected output:
# Prisma schema loaded from prisma/schema.prisma.
# The schema at prisma/schema.prisma is valid 🚀
```

### 7.3 Rollback Decision Point

**If migrations fail:**

1. Check error message carefully
2. Review `docs/MIGRATION_DEPLOYMENT_RUNBOOK.md` troubleshooting
3. If unrecoverable:
   - Stop application
   - Restore backup: `./scripts/restore-database.sh /backups/opsiq/opsiq_backup_XXXXX.sql.gz`
   - DO NOT proceed with deployment
   - Contact engineering team

**Verification:**
- [ ] Backup created before migration
- [ ] All 37 migrations applied successfully
- [ ] `npx prisma validate` passes
- [ ] Database schema verified
- [ ] Ready for application startup

---

## Phase 8: Production Deployment (Day of Release)

### 8.1 Pre-Deployment Checklist

```
DATABASE_URL configured:              [ ] YES
All environment variables set:         [ ] YES
Stripe webhook registered:             [ ] YES
Monitoring alerts configured:          [ ] YES
Rollback procedure tested:             [ ] YES
Backup created:                        [ ] YES
Team notified of maintenance window:   [ ] YES
```

### 8.2 Deploy Application

Deploy code from main branch to production:

```bash
# Deploy (using your CI/CD or manual)
git checkout main
git pull
# ... deploy to production ...
```

### 8.3 Run Smoke Tests

```bash
# Set production app URL
export NEXT_PUBLIC_APP_URL="https://yourdomain.com"

# Run automated smoke tests
npm run smoke:prod

# Expected: All 9 tests pass
# If any test fails: INITIATE ROLLBACK (see docs/ROLLBACK_RUNBOOK.md)
```

### 8.4 Manual Verification

```bash
# Health check
curl https://yourdomain.com/api/health
# Expected: {"status": "healthy", ...}

# Browser test
# Open https://yourdomain.com
# Create workspace
# Create engagement
# Create action
# No errors should appear

# Stripe test
# In Stripe dashboard: Send test webhook
# Check application logs: webhook received and processed
```

### 8.5 Monitor for 1 Hour Post-Deployment

- [ ] Error rate < 1%
- [ ] Response time p95 < 500ms
- [ ] No ERROR logs
- [ ] Database latency < 200ms
- [ ] Memory/CPU normal
- [ ] Stripe webhooks processing

### 8.6 Notify Stakeholders

Once health is confirmed:

```
Slack: "✅ Production deployment successful. All smoke tests pass. Monitoring normal."
Status page: "Operational"
Customer support: "System is live"
```

**Verification:**
- [ ] All smoke tests passed
- [ ] Manual verification completed
- [ ] 1-hour monitoring completed
- [ ] Stakeholders notified
- [ ] Deployment marked complete

---

## Phase 9: Final Go/No-Go Checklist

### 9.1 All 7 P0 Blockers Complete?

- [ ] 1. Database provisioned and verified (Phase 2)
- [ ] 2. Migrations deployed successfully (Phase 7)
- [ ] 3. Environment variables configured (Phase 3)
- [ ] 4. Stripe webhooks registered and tested (Phase 4)
- [ ] 5. Monitoring alerts configured (Phase 5)
- [ ] 6. Rollback procedure tested (Phase 6)
- [ ] 7. Smoke tests suite working (Phase 8)

### 9.2 Critical Verifications

- [ ] Code governance gates passing (governance:scan:strict=PASS, tsc=PASS, prisma validate=PASS)
- [ ] Health check endpoint returns 200 with all subsystems healthy
- [ ] Database connectivity verified (latency < 500ms)
- [ ] Stripe webhook delivery working
- [ ] Error tracking integrated and receiving errors
- [ ] Alerting system tested and on-call rotation active
- [ ] Rollback procedure documented and tested
- [ ] No hardcoded secrets in application or .env files
- [ ] All production variables in secure secrets manager
- [ ] Load balancer/DNS pointing to production app
- [ ] SSL certificate valid and not self-signed
- [ ] Backup and restore procedures verified

### 9.3 Team Sign-Off

```
FINAL PRODUCTION DEPLOYMENT APPROVAL

Code Ready (passes governance, tsc, prisma):     ☐ YES
Infrastructure Ready (all 7 blockers complete):  ☐ YES
Monitoring Ready (alerts configured, on-call):   ☐ YES
Rollback Ready (tested and verified):            ☐ YES
Team Trained (runbooks reviewed):                ☐ YES

Technical Lead: _________________ Date: _________
DevOps Engineer: _______________ Date: _________
On-Call Lead: __________________ Date: _________
Product Manager: _______________ Date: _________

OVERALL APPROVAL: ☐ GO / ☐ NO-GO
```

---

## Rollback Trigger Conditions

**Rollback IMMEDIATELY if:**

```
✗ Application crashes on startup
✗ All requests return 500 errors
✗ Health check returns unhealthy status
✗ Database connection fails
✗ Stripe webhooks stop being processed
✗ Error rate > 10% for >5 minutes
✗ Data corruption detected
✗ Security vulnerability discovered
```

**Rollback Procedure:**

See: `docs/ROLLBACK_RUNBOOK.md`

```bash
# Quick rollback
git revert $BROKEN_COMMIT
git push origin main
kubectl rollout restart deployment/opsiq

# Or for database issues
./scripts/restore-database.sh /backups/opsiq/opsiq_backup_KNOWN_GOOD.sql.gz
```

---

## Critical Contacts

On-Call Engineer:   ___________________________
DevOps Lead:        ___________________________
Engineering Lead:   ___________________________
Product Manager:    ___________________________
Customer Success:   ___________________________

PagerDuty Escalation: ___________________________

---

## Success Criteria

Production deployment is successful when:

```
✓ Application starts without errors
✓ All 9 smoke tests pass
✓ Health check returns healthy
✓ Error rate < 1% sustained for 24 hours
✓ Response time p95 < 500ms
✓ No data loss or corruption
✓ Stripe webhooks processed successfully
✓ Monitoring alerts not firing (except during tests)
✓ Backup and restore working
✓ Rollback procedure can be executed quickly
✓ No customer escalations
```

---

## Post-Deployment (Days 1-7)

### Day 1-2: Intensive Monitoring

```
Every hour:
- Check error rate (should be < 1%)
- Check response times (p95 < 500ms)
- Check memory/CPU (< 70%)
- Scan logs for unexpected errors
```

### Day 3-7: Normal Monitoring

```
Every 4 hours:
- Review monitoring dashboard
- Check for any spikes or trends
- Verify backups completed
- Confirm webhook processing normal
```

### Day 7: Post-Deployment Review

- [ ] Create post-mortem ticket (if any issues)
- [ ] Document lessons learned
- [ ] Update runbooks based on experience
- [ ] Brief team on deployment results

---

## Questions or Issues?

**Deployment blocked?** Contact DevOps Lead  
**Monitoring not working?** Contact SRE Team  
**Stripe issue?** Contact Billing/Finance  
**Data corruption?** Initiate rollback immediately, contact engineering  
**Security concern?** Contact security@company.com immediately  

---

**Status:** CODE_GOVERNANCE_READY_DEPLOYMENT_OPS_BLOCKED  
**Updated:** 2026-05-21  
**Do Not Claim Production-Ready Until All 7 Blockers Are Verified Complete**
