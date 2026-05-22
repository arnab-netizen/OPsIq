# WHEN INTERNET AVAILABLE: EXECUTION CHECKLIST

**Purpose:** Step-by-step checklist for DevOps operator when proper internet/computer access is available  
**Format:** Copy-paste executable commands  
**Created:** 2026-05-22  
**Status:** Ready to execute  

---

## ⚠️ PRE-EXECUTION WARNING

- **Read first:** `docs/GO_LIVE_OPERATOR_PACK.md` (Section 2: The 7 P0 Blockers)
- **Infrastructure providers:** Must be pre-selected (Section 1 of operator pack)
- **Team assigned:** Owners identified for each blocker
- **This checklist:** Do not skip steps. Execute in order.
- **Checkboxes:** Mark each step as you complete it

---

## PHASE 0: PRE-EXECUTION VERIFICATION

### Step 0.1: Verify Environment

```bash
# Run this now
echo "=== PRE-EXECUTION CHECK ==="
echo "User: $(whoami)"
echo "Working Dir: $(pwd)"
echo "Git Status:"
git status
echo "Current Branch:"
git branch -v
```

- [ ] User is correct (DevOps engineer)
- [ ] Working directory is `/home/user/OPsIq` or similar
- [ ] Git branch is `main`
- [ ] No uncommitted changes

### Step 0.2: Verify Internet Connectivity

```bash
# Test DNS and HTTPS
ping -c 1 8.8.8.8
curl -s https://api.stripe.com/v1/customers --head -o /dev/null && echo "✓ Stripe API reachable"
curl -s https://dashboard.stripe.com --head -o /dev/null && echo "✓ Stripe Dashboard reachable"
```

- [ ] DNS works (ping succeeds)
- [ ] Stripe API reachable
- [ ] Stripe Dashboard reachable

### Step 0.3: Choose Infrastructure Providers (If Not Already Done)

Before proceeding, confirm:

- [ ] **Database:** Chosen (Neon / AWS RDS / Supabase / Self-managed)
- [ ] **Secrets Manager:** Chosen (AWS Secrets Manager / GitHub Secrets / Vault / Other)
- [ ] **Hosting:** Chosen (Vercel / AWS ECS / EC2 / Kubernetes / Other)
- [ ] **Monitoring:** Chosen (Sentry / Datadog / CloudWatch / Other)

---

## PHASE 1: DATABASE PROVISIONING

### Step 1.1: Create PostgreSQL Database

**If using Neon (Recommended - Fastest):**

```bash
# 1. Go to https://console.neon.tech/ in browser
# 2. Create account (if needed)
# 3. Create project named: OpsIQ-production
# 4. Wait for provisioning (1-2 minutes)
# 5. Go to Dashboard > Connection String
# 6. Copy the connection string (should start with postgresql://)
# 7. Set it as an environment variable:

export DATABASE_URL="postgresql://user:password@neon-host-123.us-east-2.neon.tech:5432/opsiq?sslmode=require"

# 8. Test it:
psql "$DATABASE_URL" -c "SELECT 1"
# Expected output: 1 row with value 1
```

**If using AWS RDS:**

```bash
# 1. AWS Console > RDS > Create Database
# 2. Engine: PostgreSQL 14.7+
# 3. Instance: db.t3.medium
# 4. Storage: 20GB, enable auto-scaling
# 5. Backup: 7-day retention, Multi-AZ: Yes
# 6. Wait 10-15 minutes
# 7. Get endpoint from AWS Console (Databases > your-db > Endpoint)
# 8. Build connection string:

export DATABASE_URL="postgresql://postgres:YourPasswordHere@your-rds-endpoint.us-east-1.rds.amazonaws.com:5432/opsiq?sslmode=require"

# 9. Test it:
psql "$DATABASE_URL" -c "SELECT 1"
# Expected output: 1 row with value 1
```

- [ ] Database created
- [ ] Connection string created
- [ ] `psql $DATABASE_URL -c "SELECT 1"` returns 1 row
- [ ] Database name is `opsiq`

