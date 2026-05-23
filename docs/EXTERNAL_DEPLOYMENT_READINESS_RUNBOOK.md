# External Deployment Readiness Runbook

**Status Label:** `CODE_GOVERNANCE_READY_DEPLOYMENT_OPS_BLOCKED`

**Last Updated:** 2026-05-23

---

## Executive Summary

OpsIQ code is **governance-ready for external deployment**. All repo-side infrastructure, validation, and smoke-testing systems are in place. 

**External deployment is currently blocked** on non-code factors:
- No actual external hosting available
- No staging/production database provisioning
- No monitoring/alerting infrastructure
- No Stripe webhook testing with real external URLs
- No customer authentication provider configuration

This runbook defines the **repo-side** readiness checklist and verification procedures that will be executed when external deployment becomes available.

---

## What Is Repo-Ready

✅ **Governance Framework**
- Lint ratchet gate: Prevents lint debt accumulation
- ESLint configuration: Auth enforcement rules for controlled access
- Governance scanner: Validates business logic isolation
- Structured error classification: User-facing vs. operational errors

✅ **Health & Readiness Infrastructure**
- `/api/health` endpoint: Comprehensive application health checks
- `/api/readiness` endpoint: Deployment readiness probes
- `/api/startup` endpoint: Startup verification
- `/api/ops/readiness` endpoint: Readiness history and audit trail
- `/api/ops/runtime` endpoint: Real-time operational metrics

✅ **Pre-Deployment Verification Scripts**
- `npm run deployment:preflight` - Environment validation
- `npm run deployment:smoke` - Offline smoke testing
- `npm run support:diagnostics` - Support bundle generation

✅ **CI/CD Gates**
- Governance compliance scanning
- TypeScript type checking
- Prisma schema validation
- Database migrations
- Next.js build verification
- Full test suite execution

---

## What Is Externally Blocked

❌ **No External Hosting**
- Required for: Actual deployment, staging verification, production access

❌ **No Database Provisioning**
- Required for: Migration execution, production data, backup strategy

❌ **No Monitoring/Alerting**
- Required for: Production observability, incident response, SLA tracking

❌ **No Stripe Integration**
- Required for: Payment processing, webhook testing with real URLs, billing

❌ **No Authentication Provider**
- Required for: Multi-user login, session management in production

❌ **No Email/Notification System**
- Required for: User communications, alerts, support escalation

---

## Preflight Verification

**Before attempting external deployment, verify:**

```bash
npm run deployment:preflight
```

This checks:
- Required environment variables present
- Node version compatibility
- npm/package manager state
- Prisma schema validity
- Pending migrations (if DATABASE_URL provided)

**Expected output:** `Preflight Status: READY` (or `WARNING` for non-blocking issues)

**Report location:** `.claude/deployment_preflight_report.json`

---

## Smoke Testing

**Local offline smoke test (no deployment required):**

```bash
npm run deployment:smoke
```

Expected output: `BASE_URL_REQUIRED_FOR_SMOKE_TEST` (this is correct - deployment is not available yet)

**Remote smoke test (once deployment available):**

```bash
npm run deployment:smoke https://app.example.com
```

This tests:
- Health endpoint (`/api/health`)
- Readiness endpoint (`/api/readiness`)
- Startup endpoint (`/api/startup`)
- Ops readiness history (`/api/ops/readiness`)
- Runtime metrics (`/api/ops/runtime`)

**Report location:** `.claude/production_smoke_report.json`

---

## Support Diagnostics

**Generate support bundle for deployment teams:**

```bash
npm run support:diagnostics
```

This collects (without secrets):
- Git commit SHA and branch
- Node/npm versions
- Package scripts availability
- Validation results (Prisma, lint, governance, TypeScript, build)
- Environment variable presence (names only, no values)
- Endpoint availability

**Report location:** `.claude/support_diagnostics_bundle.json`

---

## Staging Verification Checklist

When staging environment becomes available:

- [ ] Preflight checks pass
- [ ] Smoke tests pass against staging URL
- [ ] Health endpoint returns `status: healthy`
- [ ] Readiness endpoint returns `is_ready: true`
- [ ] Startup endpoint returns `is_ready: true` with all checks passing
- [ ] Ops/readiness shows full audit history
- [ ] Ops/runtime shows realistic metrics (no anomalies)
- [ ] Support diagnostics bundle generates without errors
- [ ] Logs show no governance violations
- [ ] Database migrations completed successfully
- [ ] Prisma client generated correctly
- [ ] All API routes registered and responding

