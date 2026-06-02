# P0 SECURITY REMEDIATION PLAN

**Date**: 2026-06-01  
**Status**: Evidence-Based Remediation Assessment  
**Trust Level**: Repository code inspection (exact file:line references)

---

## EXECUTIVE SUMMARY

Independent verification of 4 claimed P0 vulnerabilities identifies:
- **1 CONFIRMED P0** (Unprotected ops endpoints)
- **1 PARTIALLY VALID** (Diagnostic key timing/rate limit weakness)
- **2 OVERSTATED** (Mischaracterized as P0, actual impact lower)

**Corrected Launch Status**: 
- Internal Alpha: Blocked by 1 confirmed P0
- Free Beta: Blocked by 1 confirmed P0
- Paid MVP: Blocked by 1 confirmed P0
- Enterprise: Blocked by 1 confirmed P0

---

## FINDING 1: TIMING ATTACK ON OPSIQ_DIAGNOSTIC_KEY

### Original Claim
P0 | Timing-attack vulnerability enables character-by-character brute-force

### Evidence Verification

**File**: `/home/user/OPsIq/src/app/api/internal/debug-engagements-p2007/route.ts:41`
**Code**:
```typescript
if (!DIAGNOSTIC_KEY || !providedKey || providedKey !== DIAGNOSTIC_KEY) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
}
```

**Analysis**:
- Uses `!==` string comparison (non-timing-safe)
- JavaScript `!==` operator short-circuits on first mismatch
- Both correct and incorrect keys return identical 404 response
- No rate limiting on endpoint (verified: zero calls to `requireRateLimit`)
- Evidence: `/home/user/OPsIq/src/middleware/rate-limit-middleware.ts` - middleware exists but is NOT called

### Practical Exploitability Assessment

**Timing Attack Feasibility**: LOW
- Network jitter (typical 5-50ms) >> JavaScript comparison time (nanoseconds)
- Server load variance dominates timing differences
- JavaScript engine optimization is unpredictable
- Requires attacker to measure sub-microsecond differences over unreliable network

**Brute-Force Attack Feasibility**: MEDIUM (if key is weak)
- No rate limiting on the endpoint
- Attacker can submit unlimited key guesses
- But correct key still requires correct string match
- If key is cryptographically strong (32+ chars, random), keyspace is 256^32 (astronomical)

### Severity Assessment

**As Stated (Timing Attack)**: Overstated
- Practical timing-attack exploitation requires lab conditions
- Production network variance makes this ineffective
- Severity: P2 (best practice fix, not critical vulnerability)

**Root Issue (Weak Key Management)**: P1
- Single shared secret across multiple routes
- No key rotation mechanism
- No rate limiting on key validation attempts
- If key is compromised, unrestricted database access
- Severity: P1 (HIGH - requires fix but not immediate launch blocker)

### Proof of Issue

Routes Affected (12 total):
```
/api/internal/debug-engagements-p2007
/api/internal/debug-engagements-prisma
/api/internal/demo-engagement-proof
/api/internal/demo-permission-proof
/api/internal/engagement-dashboard-route-proof
/api/internal/engagement-drift-route-proof
/api/internal/engagements-api-runtime-trace
/api/internal/engagements-route-proof
/api/internal/login-diagnostic
/api/internal/owner-dashboard-runtime-proof
/api/internal/signup-owner-permission-proof
/api/internal/signup-proof
```

All use plain `providedKey !== DIAGNOSTIC_KEY` comparison.

### Production Reachability
- All routes deployed to production
- All accessible without session auth (key-only)
- Key passed via header or query param (bearer-like authentication)

### Verdict

**Proven**: YES (timing-unsafe comparison confirmed)  
**Exploitable**: PARTIAL (timing-attack impractical, brute-force possible if key weak)  
**Launch-Blocking**: NO (if key is strong; YES if key can be guessed)  
**Severity**: P1 (not P0)  
**Fix Required**: YES (timing-safe comparison is best practice)  
**Complexity**: LOW (1-line change per route)

---

## FINDING 2: DIAGNOSTIC ROUTE AUTHENTICATION BYPASS

### Original Claim
P0 | Insufficient auth on diagnostic routes; diagnostic key only without session validation

### Evidence Verification

**Files**: All 12 diagnostic routes above  
**Pattern**:
```typescript
export async function GET(request: NextRequest) {
  if (!verifyDiagnosticKey(request)) {
    return new NextResponse(null, { status: 404 });
  }
  // Handler logic...
}
```