### Step 1.2: Export DATABASE_URL for Next Steps

```bash
# Add to your shell profile for persistence
echo 'export DATABASE_URL="postgresql://user:password@host:5432/opsiq?sslmode=require"' >> ~/.bashrc
source ~/.bashrc

# Verify
echo $DATABASE_URL
# Expected: Full connection string shown
```

- [ ] DATABASE_URL exported
- [ ] `echo $DATABASE_URL` shows full connection string
- [ ] No errors

---

## PHASE 2: GITHUB CHECKS & VALIDATION

### Step 2.1: Verify Code Governance Gates Pass

```bash
# Clean install
npm ci

# TypeScript check
npx tsc --noEmit
# Expected: No errors (or existing errors)

# Prisma schema validation
npx prisma validate
# Expected: Schema at ... is valid

# Governance scan
npm run governance:scan:strict
# Expected: 0 Errors (may have warnings)

# Build
npm run build
# Expected: Successfully compiled

# Tests (pre-existing only, no new failures)
npm run test:ci
# Expected: Pre-existing failures, no new ones
```

- [ ] `npm ci` completes without error
- [ ] `npx tsc --noEmit` shows no errors
- [ ] `npx prisma validate` shows "valid"
- [ ] `npm run governance:scan:strict` shows 0 errors
- [ ] `npm run build` completes successfully
- [ ] `npm run test:ci` shows no new test failures

### Step 2.2: Verify Git Status

```bash
git status
# Expected: On branch main, working tree clean

git log --oneline -3
# Expected: Recent commits visible

git remote -v
# Expected: Origin points to correct repository
```

- [ ] On branch `main`
- [ ] Working tree clean
- [ ] Recent commits visible
- [ ] Remote origin correct

---

## PHASE 3: SECRETS MANAGEMENT SETUP

### Step 3.1: Generate Required Secrets

```bash
# Generate AUTH_SECRET (random 32+ character string)
AUTH_SECRET=$(openssl rand -hex 32)
echo "AUTH_SECRET=$AUTH_SECRET"

# Generate placeholder for others (you'll fill these in from Stripe, etc.)
echo ""
echo "AUTH_SECRET: $AUTH_SECRET"
echo "DATABASE_URL: $DATABASE_URL"
echo ""
echo "You still need from Stripe/Monitoring:"
echo "  - STRIPE_SECRET_KEY (sk_live_...)"
echo "  - STRIPE_WEBHOOK_SECRET (whsec_...)"
echo "  - NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY (pk_live_...)"
echo "  - SENTRY_DSN (optional, for error tracking)"
```

- [ ] AUTH_SECRET generated
- [ ] DATABASE_URL confirmed
- [ ] Stripe keys noted (will get in Phase 5)

### Step 3.2: Add Secrets to GitHub (If Using GitHub Secrets)

```bash
# Go to: https://github.com/arnab-netizen/opsiq/settings/secrets/actions
# Or use GitHub CLI:

# Install GitHub CLI if needed
# (brew install gh / apt-get install gh)

gh auth login
# Follow prompts to authenticate

# Add secrets (replace values with actual):
gh secret set DATABASE_URL --body "postgresql://user:password@host:5432/opsiq?sslmode=require"
gh secret set AUTH_SECRET --body "$AUTH_SECRET"

# Verify
gh secret list
# Expected: DATABASE_URL and AUTH_SECRET listed
```

- [ ] `gh auth login` successful
- [ ] `gh secret set DATABASE_URL` successful
- [ ] `gh secret set AUTH_SECRET` successful
- [ ] `gh secret list` shows new secrets

### Step 3.3: Add Secrets to AWS Secrets Manager (If Using AWS)

```bash
# Configure AWS CLI if needed
aws configure
# Enter: AWS Access Key, Secret Key, Region (us-east-1), Format (json)

# Create secret
aws secretsmanager create-secret \
  --name opsiq/production/app-secrets \
  --secret-string '{
    "DATABASE_URL": "postgresql://user:password@host:5432/opsiq?sslmode=require",
    "AUTH_SECRET": "'$AUTH_SECRET'",
    "LOG_LEVEL": "info",
    "LOG_FORMAT": "json"
  }' \
  --region us-east-1

# Verify
aws secretsmanager get-secret-value \
  --secret-id opsiq/production/app-secrets \
  --region us-east-1
# Expected: JSON output with your secrets
```

