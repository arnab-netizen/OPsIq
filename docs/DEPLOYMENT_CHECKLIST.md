# DEPLOYMENT CHECKLIST — Phase 13 Enterprise Hardening

**Purpose:** Pre-deployment verification for OpsIQ v0.1.0+ (Phase 13+)  
**Last Updated:** 2026-05-11  
**Readiness Gates:** All non-DB gates must PASS before deployment

---

## Pre-Deployment Checks (Run before any environment)

### Code Quality Gates
- [ ] `npm run build` passes
- [ ] `npx tsc --noEmit` passes (no TypeScript errors)
- [ ] `npx prisma validate` passes (schema valid)
- [ ] `npm test` passes or DATABASE_URL unavailable (acceptable if DB_BLOCKED)
- [ ] All security checks pass (auth, workspace isolation, DTO redaction)

### CI/CD Validation
- [ ] `.github/workflows/ci-cd-foundations.yml` exists
- [ ] Workflow includes: npm ci, prisma validate, tsc --noEmit, npm run build
- [ ] Workflow runs on push to main/develop
- [ ] Branch protection enforces verify job passes for PRs
- [ ] Deployment job creates staging environment on main push

### Execution State
- [ ] `.claude/execution_state.json` current and accurate
- [ ] Phase 13 Slice 1 marked COMPLETE_CODE_VERIFIED_NOT_RUNTIME_ACTIVE
- [ ] All Phases 0-12 marked PRESENT_RUNTIME_VERIFIED
- [ ] All non-DB gates documented in execution_state

### Recovery Artifacts
- [ ] `docs/LOCAL_ONLY_RECOVERY_LEDGER.md` exists with unpushed commit log
- [ ] `docs/opsiq-main-sync-latest.patch` exists (recovery from local loss)
- [ ] `docs/opsiq-main-sync-latest.bundle` exists (binary bundle for safe merge)
- [ ] `docs/manual-main-sync-summary.md` exists with merge instructions

---

## Staging Deployment Checklist (Before pushing to staging)

### Environment Setup
- [ ] Staging database provisioned and reachable
- [ ] DATABASE_URL configured in staging env vars
- [ ] NODE_ENV=production
- [ ] SKIP_ENV_VALIDATION=false (validate all env vars in staging)
- [ ] SSL certificate provisioned and valid
- [ ] Domain DNS configured (point to staging endpoint)

### Database & Schema
- [ ] `npx prisma migrate deploy` runs without errors in staging
- [ ] All Prisma models generated correctly
- [ ] Database schema matches prisma/schema.prisma
- [ ] FK constraints applied
- [ ] Indexes created on critical columns

### Application Health
- [ ] `GET /health` endpoint responds with status 200 or 503
- [ ] Health check includes database latency
- [ ] Application starts without errors
- [ ] No startup logs show WARN or ERROR (except expected DB timeouts)

### Data Seeding (if applicable)
- [ ] Seed script exists (scripts/seed-staging.ts or similar)
- [ ] Seed script creates test workspace + users
- [ ] Seed script creates sample engagements/actions/decisions
- [ ] Seed data is deterministic and repeatable

### Security Verification
- [ ] All API routes enforce `withAuth` middleware
- [ ] All mutations check workspace enforcement (`enforceWorkspaceScoping`)
- [ ] All public DTOs exclude internal fields (cost, profitability, etc.)
- [ ] Audit events logged for all material operations
- [ ] CORS configured correctly for staging domain

### Monitoring & Logging
- [ ] Application logs to staging logger (stdout or Sentry)
- [ ] Error tracking configured (Sentry integration if available)
- [ ] Basic metrics available (response time, error rate)
- [ ] Log level set to INFO in staging

### Smoke Tests (Manual)
- [ ] Can create workspace
- [ ] Can create engagement
- [ ] Can create action with outcome
- [ ] Can export decision with audit trail
- [ ] Health check endpoint responds
- [ ] No console errors in browser (dev tools)

