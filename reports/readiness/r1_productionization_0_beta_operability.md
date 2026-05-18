# R1-PRODUCTIONIZATION-0: Controlled Beta Operability

**Date:** 2026-05-18  
**Phase:** R1-PRODUCTIONIZATION-0 PHASE E — Beta Operability  
**Status:** ✓ AUDIT COMPLETE

---

## A. Beta Tenant Onboarding Readiness ✓ READY

**Onboarding Capabilities:**
- Create workspace ✓
- Create user roles ✓
- Assign capabilities ✓
- Configure Stripe integration ✓
- Set webhook endpoints ✓

**Missing:**
- Automated onboarding flow
- Bulk tenant import
- Self-service tenant provisioning

**Beta Readiness:** ✓ **READY** (manual onboarding acceptable)

---

## B. Beta Tenant Isolation ✓ SAFE

**Isolation Enforcement:**
- Workspace ID scoping ✓
- Database-level workspace isolation ✓
- Audit trail per workspace ✓
- Entitlements per workspace ✓

**Isolation Verification:**
- Can query other workspace data: ✗ (scoped at middleware)
- Cross-workspace operations: ✗ (blocked at API)
- Cross-tenant audit leakage: ✗ (separated by workspace)

**Beta Readiness:** ✓ **SAFE**

---

## C. Beta Failure Monitoring Readiness ⚠ PARTIAL

**Available Monitoring:**
- Health checks (/api/health, /readiness, /liveness) ✓
- Error classification + Sentry ✓
- Audit trail queryable ✓
- Database connection monitoring ✓

**Missing:**
- Real-time dashboard
- Alert thresholds
- Anomaly detection
- Request rate monitoring

**Manual Monitoring Required:**
- Daily audit trail review
- Daily error log review
- Weekly health check review

**Beta Readiness:** ⚠ **PARTIAL** (manual daily review required)

---

## D. Dangerous Flows Disable Capability ⚠ PARTIAL

**Can Be Disabled Administratively:**
- Webhook reception: ✗ (no kill-switch, must stop service)
- Billing operations: ✗ (no capability-based disable)
- Decision execution: ✗ (no capability-based disable)
- Entitlement sync: ✗ (no capability-based disable)

**Recommendation:** Add BETA_FEATURE flags for critical flows

**Beta Readiness:** ⚠ **PARTIAL** (requires restart to disable flows)

---

## E. Emergency Kill-Switch Capability ✗ MISSING

**Missing:**
- Rapid tenant disable (would prevent their access)
- Rapid feature disable (would impact all beta tenants)
- Rapid webhook disable (would stop processing)

**Current Mitigation:**
- Can stop Docker container (disables all tenants)
- Can pause database (disables all tenants)

**Beta Readiness:** ⚠ **PARTIAL** (all-or-nothing disable only)

---

## F. Beta Support Workflow ⚠ PARTIAL

**Available:**
- Audit trail for issue investigation ✓
- Error logs for debugging ✓
- Database access for manual fixes ✓

**Missing:**
- Support ticketing system
- Issue triage process
- SLA definitions
- Customer notification process
- Status page

**Estimated Setup:** 4-8 hours per workflow

**Beta Readiness:** ⚠ **PARTIAL** (manual support only)

---

## G. Audit Extraction for Investigations ✓ SAFE

**Query Capabilities:**
- Export audit events by workspace ✓
- Export audit events by actor ✓
- Export audit events by entity ✓
- Reconstruct entity state ✓

**Missing:**
- Operator tool for audit queries
- Pre-built investigation queries
- Automated compliance export

**Manual Effort:** 30 minutes per investigation

**Beta Readiness:** ✓ **SAFE** (manual queries acceptable)

---

## H. Issue Triage Process ⚠ MISSING

**Needed:**
1. Issue categorization (bug, user error, feature request)
2. Priority assignment (critical, high, medium, low)
3. Owner assignment
4. Communication process
5. Resolution tracking

**Estimated Setup:** 4-6 hours

**Beta Readiness:** ⚠ **PARTIAL**

---

## I. Billing Management Capabilities ⚠ PARTIAL

**Can Do:**
- View workspace subscription ✓
- View charges ✓
- Verify entitlements ✓

**Missing:**
- Disable billing (prevent future charges)
- Freeze subscription (pause charges)
- Refund charges (manual via Stripe)
- Override entitlements
- Emergency billing disable

**Estimated Effort:** 4-6 hours

**Beta Readiness:** ⚠ **PARTIAL**

---

## J. Entitlement Override Capability ✗ MISSING

**Needed:**
- Emergency grant entitlements
- Revoke entitlements
- Extend trial period
- Adjust subscription tier

**Current:** Manual database modifications only

**Estimated Effort:** 4-6 hours

**Beta Readiness:** ⚠ **PARTIAL**

---

## K. Ops/Admin Visibility ⚠ PARTIAL

**Available:**
- Health dashboard (can query API) ⚠
- Error logs (via Sentry) ✓
- Audit trail (database query) ✓
- Database access ✓

**Missing:**
- Admin dashboard UI
- Tenant list + status
- User list + activity
- Billing overview
- Feature usage tracking