- [ ] AWS Secrets Manager secret created
- [ ] `aws secretsmanager get-secret-value` returns JSON with secrets

---

## PHASE 4: PRISMA MIGRATIONS & DATABASE SETUP

### Step 4.1: Run Database Migrations

```bash
# With DATABASE_URL set, run migrations
npx prisma migrate deploy

# Expected output:
# Prisma schema loaded from prisma/schema.prisma
# Applying migration `...`
# Applied 37 migrations (or however many are pending)
# ✓ Done
```

- [ ] `npx prisma migrate deploy` completes successfully
- [ ] Output shows all 37 migrations applied (or 0 if already applied)
- [ ] No errors

### Step 4.2: Verify Database Schema

```bash
# List tables
psql "$DATABASE_URL" -c "\dt"
# Expected: Tables visible (workspaces, users, etc.)

# Count migrations applied
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM \"_prisma_migrations\""
# Expected: 37 (or current number of migrations)

# Verify key tables exist
psql "$DATABASE_URL" -c "SELECT table_name FROM information_schema.tables WHERE table_schema='public'" | head -20
# Expected: workspaces, users, engagements, etc. listed
```

- [ ] `\dt` lists tables
- [ ] Migration count shows 37
- [ ] Key tables exist (workspaces, users, engagements)

---

## PHASE 5: STRIPE SETUP

### Step 5.1: Get Stripe API Keys

```bash
# Go to: https://dashboard.stripe.com/apikeys
# If not logged in, log in with your Stripe account

# DO NOT CREATE NEW ACCOUNT - use existing business account

# In API Keys page:
# 1. Find section "LIVE KEYS" (not TEST keys)
# 2. Copy "Secret key" (starts with sk_live_)
# 3. Copy "Publishable key" (starts with pk_live_)

# Add to your secrets:
export STRIPE_SECRET_KEY="sk_live_xxxxxxxxxxxxxxxxxxxxx"
export NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY="pk_live_xxxxxxxxxxxxxxxxxxxxx"

echo "STRIPE_SECRET_KEY=$STRIPE_SECRET_KEY"
echo "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY=$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
```

- [ ] Navigated to https://dashboard.stripe.com/apikeys
- [ ] Found LIVE KEYS (not TEST)
- [ ] Copied sk_live_* key
- [ ] Copied pk_live_* key
- [ ] Both keys exported as environment variables

### Step 5.2: Register Stripe Webhook Endpoint

```bash
# Go to: https://dashboard.stripe.com/webhooks
# Click: "Add an endpoint"
# In the form, fill:

# Endpoint URL: (This depends on your deployment domain)
# For now use a test/staging URL if available
# https://yourdomain.com/api/webhooks/stripe
#
# If you don't have production domain yet, use:
# https://staging.yourdomain.com/api/webhooks/stripe
#
# Or if using Vercel, get deployment URL from deployment pipeline

# API Version: Leave as default (latest)
# Click: "Select events"

# Select these events:
# ☑ customer.created
# ☑ customer.updated
# ☑ customer.deleted
# ☑ customer.subscription.created
# ☑ customer.subscription.updated
# ☑ customer.subscription.deleted
# ☑ payment_intent.succeeded
# ☑ payment_intent.payment_failed
# ☑ payment_intent.canceled
# ☑ invoice.created
# ☑ invoice.finalized
# ☑ invoice.payment_succeeded
# ☑ invoice.payment_failed

# Click: "Add endpoint"

echo "Webhook endpoint registered. Wait for confirmation..."
sleep 5
```

- [ ] Navigated to https://dashboard.stripe.com/webhooks
- [ ] Created new endpoint
- [ ] Set URL to your deployment domain
- [ ] Selected 14 required events
- [ ] Endpoint created