---

## Production Deployment Checklist (Before push to production)

### Pre-Production Approval
- [ ] Security team reviews code for vulnerabilities
- [ ] Product team approves feature set and UI/UX
- [ ] Operations team reviews deployment plan
- [ ] Rollback plan reviewed and tested
- [ ] Customer support trained on new features

### Production Infrastructure
- [ ] Production database provisioned, backed up, and tested
- [ ] DATABASE_URL configured in production secrets (not in code/config files)
- [ ] SSL certificate provisioned and auto-renewal configured
- [ ] Production domain DNS configured
- [ ] CDN configured for static assets (if applicable)
- [ ] WAF rules configured (if behind WAF)

### Monitoring & Alerting
- [ ] Error tracking configured (Sentry with production project)
- [ ] Metrics dashboard configured (CloudWatch, DataDog, or similar)
- [ ] Alert rules configured for critical errors (>5% error rate)
- [ ] Alert rules configured for database (connection pool, slow queries)
- [ ] Uptime monitoring configured (pingdom, healthchecks.io, etc.)
- [ ] Logging retention configured (30+ days for audit trail)

### Backup & Disaster Recovery
- [ ] Automated backups configured (nightly or more frequent)
- [ ] Backup retention policy set (7+ days for test, 30+ days for production)
- [ ] Backup restore tested (restore to separate DB and verify)
- [ ] Point-in-time recovery (PITR) configured if available
- [ ] Disaster recovery runbook documented

### Final Security Audit
- [ ] All secrets use environment variables (no hardcoded values)
- [ ] Database password rotated
- [ ] API keys rotated
- [ ] SSH keys secured and backed up
- [ ] Database connection uses SSL/TLS
- [ ] All external API calls use HTTPS

### Deployment Execution
- [ ] Deployment window scheduled (low-traffic time)
- [ ] On-call engineer assigned for deployment
- [ ] Rollback plan documented and accessible
- [ ] Stakeholders notified (customer success, support, ops)
- [ ] Customer communication prepared (status page update if needed)

### Post-Deployment Verification (Immediate - first 5 minutes)
- [ ] Application is up and responding to HTTP requests
- [ ] `GET /health` returns 200 (all systems healthy)
- [ ] No critical errors in logs
- [ ] Database connection verified
- [ ] Monitoring shows normal traffic patterns

### Post-Deployment Verification (First 24 hours)
- [ ] No unexpected errors in error tracking system
- [ ] API response times within acceptable range (<500ms p95)
- [ ] No database connection pool exhaustion
- [ ] Backup completed successfully
- [ ] Customer feedback (if applicable) indicates no issues

---

## Environment-Specific Configurations

### Development
- NODE_ENV=development
- SKIP_ENV_VALIDATION=true (optional, for convenience)
- Debug logging enabled
- No external API calls required

### Staging
- NODE_ENV=production (simulate production)
- SKIP_ENV_VALIDATION=false
- Real database (separate from production)
- Real external API calls (if applicable)
- Full SSL/TLS setup

### Production
- NODE_ENV=production
- SKIP_ENV_VALIDATION=false
- Separate encrypted database
- All external APIs configured
- Full SSL/TLS + security hardening
- Monitoring and alerting configured

---

## Rollback Procedure (If needed)

See `docs/ROLLBACK_PLAN.md` for detailed rollback instructions.

**Quick rollback:**
1. Revert deployment (redeploy previous known-good commit)
2. Restart application
3. Verify health check passes
4. Monitor logs for errors
5. Notify stakeholders

**Database rollback:**
1. Stop application
2. Restore database from pre-deployment backup
3. Restart application
4. Verify health check passes

---

## Sign-Off

- [ ] Technical Lead: ___________________  Date: _______
- [ ] Product Manager: ___________________  Date: _______
- [ ] Operations: ___________________  Date: _______

---

**Generated by Phase 13 Slice 8: Readiness + Deployment Validation**
