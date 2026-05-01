# Auth Bypass Audit Report

**Date**: 2026-05-01  
**Status**: CRITICAL FINDINGS IDENTIFIED AND IN REMEDIATION

## Executive Summary

Critical auth bypass vulnerabilities found in:
1. **x-user-id header trusting** - Backend trusts user ID from client-supplied headers
2. **Missing withAuth() checks** - 34 routes lack authentication enforcement
3. **localStorage userId dependency** - UI reads user ID from localStorage instead of authenticated session

## Detailed Findings

### 1. CRITICAL: x-user-id Header Trust

**Severity**: CRITICAL - Allows complete userId spoofing

#### Affected Files

| File | Issue | Status |
|------|-------|--------|
| `src/app/api/decisions/create/route.ts` | Reads userId from x-user-id header, no withAuth() | ✅ FIXED - Added withAuth(), removed header |
| `src/lib/workspace-validation.ts` | Middleware reads userId from x-user-id header | ✅ FIXED - Removed userId header reading |
| `src/ui/decision-csv-upload.tsx` | Sends user-id from localStorage via x-user-id header | ✅ FIXED - Removed localStorage userId |
| `src/ui/decision-creation-form.tsx` | Sends user-id from localStorage via x-user-id header | ✅ FIXED - Removed localStorage userId |

**Attack Vector**: Client can modify x-user-id header to impersonate any user
**Impact**: Cross-user access, data theft, privilege escalation

---

### 2. MIXED: Routes Using getSession() vs withAuth()

**Severity**: MEDIUM/LOW - Mix of authentication patterns

Analysis shows:
- ✅ Most routes (30+) use `getSession()` for basic authentication
- ❌ Few routes (2-3) have NO authentication at all  
- ⚠️ getSession() pattern lacks capability enforcement

**Truly Unprotected Routes** (NO auth at all):
- [x] `src/app/api/report/route.ts` - ✅ FIXED - Added withAuth()

**Confirmed Protected Routes** (use getSession via workspace context):
- ✅ `src/app/api/audit/route.ts` - Uses getWorkspaceContext → getSession()

**Routes Using getSession() Pattern** (Basic auth, no capabilities):

#### Financial/Decision Services (9 routes)
- [ ] `src/app/api/decisions/create/route.ts` - Creates decisions without auth
- [ ] `src/app/api/decisions/list/route.ts` - Lists decisions without auth
- [ ] `src/app/api/decisions/submit-external/route.ts` - Submits decisions without auth
- [ ] `src/app/api/decisions/intake/route.ts` - Intakes decisions without auth
- [ ] `src/app/api/decisions/[decisionId]/route.ts` - Updates decisions without auth
- [ ] `src/app/api/decisions/[decisionId]/evaluate/route.ts` - Evaluates decisions without auth
- [ ] `src/app/api/decision/export/route.ts` - Exports decisions without auth
- [ ] `src/app/api/value/route.ts` - Financial values without auth
- [ ] `src/app/api/value/summary/route.ts` - Value summaries without auth

#### Operational/Control Services (15 routes)
- [ ] `src/app/api/run/route.ts` - Runs operations without auth
- [ ] `src/app/api/override/route.ts` - Overrides controls without auth
- [ ] `src/app/api/operator/route.ts` - Operator actions without auth
- [ ] `src/app/api/operator/queue/route.ts` - Operation queue without auth
- [ ] `src/app/api/operator/myday/route.ts` - My day view without auth
- [ ] `src/app/api/calibration/route.ts` - Calibration without auth
- [ ] `src/app/api/control/blocked-metrics/route.ts` - Control metrics without auth
- [ ] `src/app/api/entity/route.ts` - Entity operations without auth
- [ ] `src/app/api/verify/route.ts` - Verification without auth
- [ ] `src/app/api/value/7day/route.ts` - 7-day values without auth
- [ ] `src/app/api/scenario/route.ts` - Scenarios without auth

#### Governance/Reporting Services (10 routes)
- [ ] `src/app/api/report/route.ts` - Reports without auth
- [ ] `src/app/api/audit/route.ts` - Audit logs without auth
- [ ] `src/app/api/governance/metrics/route.ts` - Governance metrics without auth
- [ ] `src/app/api/governance/alerts/route.ts` - Governance alerts without auth
- [ ] `src/app/api/intelligence/patterns/route.ts` - Intelligence patterns without auth
- [ ] `src/app/api/intelligence/summary/route.ts` - Intelligence summary without auth
- [ ] `src/app/api/intelligence/recommendations/route.ts` - Intelligence recommendations without auth
- [ ] `src/app/api/intelligence/insights/route.ts` - Intelligence insights without auth
- [ ] `src/app/api/observability/summary/route.ts` - Observability summary without auth

#### Intentionally Public Routes (OK - No Fix Needed)
- ✅ `src/app/api/auth/login/route.ts` - Public login
- ✅ `src/app/api/auth/logout/route.ts` - Public logout
- ✅ `src/app/api/health/route.ts` - Health check
- ✅ `src/app/api/onboarding/workspace/route.ts` - Public onboarding
- ✅ `src/app/api/onboarding/invite/route.ts` - Public invite