### Step 5.3: Get Webhook Signing Secret

```bash
# Go back to: https://dashboard.stripe.com/webhooks
# Click on the endpoint you just created
# Scroll down to "Signing secret"
# Click "Reveal"
# Copy the secret (starts with whsec_)

export STRIPE_WEBHOOK_SECRET="whsec_xxxxxxxxxxxxxxxxxxxxx"

# Add to GitHub Secrets:
gh secret set STRIPE_SECRET_KEY --body "$STRIPE_SECRET_KEY"
gh secret set NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY --body "$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY"
gh secret set STRIPE_WEBHOOK_SECRET --body "$STRIPE_WEBHOOK_SECRET"

# Or AWS Secrets Manager:
aws secretsmanager update-secret \
  --secret-id opsiq/production/app-secrets \
  --secret-string '{
    "DATABASE_URL": "'$DATABASE_URL'",
    "AUTH_SECRET": "'$AUTH_SECRET'",
    "STRIPE_SECRET_KEY": "'$STRIPE_SECRET_KEY'",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": "'$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'",
    "STRIPE_WEBHOOK_SECRET": "'$STRIPE_WEBHOOK_SECRET'",
    "LOG_LEVEL": "info",
    "LOG_FORMAT": "json"
  }' \
  --region us-east-1

# Verify
gh secret list
# Expected: All Stripe secrets listed
```

- [ ] Found webhook signing secret (whsec_*)
- [ ] Exported as STRIPE_WEBHOOK_SECRET
- [ ] Added to GitHub Secrets OR AWS Secrets Manager
- [ ] `gh secret list` shows all Stripe secrets

### Step 5.4: Test Stripe Connectivity

```bash
# Test Stripe API with your keys
curl https://api.stripe.com/v1/customers \
  -u "$STRIPE_SECRET_KEY": \
  -X GET

# Expected: JSON response with list of customers (may be empty)
```

- [ ] curl succeeds (HTTP 200)
- [ ] JSON response received
- [ ] API keys are valid

---

## PHASE 6: MONITORING SETUP

### Step 6.1: Set Up Sentry (Recommended - Easiest)

```bash
# Go to: https://sentry.io/
# Create account or login

# Create new project:
# 1. Click "Projects"
# 2. Click "Create Project"
# 3. Platform: Select "Next.js"
# 4. Alert frequency: Default
# 5. Click "Create Project"

# Copy the DSN (Data Source Name)
# Format: https://key@sentry.io/project-id

export SENTRY_DSN="https://xxxxxxxxxxxxxxxxxxxxx@sentry.io/123456789"

# Add to GitHub Secrets or AWS Secrets Manager:
gh secret set SENTRY_DSN --body "$SENTRY_DSN"

# Or update AWS secret:
aws secretsmanager update-secret \
  --secret-id opsiq/production/app-secrets \
  --secret-string '{
    "DATABASE_URL": "'$DATABASE_URL'",
    "AUTH_SECRET": "'$AUTH_SECRET'",
    "STRIPE_SECRET_KEY": "'$STRIPE_SECRET_KEY'",
    "NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY": "'$NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY'",
    "STRIPE_WEBHOOK_SECRET": "'$STRIPE_WEBHOOK_SECRET'",
    "SENTRY_DSN": "'$SENTRY_DSN'",
    "LOG_LEVEL": "info",
    "LOG_FORMAT": "json"
  }' \
  --region us-east-1

echo "Sentry DSN: $SENTRY_DSN"
```

- [ ] Sentry account created
- [ ] New project created (Next.js)
- [ ] DSN copied
- [ ] Added to GitHub Secrets or AWS Secrets Manager

### Step 6.2: Set Up CloudWatch (If Using AWS)

```bash
# Create CloudWatch log group
aws logs create-log-group --log-group-name /opsiq/production --region us-east-1

# Set retention policy (30 days)
aws logs put-retention-policy \
  --log-group-name /opsiq/production \
  --retention-in-days 30 \
  --region us-east-1

# Verify
aws logs describe-log-groups \
  --log-group-name-prefix /opsiq \
  --region us-east-1

# Expected: Log group listed with 30-day retention
```

