# Production Readiness Checklist - Phase 0 Deployment

**Last Updated**: 2026-05-07  
**Status**: DRAFT (awaiting Phase 0 completion)  
**Audience**: DevOps, Platform Engineering, SRE

---

## PRE-DEPLOYMENT (T-7 days)

### Secrets Management
- [ ] All DATABASE_URL, SESSION_SECRET, API_KEYS rotated (< 7 days old)
- [ ] Secrets stored in GitHub environment:production (not in code)
- [ ] Secrets audit log reviewed for unauthorized access
- [ ] Backup secrets for rollback prepared and tested
- [ ] Secret expiration dates documented

### Database Backups
- [ ] Full backup taken (< 24 hours old)
- [ ] Incremental backups enabled and verified
- [ ] Backup integrity verified (test restore to staging)
- [ ] Backup retention policy set (minimum 30 days for production)
- [ ] Disaster recovery procedure documented and tested
- [ ] RTO/RPO targets defined and achievable

### Schema & Migrations
- [ ] All pending migrations reviewed and approved
- [ ] Migration rollback tested (can we undo if deployment fails?)
- [ ] Schema changes backward compatible (no breaking changes)
- [ ] Data migration logic tested on staging database
- [ ] Backup taken before any migration deployment

### Dependency Updates
- [ ] npm dependencies up to date and security scanned
- [ ] Prisma client regenerated
- [ ] TypeScript compilation clean (no errors)
- [ ] No deprecated packages in use

---

## T-24 HOURS (Final Verification)

### Code Quality
- [ ] All CI gates passing on main branch
- [ ] Contract immutability gates passing (PHASE B)
- [ ] No new ignored tests added
- [ ] TypeScript --noEmit passes
- [ ] npm run build succeeds (full Next.js build)

### Staging Verification
- [ ] Deploy to staging environment (mirror production)
- [ ] Run full acceptance test suite on staging
- [ ] Load testing completed (baseline SLA performance verified)
- [ ] Security scan completed (SAST/DAST)
- [ ] Manual smoke tests passed (critical paths)

### Observability Baseline
- [ ] Datadog/monitoring agents deployed
- [ ] Error tracking (Sentry) configured and tested
- [ ] Log aggregation configured
- [ ] Metrics collection baseline established
- [ ] Alert thresholds configured (error rate, latency, etc.)
- [ ] On-call escalation path defined

### Documentation
- [ ] Runbook published (deployment, rollback, troubleshooting)
- [ ] Incident response procedure reviewed
- [ ] Escalation contacts documented
- [ ] Known issues & workarounds documented

---

## DEPLOYMENT DAY (T-0)

### Pre-Deployment (4 hours before)
- [ ] Team assembled and briefed
- [ ] Communication channel open (Slack, war room link)
- [ ] Monitoring dashboards open and watched
- [ ] Rollback plan reviewed and approved
- [ ] Backup verified recent and restorable

### Deployment Execution
- [ ] Startup verification script runs successfully: `bash scripts/startup-verification.sh`
  - [ ] NODE_ENV correct
  - [ ] DATABASE_URL set and connected
  - [ ] Schema valid (npx prisma validate)
  - [ ] Migrations deployed (npx prisma migrate deploy)
  - [ ] Contract verification passed
  - [ ] Contract tests passed (non-production)

- [ ] Health checks passing
  - [ ] API responding (200 OK)
  - [ ] Database queries working
  - [ ] Auth system functional
  - [ ] Critical service endpoints healthy

- [ ] Gradual traffic shift
  - [ ] 5% traffic for 15 minutes (monitor errors)
  - [ ] 25% traffic for 30 minutes (monitor performance)
  - [ ] 50% traffic for 60 minutes (monitor errors, latency)
  - [ ] 100% traffic (monitor for 2 hours post-deployment)

### Post-Deployment (2 hours)
- [ ] Error rate baseline (< 1%)
- [ ] Latency baseline (p95 < SLA)
- [ ] Database queries performing
- [ ] Auth flows working
- [ ] No critical alerts triggered
- [ ] All smoke tests passing
- [ ] Customer-facing features verified

### Documentation
- [ ] Deployment log recorded
- [ ] Deployment time logged
- [ ] Issues encountered documented
- [ ] Rollback decision criteria ready

---

## ROLLBACK CRITERIA (Abort & Rollback If)

**Automatic Rollback Triggers**:
- Error rate > 5% sustained for 5 minutes
- P95 latency > 2x baseline for 10 minutes
- Database connection pool exhausted
- Critical auth system failure
- Data corruption detected

**Manual Rollback Triggers**:
- Unexpected behavior reported by customer
- Critical security issue discovered
- Data inconsistency detected
- Contract violation detected (PHASE B)

**Rollback Procedure**:
1. Notify all stakeholders (incident)
2. Switch traffic back to previous version (load balancer)
3. Verify previous version health
4. Investigate root cause
5. Document incident
6. Plan fix and redeploy

---

## POST-DEPLOYMENT (T+24 hours)

### Verification
- [ ] All health checks still passing
- [ ] Error rates within normal range
- [ ] Performance metrics normal
- [ ] No data inconsistencies
- [ ] All features working as expected
- [ ] Customer feedback positive

### Analysis
- [ ] Performance analysis complete
- [ ] Error log review complete
- [ ] Resource utilization baseline recorded
- [ ] Deployment retrospective scheduled

### SLO/SLA Baseline
- [ ] 99.9% uptime achieved (0.43 min downtime max per day)
- [ ] P95 latency < 200ms
- [ ] Error rate < 0.1%
- [ ] Database connection health stable
- [ ] Log ingestion working

### Success Criteria
- [ ] Zero critical incidents
- [ ] Zero customer-facing errors
- [ ] All features working
- [ ] Performance acceptable
- [ ] Team confidence high

---

## ONGOING OPERATIONS (Weekly)

### Monitoring
- [ ] Weekly review of error logs
- [ ] Weekly review of performance metrics
- [ ] Weekly review of database query performance
- [ ] Weekly review of security alerts

### Maintenance
- [ ] Monthly dependency updates (if critical patches available)
- [ ] Monthly backup restoration test
- [ ] Monthly security scan
- [ ] Quarterly disaster recovery drill

### Readiness
- [ ] Contract immutability checks passing daily
- [ ] CI gates enforced on all merges
- [ ] CODEOWNERS review enforced
- [ ] Ignored test count stable

---

## EMERGENCY CONTACTS

| Role | Name | Phone | Slack |
|------|------|-------|-------|
| SRE Lead | TBD | TBD | @sre-lead |
| Database Lead | TBD | TBD | @db-lead |
| Security Lead | TBD | TBD | @security-lead |
| Product Lead | TBD | TBD | @product-lead |

---

## DEPLOYMENT SIGN-OFF

**Prepared By**: [Name]  
**Date**: [YYYY-MM-DD]  
**Reviewed By**: [Names]  
**Approved By**: [CTO/VP Engineering]  
**Deployment Window**: [Date/Time]  
**Estimated Duration**: 30-60 minutes

---

## Notes

- This checklist is PHASE 0 focused (stability, not features)
- Adjust thresholds (error rate, latency) based on actual SLA
- Runbook should be tested quarterly minimum
- On-call team must be trained on this procedure
- Emergency contact list must be kept current