---

### 3. localStorage userId Dependency

**Severity**: CRITICAL - User ID from untrustworthy client storage

#### Affected UI Components

| File | Issue | Status |
|------|-------|--------|
| `src/ui/decision-csv-upload.tsx` (lines 48-51) | Reads `user-id` from localStorage | 🔴 NEEDS FIX |
| `src/ui/decision-creation-form.tsx` (lines 53-56) | Reads `user-id` from localStorage | 🔴 NEEDS FIX |

**Attack Vector**: Attacker modifies localStorage to impersonate other users  
**Impact**: Cross-user data access, unauthorized modifications

---

### 4. Legitimate Findings (Non-Issues)

#### Acceptable Header Reads
- `src/app/api/auth/login/route.ts` - Reads `user-agent` header for logging (OK - not identity)
- `src/lib/config.ts` - Development mode check with NODE_ENV (OK - internal only)
- `src/services/integrity/asymmetric.ts` - Production check for key generation (OK - not auth)

#### Bypass Detection (Legitimate Security Code)
- `src/services/control/enforcement.ts` - Detects/prevents bypasses (✅ GOOD)
- `src/app/api/run/route.ts` - Bypass prevention tracking (✅ GOOD)

---

## Remediation Plan

### Phase 1: Immediate Fixes (CRITICAL)

1. **Fix decisions/create/route.ts**
   - Add `withAuth()` call
   - Remove x-user-id header reading
   - Extract userId from session instead

2. **Fix workspace-validation.ts**
   - Remove userId header reading
   - Only validate workspaceId format
   - Let route handlers handle user auth

3. **Fix UI Components**
   - Remove localStorage.getItem("user-id")
   - Remove x-user-id header from fetch calls
   - Backend will use authenticated session

### Phase 2: Bulk Route Updates (THIS SESSION)

Add `withAuth()` to all 29 unprotected business routes:
- Extract `{ session, policy }` from `withAuth()` call
- Pass `{ session, policy }` to service layer as authContext
- Remove any direct header-based user/tenant identity

### Phase 3: Verification

- [ ] All routes use `withAuth()` or are in approved public list
- [ ] No routes read userId from headers
- [ ] No UI components read user ID from localStorage
- [ ] All service layers require authContext (already done for engagement, action, client)
- [ ] Security tests verify auth failure cases

---

## Implementation Status

### ✅ Completed (Session 1)
- [x] Service-layer auth hardening for engagement service
- [x] Service-layer auth hardening for action service  
- [x] Service-layer auth hardening for client-account service
- [x] requireServiceContext helper created
- [x] Tests for service-layer auth

### ✅ Completed (Session 2 - Auth Bypass Audit)
- [x] Fix decisions/create/route.ts - Remove x-user-id header reading, add withAuth()
- [x] Fix workspace-validation.ts - Remove userId header reading
- [x] Fix UI components - Remove localStorage userId
  - [x] decision-csv-upload.tsx
  - [x] decision-creation-form.tsx
- [x] Create AUTH_BYPASS_AUDIT.md with comprehensive findings

### 🔴 Remaining (Priority 1 - Session 2)
- [ ] Add withAuth() to 29 unprotected routes
- [ ] Update remaining service signatures for unpatched services

### ⏳ Not Started
- [ ] Patch recommendation service
- [ ] Patch findings service
- [ ] Patch evidence service
- [ ] Patch lead service
- [ ] Patch user service
- [ ] Comprehensive auth tests

---

## Security Properties After Remediation

✅ **No header-based userId spoofing possible**
- Backend rejects x-user-id header entirely
- All identity from authenticated session only

✅ **UI cannot bypass session auth**
- Removes localStorage-based user ID
- Relies on authenticated session from server

✅ **Fail-closed everywhere**
- All routes require explicit withAuth() call
- Missing auth results in 401 Unauthorized

✅ **Service layer protected**
- All business operations require authContext
- userId extracted only from authenticated context

---

## File Changes Log

### Priority 1: Critical Fixes
- `src/app/api/decisions/create/route.ts` - Complete rewrite with withAuth()
- `src/lib/workspace-validation.ts` - Remove userId header reading
- `src/ui/decision-csv-upload.tsx` - Remove localStorage userId
- `src/ui/decision-creation-form.tsx` - Remove localStorage userId

### Priority 2: Route Updates (29 files)
All routes to be updated with withAuth() pattern

### Priority 3: Service Updates (pending)
- recommendations service
- findings service
- evidence service
- lead service
- user service
- etc.

---

## Testing Checklist

For each fix:
- [ ] unauthenticated request returns 401
- [ ] spoofed user ID in header is rejected/ignored
- [ ] authenticated user gets correct session userId
- [ ] cross-tenant access prevented
- [ ] all existing tests pass
- [ ] no breaking changes to API contracts