- [ ] CloudWatch log group created
- [ ] Retention set to 30 days
- [ ] `aws logs describe-log-groups` shows the group

---

## PHASE 7: STAGING DEPLOYMENT

### Step 7.1: Deploy to Staging (If Using Vercel)

```bash
# Install Vercel CLI if needed
npm install -g vercel

# Login to Vercel
vercel login

# Deploy to staging
vercel deploy --prod --prebuilt
# Note: First deployment may take 5-10 minutes

# Get staging URL from output
# Example: https://opsiq-staging.vercel.app

export STAGING_URL="https://opsiq-staging.vercel.app"
echo "Staging URL: $STAGING_URL"
```

- [ ] Vercel CLI installed
- [ ] Logged in to Vercel
- [ ] Staging deployment started
- [ ] Staging URL obtained

### Step 7.2: Verify Staging Health Check

```bash
# Test health endpoint
curl "$STAGING_URL/api/health"
# Expected: 200 OK, JSON response with status

# Check database connectivity
curl "$STAGING_URL/api/health/database"
# Expected: 200 OK, database connected

# Check Stripe connectivity
curl "$STAGING_URL/api/health/stripe"
# Expected: 200 OK, Stripe API reachable
```

- [ ] Health endpoint returns 200
- [ ] Database health check passes
- [ ] Stripe health check passes

### Step 7.3: Run Staging Smoke Tests

```bash
# If smoke test suite exists, run it:
npm run test:smoke -- --url "$STAGING_URL"

# Or manual smoke tests:
echo "=== MANUAL SMOKE TESTS ==="
echo "1. Create account at $STAGING_URL"
echo "   - Go to $STAGING_URL/login"
echo "   - Click 'Sign up'"
echo "   - Enter email and password"
echo "   - Verify email received"
echo "   - Log in"
echo ""
echo "2. Create workspace"
echo "   - Create new workspace"
echo "   - Verify workspace created in database:"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM workspaces" | grep -oP '\d+' | tail -1
echo ""
echo "3. Test Stripe integration"
echo "   - Try to create subscription (test mode)"
echo "   - Use test card: 4242 4242 4242 4242"
echo "   - Verify subscription created"
echo ""
echo "4. Trigger error and check monitoring"
echo "   - Make request to $STAGING_URL/api/health/error (or similar)"
echo "   - Check Sentry dashboard for error"
```

- [ ] Health checks pass
- [ ] Account creation works
- [ ] Workspace creation works
- [ ] Stripe test payment works (if tested)
- [ ] Error tracking captures errors

---

## PHASE 8: STRIPE WEBHOOK TESTING

### Step 8.1: Test Webhook Delivery

```bash
# Go to: https://dashboard.stripe.com/webhooks
# Click your webhook endpoint
# Scroll to "Recent Events"
# Click "Send a test event"
# Select: "customer.created"
# Click "Send event"

# Wait 5-10 seconds

# Check application logs:
curl "$STAGING_URL/api/webhooks/stripe/status"
# Expected: Shows recent webhook events

# Or check database for webhook log:
psql "$DATABASE_URL" -c "SELECT id, event_type, status FROM webhook_events ORDER BY created_at DESC LIMIT 5"
# Expected: Test event visible with status=processed
```

- [ ] Navigated to Stripe webhooks
- [ ] Sent test event (customer.created)
- [ ] Application logs show webhook received
- [ ] Database shows webhook processed
- [ ] Status is 200 OK

### Step 8.2: Verify Webhook Idempotency

```bash
# Send duplicate test event:
# Go to: https://dashboard.stripe.com/webhooks
# Click your endpoint
# Find the test event you just sent
# Click "Resend"
# Click "Resend event"

# Wait 5 seconds

# Check database - event should appear only once:
psql "$DATABASE_URL" -c "SELECT event_id, COUNT(*) FROM webhook_events GROUP BY event_id HAVING COUNT(*) > 1"
# Expected: No duplicate events (empty result)
```