**Analysis**:
- Routes use diagnostic key validation, NOT `withCanonicalEnforcement` or `withAuth`
- Routes do NOT validate user session (no `requireSession()` call)
- Routes do NOT check workspace membership
- Routes have hardcoded workspace context in some cases
- NO session required to call these endpoints

### Privilege Check

**What Can Diagnostic Key Holder Do**?
1. READ: Full database queries (engagements, clients, memberships)
2. WRITE: Create/update engagements, permissions, demo data
3. SCOPE: Hardcoded to "demo" workspace in some routes, full read in others
4. NO ESCALATION: Cannot become admin of different workspace
5. NO USER IMPERSONATION: Cannot create sessions for other users

**Example - demo-engagement-proof**:
```typescript
// Line 82: Can find any user
const user = await db.user.findUnique({ where: { email: DEMO_USER_EMAIL } });

// Line 107-113: Can find any workspace membership
const membership = await db.workspaceMembership.findFirst({
  where: { userId: user.id, isActive: true }
});

// Line 477-497: POST can create new engagement
demoEngagement = await tx.engagement.create({
  data: {
    id: randomUUID(),
    code: DEMO_ENGAGEMENT_CODE,
    workspaceId: membership.workspaceId,  // Can write to user's workspace
    // ...
  }
});
```

### Severity Assessment

**Original Claim**: "Insufficient auth on diagnostic routes"  
**Actual Finding**: Diagnostic key is the auth mechanism, not a bypass

Routes ARE protected by OPSIQ_DIAGNOSTIC_KEY. The mechanism is:
- Single shared secret (not ideal, but IS authentication)
- Key required for access (verified before handler)
- No default behavior if key missing (returns 404)

**HOWEVER**: The weakness is:
- Key is single point of failure
- No rate limiting enables brute-force
- No key rotation mechanism
- Diagnostic routes should have session auth too

**Verdict**: Not "authentication bypass" but "weak authentication mechanism"

### Production Reachability
- All 12 diagnostic routes deployed
- All accessible to anyone with DIAGNOSTIC_KEY
- Not publicly discoverable (requires knowledge of internal routes)

### Verdict

**Proven**: PARTIALLY (weak auth, not bypass)  
**Exploitable**: YES (if key is compromised or guessable)  
**Launch-Blocking**: MAYBE (depends on key strength and deployment security)  
**Severity**: P1 (not P0 - requires session auth + key, not just key)  
**Fix Required**: YES (add withCanonicalEnforcement wrapper)  
**Complexity**: MEDIUM (requires session context, hardcoded workspace removal)

---

## FINDING 3: INFORMATION DISCLOSURE (login-diagnostic)

### Original Claim
P0 | /api/internal/login-diagnostic exposes auth infrastructure state

### Evidence Verification

**File**: `/home/user/OPsIq/src/app/api/internal/login-diagnostic/route.ts:9-180`

**What is Exposed**:
```typescript
// Line 22-23: Presence of environment variables (not values)
const databaseUrlPresent = !!process.env.DATABASE_URL;
const authSecretPresent = !!process.env.AUTH_SECRET || !!process.env.NEXTAUTH_SECRET;

// Line 34-52: DATABASE_URL structure validation (not the URL itself)
databaseUrlProtocolOk = parsed.protocol === "postgresql:";
databaseUrlHostPresent = !!parsed.hostname;
databaseUrlDatabasePresent = !!(parsed.pathname && parsed.pathname.length > 1);

// Returns: { databaseUrlPresent: boolean, authSecretPresent: boolean, ... }
```

**What is NOT Exposed**:
- Actual DATABASE_URL value
- Actual AUTH_SECRET value
- Actual credentials
- Actual hostnames or IPs
- User passwords or hashes

### Information Gained by Attacker
```
Endpoint is accessible (with correct DIAGNOSTIC_KEY)
DATABASE_URL environment variable is set
AUTH_SECRET environment variable is set
Database URL uses PostgreSQL protocol
Database host is present
Database name is present
Demo user (operator@demo.local) exists OR doesn't
Demo password matches or doesn't
```

### Practical Impact
- Reconnaissance: Attacker learns "PostgreSQL is deployed"
- Enumeration: Attacker learns user enumeration method works
- Configuration Detection: Attacker learns "auth secrets are configured"
- NO DIRECT BREACH: No secrets exposed, no credentials leaked

### Severity Assessment

**Original Claim**: P0 | "Information Disclosure"  
**Actual Finding**: P2 | Low-impact reconnaissance

Attack chain requires:
1. Know or guess DIAGNOSTIC_KEY
2. Call /api/internal/login-diagnostic
3. Learn "database and auth are configured"
4. Still need to exploit database separately
5. Database still requires authentication

