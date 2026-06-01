# Production Signup → Owner Dashboard: Deployment Verification Blocked

**Status**: BLOCKED - PRODUCTION DEPLOYMENT VERIFICATION FAILED  
**Date**: 2026-06-01  
**Attempted**: npx tsx scripts/smoke-production-signup-dashboard.ts  
**Base URL**: https://o-ps-iq.vercel.app

---

## Deployment Verification Failure

### First Test Step: GET /api/internal/build-info

**Expected**: Status 200 with build info  
**Actual**: Status 403 Forbidden  
**Error Header**: `x-deny-reason: host_not_allowed`  
**Error Message**: "Host not in allowlist"

### Root Cause

The production Vercel deployment has a security restriction blocking access to `/api/internal/*` endpoints from external hosts. This appears to be:

1. **Not in application code** (checked src/app/api/internal/build-info/route.ts - no auth logic)
2. **Vercel edge network level** (x-deny-reason header suggests Vercel proxy/WAF)
3. **Possible causes**:
   - Vercel security policy blocking external access to /internal routes
   - Cloudflare or other proxy in front of Vercel with host allowlist
   - DDoS protection blocking the access pattern
   - Production deployment has restrictive environment compared to earlier test

### Impact

**Cannot proceed with smoke test** because:
- Step 0 (deployment verification) fails
- Cannot confirm deployed commit matches expected version
- Cannot start signup flow without confirming deployment is ready
- Workflow waits for Vercel deployment; access restriction prevents verification

---

## Historical Context

The PRODUCTION_DIAGNOSIS_DASHBOARD_VERIFICATION_CLOSURE.md (commit ae8de45f) reported:

```
Deployment Verification:
GET /api/internal/build-info status: 200 ✓
environment: production ✓
deployed_commit: 6772aef ✓
```

This indicates the build-info endpoint was accessible during the previous smoke run.

---

## Options

### Option 1: Investigate Vercel Deployment Configuration

The production Vercel deployment may have:
- Environment variable controlling access restrictions
- Vercel project settings with IP allowlist
- Middleware or edge function blocking internal routes

### Option 2: Access Internal Endpoints from Authorized Network

The smoke test may need to run from:
- GitHub Actions workflow (trusted source)
- Vercel deployment itself (internal network)
- Authorized IP/network with build-info access

### Option 3: Skip Build-Info Verification

If build-info is confirmed deployed via other means (e.g., Vercel build logs), the smoke script could be modified to:
- Accept deployed commit as parameter
- Skip the verification step
- Proceed directly to signup test

However, this would weaken the smoke test's ability to guarantee the right commit is deployed.

---

## Current Blocking Status

```
production_deployment_verification:
  build_info_status: 403 FORBIDDEN
  environment: UNKNOWN (cannot read from endpoint)
  deployed_commit: UNKNOWN (cannot read from endpoint)
  
signup: NOT_ATTEMPTED (blocked by deployment verification)
owner_dashboard: NOT_ATTEMPTED (blocked by deployment verification)

fallback_used: N/A
mock_data_detected: N/A
empty_state_valid: N/A
failure_if_any: BUILD_INFO_ENDPOINT_BLOCKED

decision:
  BLOCKED_WITH_EXACT_REMAINING_FAILURE
  
  Failure: Production /api/internal/build-info returns 403 Forbidden
  Reason: Host not in allowlist (Vercel edge network restriction)
  Impact: Cannot verify deployed commit before running signup test
  Resolution: Requires investigation of Vercel deployment security settings
```

---

## Recommendation

**For Development/CI Environment**: Run smoke test via GitHub Actions workflow which may have authorized access to the Vercel deployment.

**For Manual Verification**: Contact Vercel support or check deployment environment variables/settings to understand the /api/internal route access restrictions.

**For Next Iteration**: Once build-info access is restored, rerun:
```bash
BASE_URL="https://o-ps-iq.vercel.app" npx tsx scripts/smoke-production-signup-dashboard.ts
```