- [ ] Sent duplicate webhook
- [ ] Checked database
- [ ] No duplicate events (idempotency working)

---

## PHASE 9: PRODUCTION GO/NO-GO DECISION

### Step 9.1: Run Pre-Production Checklist

```bash
echo "=== PRE-PRODUCTION CHECKLIST ==="
echo ""
echo "Code Validation:"
npx tsc --noEmit && echo "✓ TypeScript OK" || echo "✗ TypeScript FAILED"
npx prisma validate && echo "✓ Prisma OK" || echo "✗ Prisma FAILED"
npm run governance:scan:strict 2>&1 | grep -E "Errors: 0|Errors: [1-9]" && echo "✓ Governance OK" || echo "✗ Governance FAILED"

echo ""
echo "Infrastructure:"
echo "✓ Database: $DATABASE_URL" | grep -q "postgresql://" && echo "✓ DATABASE_URL set" || echo "✗ DATABASE_URL not set"
echo "✓ Auth Secret: $(echo $AUTH_SECRET | cut -c1-10)..." && echo "✓ AUTH_SECRET set" || echo "✗ AUTH_SECRET not set"
echo "✓ Stripe Keys: $(echo $STRIPE_SECRET_KEY | cut -c1-10)..." && echo "✓ STRIPE_SECRET_KEY set" || echo "✗ STRIPE_SECRET_KEY not set"

echo ""
echo "Staging Tests:"
echo "Staging URL: $STAGING_URL"
curl -s "$STAGING_URL/api/health" > /dev/null && echo "✓ Health check passes" || echo "✗ Health check fails"

echo ""
echo "Stripe:"
echo "✓ Stripe webhook secret: $(echo $STRIPE_WEBHOOK_SECRET | cut -c1-10)..." && echo "✓ Webhook secret set" || echo "✗ Webhook secret not set"

echo ""
echo "Database Migrations:"
psql "$DATABASE_URL" -c "SELECT COUNT(*) as migration_count FROM \"_prisma_migrations\"" 2>/dev/null && echo "✓ Migrations applied" || echo "✗ Migrations failed"
```

- [ ] TypeScript validation passes
- [ ] Prisma validation passes
- [ ] Governance scan passes (0 errors)
- [ ] DATABASE_URL set
- [ ] AUTH_SECRET set
- [ ] STRIPE_SECRET_KEY set
- [ ] Staging health check passes
- [ ] Stripe webhook secret set
- [ ] Database migrations applied

### Step 9.2: Decision Table

| Check | Status | Sign-Off |
|-------|--------|----------|
| All 7 blockers complete | ✓ / ✗ | ___ |
| Code governance PASS | ✓ / ✗ | ___ |
| Database provisioned | ✓ / ✗ | ___ |
| Secrets configured | ✓ / ✗ | ___ |
| Stripe webhooks working | ✓ / ✗ | ___ |
| Monitoring configured | ✓ / ✗ | ___ |
| Staging tests pass | ✓ / ✗ | ___ |
| Health checks pass | ✓ / ✗ | ___ |
| Migrations applied | ✓ / ✗ | ___ |
| Webhook idempotency verified | ✓ / ✗ | ___ |

**DECISION:**
- [ ] **GO** - Proceed to production
- [ ] **NO-GO** - Fix issues and retry

**Signed By:** _________________________ Date: __________

---

## PHASE 10: PRODUCTION DEPLOYMENT

### Step 10.1: Create Production Deployment

```bash
# Option A: Deploy to Vercel Production
vercel deploy --prod

# Option B: Deploy to AWS
# (Follow your AWS deployment process)

# Get production URL
export PRODUCTION_URL="https://yourdomain.com"
echo "Production URL: $PRODUCTION_URL"
```

- [ ] Production deployment started
- [ ] Deployment URL obtained
- [ ] Deployment completed (5-15 minutes)

### Step 10.2: Post-Deployment Verification