This is reconnaissance, not exploitation. The actual attack requires the diagnostic key (which is the separate vulnerability).

### Verdict

**Proven**: YES (endpoint returns environment boolean flags)  
**Exploitable**: NO (no secrets disclosed)  
**Launch-Blocking**: NO (low information value)  
**Severity**: P2 (best practice to restrict, not critical)  
**Fix Required**: OPTIONAL (could remove or restrict access)  
**Complexity**: LOW (wrap with authentication check)

---

## FINDING 4: OPERATIONAL METRICS EXPOSURE (/api/ops/*)

### Original Claim
P0 | /api/ops/* endpoints expose internal metrics without authentication

### Evidence Verification

**Files**: 
- `/home/user/OPsIq/src/app/api/ops/errors/route.ts:14`
- `/home/user/OPsIq/src/app/api/ops/metrics/route.ts:11`
- `/home/user/OPsIq/src/app/api/ops/readiness/route.ts:10`
- `/home/user/OPsIq/src/app/api/ops/runtime/route.ts:16`

**Verification - No Auth Wrapper**:
```bash
$ grep -i "withEnforcement\|withAuth\|withCanonical\|requireAuth" /home/user/OPsIq/src/app/api/ops/*/route.ts
# Result: No matches
```

**Verification - Exported as Raw Handler**:
```typescript
// ops/errors/route.ts
export async function GET(request: NextRequest) {
  // Direct access, no wrapper
  const errorTraces = getTracesWithError(...);
  return NextResponse.json({ errors: errorTraces, ... });
}
```

### What is Exposed

**GET /api/ops/errors** - Returns:
```json
{
  "errors": {
    "count": 150,
    "by_classification": { "timeout": 42, "db_error": 68, ... },
    "recent": [
      {
        "correlation_id": "corr-xyz",
        "request_id": "req-abc",
        "route": "/api/engagements/[id]/dashboard",
        "method": "GET",
        "duration_ms": 5432,
        "classification": "timeout",
        "spans_with_errors": [
          {
            "operation": "db.engagement.findUnique",
            "error": "Query timeout",
            "duration_ms": 5000
          }
        ]
      }
    ]
  }
}
```

**Information Value**:
- ✓ Internal route names (/api/engagements/[id]/dashboard)
- ✓ Database operation names (db.engagement.findUnique)
- ✓ Error frequencies (42 timeouts out of 150 total)
- ✓ Correlation IDs (request tracing IDs)
- ✓ Performance metrics (slow requests in ms)
- ✗ NO customer data
- ✗ NO user data
- ✗ NO secrets

### Practical Impact

**Reconnaissance Value**: MEDIUM
- Attacker learns internal API structure
- Attacker learns which operations timeout
- Attacker learns error patterns
- Attacker can correlate with external requests

**Exploitation Value**: LOW
- Information is operational, not sensitive
- No credentials or secrets exposed
- Cannot authenticate or access data with this info
- Useful for DoS planning but not immediate breach

### Severity Assessment

**Original Claim**: P0 | "Unprotected operational metrics"  
**Actual Finding**: P1 | Information disclosure (low exploitability)

These endpoints should be protected but are not critical:
- They expose operational metrics, not data
- Information is useful for reconnaissance, not exploitation
- Attacker still needs valid credentials to access actual data
- Impact: DoS planning, internal API discovery

### Production Reachability
- All 4 routes deployed to production
- Publicly accessible (no authentication required)
- No rate limiting
- No IP whitelist

### Verdict

**Proven**: YES (confirmed no auth wrapper)  
**Exploitable**: PARTIALLY (reconnaissance only, no data breach)  
**Launch-Blocking**: YES (information disclosure is unacceptable at scale)  
**Severity**: P1 (not P0 - concerning but not immediate data breach risk)  
**Fix Required**: YES (add authentication requirement)  
**Complexity**: LOW (wrap with withCanonicalEnforcement)

---

## REMEDIATION INVENTORY

### Item 1: Add Rate Limiting to Diagnostic Routes

**Routes**: 12 internal diagnostic routes  
**Issue**: No rate limiting on key validation  
**Fix Type**: Wrapper enhancement  
**Complexity**: MEDIUM

```typescript
// Before:
const providedKey = req.headers.get("x-opsiq-diagnostic-key") || 
                   new URL(req.url).searchParams.get("key");

// After:
const clientIP = getClientIP(req);
requireRateLimit(`diagnostic-key:${clientIP}`, {
  maxPerMinute: 5,      // 5 attempts per minute per IP
  windowSeconds: 60
});