---

## Production Verification Checklist

Before production go-live:

**Code & Governance**
- [ ] All lint ratchet gates passing
- [ ] Governance scan showing 0 errors
- [ ] TypeScript compilation clean
- [ ] All tests passing

**Infrastructure**
- [ ] Database provisioned and migrated
- [ ] Monitoring/alerting configured
- [ ] Error tracking configured
- [ ] Logging aggregation configured
- [ ] Backup/restore strategy verified

**Functionality**
- [ ] Health endpoint healthy
- [ ] Readiness probe returning ready
- [ ] Startup checks all passing
- [ ] All critical endpoints tested
- [ ] Stripe webhooks configured (if used)
- [ ] Authentication provider integrated
- [ ] Email system functional

**Documentation**
- [ ] Deployment runbook reviewed
- [ ] Support contacts documented
- [ ] Incident response procedures defined
- [ ] Rollback procedures documented

---

## Rollback Checklist

If production issues detected:

- [ ] Identify affected services using `/api/ops/runtime` metrics
- [ ] Review recent audit trail via `/api/ops/readiness`
- [ ] Check health endpoint for specific failure types
- [ ] Revert to previous working deployment
- [ ] Verify health/readiness return to normal
- [ ] Document incident for post-mortem

---

## Important Limitations

### PR #14 (test:ci Runner) - PARKED

PR #14 contains the deterministic test CI runner implementation but is currently parked due to GitHub Actions CI access limitations. This PR is **not required** for external deployment.

**Status:** Parked, not merged
**Reason:** CI build-and-test job fails; logs inaccessible for diagnostics
**Resume conditions:**
- GitHub Actions logs become accessible
- Root cause of failure becomes locally reproducible
- PR will be resumed when debugging tools are available

**Impact on deployment:** None - existing test infrastructure works via ci-cd-foundations workflow

### Stripe Webhook UAT

**Requires actual external deployment:**
- Staging/production URL accessible from internet
- Stripe webhook configuration with actual URL
- Real Stripe test mode account
- Cannot be fully tested without external access

### Multi-Tenant Support

**Requires auth provider integration:**
- OAuth/OIDC configuration
- User session management
- Tenant isolation verification
- Cannot be fully tested without auth provider

---

## Endpoints Reference

### Health Check
```
GET /api/health
Returns: { status, timestamp, version, environment, checks }
Healthy: 200 (or 200 degraded if DB unavailable but other services ok)
Purpose: Application health verification
```

### Readiness Probe
```
GET /api/readiness
Returns: { startup_complete, database_healthy, queue_healthy, is_ready }
Ready: 200
Not Ready: 503
Purpose: Deployment readiness verification, load balancer probes
```

### Startup Probe
```
GET /api/startup
Returns: { is_ready, config_loaded, database_migrated, routes_registered }
Ready: 200
Not Ready: 503
Purpose: Kubernetes/Heroku startup verification
```

### Ops Readiness
```
GET /api/ops/readiness
Returns: { current status, history of readiness events, audit trail }
Purpose: Support team diagnostics, incident investigation
```

### Runtime Metrics
```
GET /api/ops/runtime
Returns: { active_requests, memory_usage, performance metrics, errors, slow_requests }
Purpose: Operational observability, performance monitoring
```

---

## Next Steps After External Deployment Available

1. Provision staging database
2. Deploy to staging environment
3. Run `npm run deployment:preflight` → verify READY
4. Run `npm run deployment:smoke https://staging.example.com` → verify all tests pass
5. Execute staging verification checklist
6. Fix any issues and repeat
7. Move to production with same verification flow

---

## Support Contact

For questions about deployment readiness:
- Check `.claude/deployment_preflight_report.json` for configuration issues
- Check `.claude/production_smoke_report.json` for endpoint issues
- Check `.claude/support_diagnostics_bundle.json` for build/validation issues
- Run `npm run deployment:preflight` to identify blockers

---

**Document Status:** Ready for external deployment preparation  
**Last Verified:** 2026-05-23  
**Next Review:** When external deployment becomes available