```bash
echo "=== POST-DEPLOYMENT CHECKS ==="
echo ""
echo "Health:"
curl -s "$PRODUCTION_URL/api/health" && echo "✓ Health OK" || echo "✗ Health FAILED"
curl -s "$PRODUCTION_URL/api/health/database" && echo "✓ DB Health OK" || echo "✗ DB Health FAILED"
curl -s "$PRODUCTION_URL/api/health/stripe" && echo "✓ Stripe Health OK" || echo "✗ Stripe Health FAILED"

echo ""
echo "Monitoring:"
echo "Check Sentry dashboard for errors:"
echo "  https://sentry.io/"
echo ""
echo "Check database:"
psql "$DATABASE_URL" -c "SELECT COUNT(*) FROM workspaces" && echo "✓ Database responsive" || echo "✗ Database unresponsive"

echo ""
echo "SSL Certificate:"
curl -s -I "$PRODUCTION_URL" | grep -i "https" && echo "✓ HTTPS working" || echo "✗ HTTPS not working"
```

- [ ] Health endpoint returns 200
- [ ] Database health check passes
- [ ] Stripe health check passes
- [ ] HTTPS certificate valid
- [ ] No critical errors in monitoring dashboard

---

## PHASE 11: ROLLBACK VERIFICATION (IF NEEDED)

### Step 11.1: Identify Rollback Trigger

```bash
echo "Rollback ONLY if:"
echo "  ✓ Application crashes (500 errors)"
echo "  ✓ Database connection fails"
echo "  ✓ Stripe webhooks not processing"
echo "  ✓ Security issue found"
echo ""
echo "Otherwise, troubleshoot and fix in place"
```

### Step 11.2: Execute Code Rollback

```bash
# Find previous known-good commit
git log --oneline main | head -10

# Create rollback branch
git checkout -b rollback/production-incident-$(date +%s)

# Revert bad commit (replace XXXXX with commit SHA)
git revert XXXXX

# Push rollback
git push -u origin rollback/production-incident-*

# Trigger deployment of rollback branch
# (Use your CI/CD system to deploy this branch)

echo "Rollback pushed. Monitor deployment pipeline."
```

- [ ] Previous good commit identified
- [ ] Rollback branch created
- [ ] Revert commit pushed
- [ ] Deployment triggered for rollback

### Step 11.3: Verify Rollback

```bash
# After 5-10 minutes, verify
curl -s "$PRODUCTION_URL/api/health"
# Expected: 200 OK

# Check error rate
curl -s "$PRODUCTION_URL/api/health/errors" 
# Expected: Error rate < 1%

# Check database
psql "$DATABASE_URL" -c "SELECT 1" && echo "✓ Database OK" || echo "✗ Database FAILED"

# Check Stripe
curl -s "$PRODUCTION_URL/api/health/stripe" && echo "✓ Stripe OK" || echo "✗ Stripe FAILED"

echo ""
echo "If all checks pass, production is recovered."
echo "Post-incident review: Document what went wrong."
```

- [ ] Health checks pass after rollback
- [ ] Error rate < 1%
- [ ] Database responsive
- [ ] Stripe webhooks working
- [ ] Post-incident review scheduled

---

## FINAL CHECKLIST: ALL PHASES COMPLETE

```bash
echo "=== DEPLOYMENT COMPLETE ==="
echo ""
echo "Verify all phases:"
echo "✓ Phase 0: Pre-execution verification"
echo "✓ Phase 1: Database provisioning"
echo "✓ Phase 2: GitHub checks"
echo "✓ Phase 3: Secrets management"
echo "✓ Phase 4: Prisma migrations"
echo "✓ Phase 5: Stripe setup"
echo "✓ Phase 6: Monitoring setup"
echo "✓ Phase 7: Staging deployment"
echo "✓ Phase 8: Webhook testing"
echo "✓ Phase 9: Production go/no-go"
echo "✓ Phase 10: Production deployment"
echo "✓ Phase 11: Rollback verification (if needed)"
echo ""
echo "Status: DEPLOYMENT COMPLETE"
echo "Time Elapsed: ~10-14 business days"
echo "Next: Monitor production for 24-72 hours"
```