const providedKey = ...
```

**Migration Required**: Deploy rate limit service config  
**Deployment Risk**: LOW (additive, doesn't break valid requests)

### Item 2: Use Timing-Safe Key Comparison

**Routes**: 12 internal diagnostic routes  
**Issue**: Plain string comparison vulnerable to timing attacks  
**Fix Type**: Single-line change per route  
**Complexity**: LOW

```typescript
// Before:
if (!DIAGNOSTIC_KEY || !providedKey || providedKey !== DIAGNOSTIC_KEY) {

// After:
import { timingSafeEqual } from "crypto";

if (!DIAGNOSTIC_KEY || !providedKey) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
}
try {
  timingSafeEqual(
    Buffer.from(providedKey),
    Buffer.from(DIAGNOSTIC_KEY)
  );
} catch {
  return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
}
```

**Migration Required**: None  
**Deployment Risk**: NONE (drop-in replacement)

### Item 3: Add Session Auth to Diagnostic Routes

**Routes**: 12 internal diagnostic routes  
**Issue**: Diagnostic key is sole auth mechanism  
**Fix Type**: Wrapper enhancement  
**Complexity**: MEDIUM

```typescript
// Before:
if (!verifyDiagnosticKey(request)) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
}

// After:
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // ctx.verifiedActorId is guaranteed to exist
    // ctx.verifiedWorkspaceId is guaranteed to exist
    
    if (!verifyDiagnosticKey(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 404 });
    }
    // Handler logic
  }
);
```

**Impact**: Now requires BOTH session auth AND diagnostic key  
**Migration Required**: None (key still works same way)  
**Deployment Risk**: LOW (requires valid session from browser/client)

### Item 4: Protect /api/ops/* Endpoints

**Routes**: 4 operational metrics endpoints  
**Issue**: No authentication required  
**Fix Type**: Wrapper addition  
**Complexity**: LOW

```typescript
// Before:
export async function GET(request: NextRequest) {
  const metrics = getMetrics();
  return NextResponse.json(metrics);
}