**Estimated Effort:** 20-30 hours

**Beta Readiness:** ⚠ **PARTIAL** (manual queries required)

---

## L. Beta Scale Estimates

### L.1 Maximum Safe Beta Tenant Count

**Database Capacity:**
- Connections: 100 (default PostgreSQL connection pool)
- Estimated: 100 tenants × 1 concurrent user = 100 connections ✓
- Estimated: 100 tenants × 5 concurrent users = 500 connections ✗
- **Safe limit: 20-30 tenants** (assuming 2-3 concurrent users per tenant)

### L.2 Maximum Safe Concurrent Usage

**Request Rate Capacity:**
- Framework: Next.js can handle 1000+ req/s theoretically
- Database: PostgreSQL can handle 100-500 req/s per connection
- Estimated: 20 tenants × 10 req/min = 200 req/min ✓
- Estimated: 20 tenants × 100 req/min = 2000 req/min ✗
- **Safe limit: 500-1000 req/min** (20-30 concurrent users)

### L.3 Concurrent User Estimate

- Average workflow: 2-3 minutes per action
- Average user: 10-20 actions/day
- Daily active: 1-2 users per 100k users
- **Safe estimate: 2-3 concurrent users per tenant**

---

## M. Operational Staffing Requirement

### M.1 For 20-30 Tenants in Beta

**Daily Activities:**
- Health check monitoring: 15 min
- Error log review: 30 min
- Audit trail spot-check: 30 min
- Tenant support response: 1-2 hours
- **Total daily: 2.5-3.5 hours**

**On-Call Response:**
- P1 incident: 15-30 min to diagnose, 30-60 min to resolve
- P2 incident: 1-2 hours to diagnose, 2-4 hours to resolve

**Staffing Recommendation:**
- Primary operator: 1 FTE (can handle support + monitoring)
- Backup operator: 0.5 FTE (on-call, escalation)
- Estimated cost: $200k/year (primary + backup)

---

## N. Monitoring Requirement

### N.1 For Beta

**Must Monitor:**
- HTTP error rate (should be <1%)
- Database connection pool usage (should be <80%)
- Webhook processing latency (should be <5s)
- Audit event creation (should succeed 100%)
- Stripe sync status (check daily)

**Automated Monitoring:**
- Health check endpoints (every 60s) ✓
- Error rate alerting (missing)
- Resource monitoring (missing)

**Estimated Setup:** 4-6 hours

---

## O. Minimum Viable Support Process

### O.1 Incident Response

1. **Alert Received** (from monitoring)
2. **Diagnosis** (check health, logs, audit trail)
3. **Decision** (rollback, fix, document)
4. **Customer Notification** (email or dashboard)
5. **Post-Incident Review** (identify root cause)

**Estimated Time:** 30 minutes - 2 hours (depending on severity)

### O.2 Feature Request Response

1. **Triage** (validate, estimate effort)
2. **Decision** (accept, defer, decline)
3. **Estimation** (effort in hours/days)
4. **Roadmap** (schedule if accepted)

**Estimated Time:** 1-2 hours per request

---

## P. Beta Operability Summary

| Capability | Status | Effort to Implement | Beta Readiness |
|-----------|--------|---------------------|-----------------|
| Onboarding | ✓ | 0 | READY |
| Isolation | ✓ | 0 | SAFE |
| Failure Monitoring | ⚠ | 4-6 hours | PARTIAL |
| Dangerous Flow Disable | ⚠ | 4-6 hours | PARTIAL |
| Kill-Switch | ✗ | 6-8 hours | MISSING |
| Support Workflow | ⚠ | 4-8 hours | PARTIAL |
| Audit Extraction | ✓ | 0 | SAFE |
| Issue Triage | ✗ | 4-6 hours | MISSING |
| Billing Management | ⚠ | 4-6 hours | PARTIAL |
| Entitlement Override | ✗ | 4-6 hours | MISSING |
| Admin Visibility | ⚠ | 20-30 hours | PARTIAL |

**Overall Beta Operability:** ⚠ **PARTIAL** (operationally viable but limited)

---

## Q. Beta Launch Recommendations

### Q.1 Maximum Safe Beta Tenant Count
**20-30 tenants** (with 1 FTE primary operator)

### Q.2 Maximum Safe Concurrent Usage
**500-1000 requests/min** (~2-3 concurrent users per tenant)

### Q.3 Operational Staffing
- Primary operator: 1 FTE
- Backup on-call: 0.5 FTE
- Total cost: $200k/year

### Q.4 Minimum Implementation (Before Beta)
1. Failure monitoring + alerts
2. Kill-switch or feature disable
3. Support ticketing system
4. Manual admin dashboard
5. Documented rollback procedures

**Estimated Effort:** 24-32 hours (3-4 days)

### Q.5 Enhanced Beta (Weeks 2-4)
1. Admin UI dashboard
2. Entitlement override API
3. Billing management UI
4. Automated audit export

**Estimated Effort:** 40-60 hours (1 week)

---

**Beta Operability Status:** ⚠ **PARTIAL (VIABLE WITH CONSTRAINTS)**