- [ ] All phases executed
- [ ] All checks passing
- [ ] Production deployed
- [ ] Monitoring active
- [ ] Team on standby for 24 hours

---

## QUICK REFERENCE: COMMANDS BY PHASE

| Phase | Key Command | Status |
|-------|------------|--------|
| 1 | `psql "$DATABASE_URL" -c "SELECT 1"` | ☐ |
| 2 | `npm run governance:scan:strict` | ☐ |
| 3 | `gh secret set DATABASE_URL` | ☐ |
| 4 | `npx prisma migrate deploy` | ☐ |
| 5 | `curl https://api.stripe.com/v1/customers` | ☐ |
| 6 | `gh secret set SENTRY_DSN` | ☐ |
| 7 | `vercel deploy --prod` | ☐ |
| 8 | `psql "$DATABASE_URL" -c "SELECT * FROM webhook_events"` | ☐ |
| 9 | `curl "$PRODUCTION_URL/api/health"` | ☐ |
| 10 | `curl -s -I "$PRODUCTION_URL" \| grep https` | ☐ |
| 11 | `git revert XXXXX && git push` | ☐ |

---

## TROUBLESHOOTING: COMMON FAILURES

### Database Connection Fails

```bash
# Check connection string
echo $DATABASE_URL

# Verify host is reachable
ping $(echo $DATABASE_URL | cut -d'@' -f2 | cut -d':' -f1)

# Test with psql verbose
psql "$DATABASE_URL" -c "SELECT 1" -v verbose=on

# Check SSL mode
# Ensure "sslmode=require" is in connection string
```

### Prisma Migrations Fail

```bash
# Check migration status
npx prisma migrate status

# Reset (CAUTION: loses data)
# Only in staging/development
npx prisma migrate reset

# Or manually run migrations
npx prisma migrate deploy --skip-generate
```

### Stripe Webhook Not Received

```bash
# Check endpoint is reachable
curl -X POST "$PRODUCTION_URL/api/webhooks/stripe" \
  -H "Content-Type: application/json" \
  -d '{"test": true}'
# Expected: 401 (Unauthorized - webhook signature missing, which is fine for test)

# Check logs
tail -f /var/log/opsiq/app.log | grep webhook

# Verify secret in Stripe dashboard
echo "STRIPE_WEBHOOK_SECRET=$STRIPE_WEBHOOK_SECRET"
# Should match Stripe dashboard value
```

### Sentry Not Capturing Errors

```bash
# Trigger test error (if test endpoint exists)
curl "$PRODUCTION_URL/api/test-error" 2>/dev/null

# Check Sentry dashboard
# Wait 30 seconds
# Error should appear in: https://sentry.io/

# If not appearing, verify SENTRY_DSN is set
echo $SENTRY_DSN
```

---

## SUPPORT & CONTACTS

| Issue | Contact | Action |
|-------|---------|--------|
| Database provider down | Provider support | Check status dashboard |
| Stripe API issues | Stripe support | Check https://status.stripe.com/ |
| Deployment fails | DevOps team | Check deployment logs |
| Performance issues | On-call engineer | Check monitoring dashboard |
| Security incident | Security team | Follow incident response |

---

**Created:** 2026-05-22  
**Version:** 1.0  
**Last Updated:** 2026-05-22  
**Owner:** DevOps / Operations Team

---

## HOW TO USE THIS DOCUMENT

1. **Print or save** this document before starting
2. **Start with Phase 0** - verify your environment
3. **Work through each phase** - don't skip steps
4. **Check boxes** as you complete each step
5. **If any step fails**, see TROUBLESHOOTING section above
6. **At end of each phase**, review the checklist
7. **Before production**, complete Phase 9 decision table with team
8. **During production deployment**, stay alert and monitor Phase 11
9. **After 24 hours**, mark deployment as successful
10. **Share learnings** in post-incident review (if needed)

**Expected Timeline:** 3-5 hours with experienced team (if all infrastructure pre-selected)

---

End of checklist. When complete, all 7 P0 blockers are resolved and production deployment is complete.