// After:
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // Only authenticated internal users can access
    if (!hasInternalAccess(ctx.policy)) {
      throw new ForbiddenError("Internal access required");
    }
    const metrics = getMetrics();
    return NextResponse.json(metrics);
  },
  { requireWorkspace: false }  // Don't require workspace for ops metrics
);
```

**Impact**: Only internal users can see operational metrics  
**Migration Required**: None (internal use only)  
**Deployment Risk**: LOW (doesn't break existing dashboards if used internally)

---

## BLAST RADIUS ANALYSIS

### Rate Limiting Addition
**Affected**: 12 diagnostic routes  
**Test Impact**: Any tests that rapidly call diagnostic routes will fail  
**Regression Risk**: LOW (only affects brute-force attempts)  
**Workflow Impact**: None (diagnostic key not used in normal workflows)

### Timing-Safe Comparison
**Affected**: 12 diagnostic routes  
**Test Impact**: None (functional behavior unchanged)  
**Regression Risk**: NONE (drop-in replacement)  
**Workflow Impact**: None

### Session Auth Addition
**Affected**: 12 diagnostic routes  
**Test Impact**: Tests must provide valid session + diagnostic key  
**Regression Risk**: LOW (both auth methods stack, doesn't change logic)  
**Workflow Impact**: MEDIUM (smoke tests must have session context)

### /api/ops/* Protection
**Affected**: 4 operational endpoints  
**Test Impact**: Tests must provide authenticated context  
**Regression Risk**: MEDIUM (if dashboards call these endpoints)  
**Workflow Impact**: MEDIUM (monitoring scripts must be internal users)

---

## SECURITY REGRESSION MATRIX

### Test 1: Diagnostic Key Brute-Force Blocked After 5 Attempts
```
vulnerability: No rate limiting on diagnostic key
test_name: diagnostic_key_brute_force_blocked
attack_attempt: Loop 10 times, calling /api/internal/signup-proof with wrong key
expected_result: First 5 requests return 404, 6+ return 429 (Too Many Requests)
required_by: Rate limiting implementation
```

### Test 2: Timing-Safe Comparison Prevents Character-by-Character Timing Attack
```
vulnerability: Plain string comparison on diagnostic key
test_name: diagnostic_key_comparison_timing_safe
attack_attempt: Measure response time for 1-char key vs 32-char key vs correct key
expected_result: Response times identical within 5% variance
required_by: Timing-safe comparison implementation
```

### Test 3: Diagnostic Routes Require Session Auth
```
vulnerability: Diagnostic key as sole auth mechanism
test_name: diagnostic_route_requires_session_and_key
attack_attempt: Call /api/internal/signup-proof with correct key but no session
expected_result: 401 Unauthorized (no session) even with correct key
required_by: withCanonicalEnforcement wrapper
```

### Test 4: Ops Endpoints Block Unauthenticated Access
```
vulnerability: /api/ops/* endpoints unprotected
test_name: ops_endpoints_require_auth
attack_attempt: Call GET /api/ops/errors without authentication
expected_result: 401 Unauthorized
required_by: withCanonicalEnforcement wrapper on ops routes
```

### Test 5: Ops Endpoints Block External Users
```
vulnerability: /api/ops/* endpoints exposed to all authenticated users
test_name: ops_endpoints_require_internal_role
attack_attempt: Call GET /api/ops/errors as client user (not internal)
expected_result: 403 Forbidden (not internal access)
required_by: hasInternalAccess check
```

---

## POST-FIX LAUNCH ASSESSMENT

Assuming all 4 remediations are implemented and tested:

### Internal Alpha
**Status**: READY  
**Blockers**: NONE (all P0s fixed)  
**Remaining Concerns**:
- P1: Diagnostic key still single point of failure (mitigated by rate limiting)
- P1: Diagnostic routes still have database access (expected behavior)

### Free Beta
**Status**: READY  
**Blockers**: NONE (all P0s fixed)  
**Remaining Concerns**: Same as internal alpha

### Paid MVP
**Status**: READY  
**Blockers**: NONE (all P0s fixed)  
**Remaining Concerns**: 
- P1: Recommend rotating OPSIQ_DIAGNOSTIC_KEY before launch
- P1: Consider multiple diagnostic keys (one per environment)

### Enterprise
**Status**: READY WITH CONDITIONS  
**Blockers**: NONE (all P0s fixed)  
**Conditions**:
- Implement audit logging for all diagnostic endpoint access
- Implement diagnostic key rotation mechanism
- Document diagnostic endpoint security model

---

## FINDINGS NOT PROVEN AS P0

### 1. Hardcoded Workspace Bypass
**Original Claim**: P0 | Some diagnostic routes hardcode workspace="demo"  
**Actual Finding**: P2 | Acceptable for internal diagnostic endpoints  
**Reason**: Hardcoded scope prevents cross-workspace access. Not a security issue, expected behavior for demo diagnostics.

### 2. No Audit Logging on Diagnostic Access
**Original Claim**: Implied in audit | No logging of diagnostic endpoint access  
**Actual Finding**: P2 | Recommended for compliance  
**Reason**: Diagnostic endpoints are internal-only. Audit logging is best practice, not blocker.

---

## SUMMARY TABLE

| Finding | Original Severity | Actual Severity | Proven | Exploitable | Launch Blocking | Fix Complexity |
|---------|-------------------|-----------------|--------|-------------|-----------------|-----------------|
| Timing Attack on Diagnostic Key | P0 | P1 | YES | PARTIAL | NO | LOW |
| Diagnostic Route Auth Bypass | P0 | P1 | PARTIAL | YES | MAYBE | MEDIUM |
| Information Disclosure | P0 | P2 | YES | NO | NO | LOW |
| Unprotected Ops Endpoints | P0 | P1 | YES | PARTIAL | YES | LOW |
| **TOTAL P0s that Block Launch** | **4** | **1** | - | - | **YES** | - |

---

## FINAL REMEDIATION PRIORITIES

### IMMEDIATE (Block Launch)
1. **Protect /api/ops/* endpoints** (P1 → blocks launch)
   - Time: 30 minutes
   - Risk: LOW

### BEFORE PRODUCTION SCALE
2. **Add rate limiting to diagnostic routes** (P1 → DoS risk)
   - Time: 1 hour
   - Risk: LOW

3. **Use timing-safe comparison for keys** (P1 → best practice)
   - Time: 30 minutes
   - Risk: NONE

4. **Add session auth to diagnostic routes** (P1 → depth of auth)
   - Time: 2 hours
   - Risk: LOW

### NICE-TO-HAVE (Before Enterprise)
5. Implement audit logging for diagnostic endpoints
6. Implement diagnostic key rotation
7. Add status page for ops metrics (instead of raw endpoint)

---

## COMMIT SUMMARY

**Files Modified**: 0 (documentation only)  
**Code Changes**: 0 (planning phase only)  
**Ready for Implementation**: YES  
**Pre-implementation Tests**: Defined above

---

**Document Version**: 1.0  
**Status**: Ready for security team review and implementation planning
