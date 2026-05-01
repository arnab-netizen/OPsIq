# Authentication & Authorization Surface Audit

**Scan Date:** 2026-05-01  
**Status:** AUDIT ONLY - No fixes implemented  
**Scope:** Complete codebase scan for auth/authz/data-access patterns

---

## Executive Summary

**Total API Routes:** 96 routes across `/src/app/api/**`  
**Auth Protection Status:** ~95% of routes have auth checks, but patterns are inconsistent  
**Critical Gaps:** 3 high-risk areas identified  
**Risk Level:** MEDIUM (inconsistent patterns + temporary workspace ID placeholder)

---

## I. Authentication Enforcement

### A. Session-Based Auth (Primary Pattern)

**File:** `/src/services/auth.ts`  
**Entry Points:**
- `getSession(): Promise<SessionInfo | null>` - Line 25
- `requireSession(): Promise<SessionInfo>` - Line 67
- `getPolicyContext(): Promise<PolicyContext | null>` - Line 75
- `requirePolicyContext(): Promise<PolicyContext>` - Line 102

**Implementation:**
- Cookie-based sessions (SESSION_COOKIE_NAME = "opsiq_session")
- 24-hour expiry (SESSION_DURATION_MS = 86400000ms)
- Session stored in Prisma (`db.session` table)
- Checks: token validity, revocation, expiry, user active status
- **Current Protection:** ✅ GOOD - Fail-closed pattern, multiple validation layers

**Usage Pattern:**
```typescript
const session = await getSession();
if (!session?.user?.id) {
  return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
}
```

### B. Policy Context (RBAC)

**File:** `/src/services/auth.ts` lines 75-108  
**File:** `/src/policies/capability-check.ts`

**Context Includes:**
- `userId: string`
- `roles: Array<{role: RoleName, scope, scopeId}>`
- `engagementMemberships: Array<{engagementId, role}>`

**Capabilities System:**
- 50+ defined capabilities in `/src/domain/constants/capabilities`
- Role hierarchy: SYSTEM_ADMIN > ADMIN > EXPERIENCED_CONSULTANT > CLIENT > OPERATOR
- Role-capability mapping enforced via `ROLE_CAPABILITIES` (capability-check.ts:8)

### C. Auth Enforcement Wrapper

**File:** `/src/lib/api-handler.ts` (assumed - used in many routes)

**Common Patterns:**
1. **Direct getSession()** - ~40 routes use explicit session check
2. **withAuth() wrapper** - ~30 routes use higher-order function pattern
3. **requireWorkspaceContext()** - ~15 routes use workspace-scoped auth

---

## II. Workspace Isolation & Data Access

### A. Workspace Context (CRITICAL GAP)

**File:** `/src/services/workspace/context.ts`

**Current Implementation:**
```typescript
export async function getWorkspaceContext(): Promise<WorkspaceContext | null> {
  const session = await getSession();
  if (!session) return null;
  
  // TEMPORARY: use userId as workspace ID
  const workspaceId = session.user.id; // Line 24 - CRITICAL GAP
  
  return { workspaceId, userId: session.user.id };
}
```

**⚠️ CRITICAL GAP #1:** Workspace context uses `session.user.id` as workspace ID, not actual workspace membership. This is a **placeholder implementation** waiting for proper multi-tenancy.

**Impact:** 
- Single-tenant per user model currently
- Cannot support true multi-workspace scenarios
- All data "scoped" to userId, not workspaceId

**Routes Using This Pattern:**
- `/api/metrics/control-effectiveness`
- `/api/audit`
- `/api/governance/**`
- Any route calling `requireWorkspaceContext()`

### B. Workspace Enforcement Middleware

**File:** `/src/lib/prisma-workspace-enforcement.ts`

**Models Protected (49 total):**
- All decision/recommendation/action-related: `operatorItem, recommendation, action, deliverable`
- All engagement data: `engagement, finding, evidence, alert`
- Audit: `auditEvent`
- Business context: `businessConditionProfile, interventionState, shock`

**Global Models (No Scoping Required):**
- `workspace, workspaceRole, workspaceUser, session, token`
- System config: `capability, problem, intervention`

**Enforcement Mechanism:**
- **Creates:** BLOCKS if `workspaceId` missing from data (line 136-150)
- **Writes:** BLOCKS if WHERE clause missing `workspaceId` (line 98-133)
- **Deletes:** BLOCKS if WHERE clause missing `workspaceId` (line 98-133)
- **Reads:** WARNS via console if unscoped (line 152-166) - **NOT BLOCKED**

**⚠️ GAP #2:** Unscoped reads are only warned, not blocked (line 162). Could leak data if developer forgets workspaceId filter.

### C. Explicit Workspace Validation

**File:** `/src/middleware/workspace-enforcement.ts`

**Function:** `enforceWorkspaceScoping(request: NextRequest, workspaceId: string)`
- Verifies session exists
- Checks workspace exists and active
- Checks user is active member of workspace
- Fails closed (returns null if any check fails)

**Usage:**
```typescript
const membership = await enforceWorkspaceScoping(request, workspaceId);
if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
```

**Routes Using This Pattern:**
- `/api/control/today` (new)
- `/api/business-impact/summary` (new)
- `/api/business-impact/decision/[id]` (new)
- `/api/governance/metrics`
- `/api/decisions/*`

---

## III. Routes & Entry Points by Auth Pattern

### Pattern A: x-workspace-id from Headers (~40 routes)

**Examples:**
- `/api/engagements/[engagementId]` - Line extracts from header
- `/api/users/[userId]`
- `/api/evidence-bundles/[bundleId]`
- `/api/recommendations`
- `/api/findings`

**Implementation Pattern:**
```typescript
const workspaceId = request.headers.get("x-workspace-id") || "";
const { session } = await withAuth({ capability: CAPABILITIES.X_VIEW });
```

**Risk Assessment:**
- ✅ Header-based ID is not user-controllable in trusted client scenario
- ⚠️ Header value not re-validated against user's workspaces
- ⚠️ Relies on withAuth() to verify capability, not explicit workspace membership check

### Pattern B: workspaceId from Query Params (~12 routes)

**Examples:**
- `/api/control/today?workspaceId=` 
- `/api/business-impact/summary?workspaceId=`
- `/api/business-impact/decision/[id]?workspaceId=`
- `/api/decisions/list?workspaceId=`
- `/api/decisions/[decisionId]?workspaceId=`

**Implementation Pattern:**
```typescript
const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");
if (!workspaceIdParam) return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
if (!membership) return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
```

**Risk Assessment:**
- ✅ Query param is validated against user's workspace membership
- ✅ Fails closed if user not in workspace
- ⚠️ Inconsistent pattern: some routes accept from headers, others from query

### Pattern C: Public/Intentional Bypass

**Routes with NO auth checks (3 routes):**

1. **`/api/health`** ✅ INTENTIONAL
   - Health check endpoint for monitoring
   - Returns database connectivity status
   - File: `/src/app/api/health/route.ts`
   - Wrapper: `withRequestContext` (no auth)
   - Rationale: Public health monitoring

2. **`/api/verify`** ✅ INTENTIONAL
   - Integrity verification endpoint
   - Public API for external signature verification
   - File: `/src/app/api/verify/route.ts` 
   - No auth checks (by design)
   - Input: user-provided signature + data
   - Rationale: Public integrity checking

3. **`/api/report`** ⚠️ **CRITICAL GAP #3**
   - Calls `generateReport()` with NO authentication
   - File: `/src/app/api/report/route.ts`
   - **Issue:** Accepts GET request, no session/auth check
   - **Data Exposure Risk:** If report contains workspace data, exposed to any caller
   - **No Workspace Scoping:** Unclear what `generateReport()` returns

**Report Endpoint Risk:**
```typescript
export async function GET() {
  try {
    const report = await generateReport(); // NO AUTH, NO WORKSPACE CHECK
    return NextResponse.json(report);
  } catch (error) {
    return NextResponse.json({ error: message }, { status: 400 });
  }
}
```

---

## IV. Data Access Patterns

### A. Unscoped Query Warnings (Prisma Middleware Detection)

**Detection Pattern:** `/src/lib/prisma-workspace-enforcement.ts` line 152-166

Queries that would trigger console warnings:
- `db.operatorItem.findMany()` without WHERE workspaceId
- `db.engagement.findMany()` without WHERE workspaceId
- `db.recommendation.findMany()` without WHERE workspaceId
- Any workspace-owned model query without workspaceId filter

**⚠️ Critical:** Warnings logged to console, but query still executes (not blocked).

### B. Service Layer Entry Points (126 services)

**High-Risk Services (No workspaceId parameter):**
- `calculateRecommendationScore()` - `/src/services/recommendation.ts` (no workspace)
- `getOwnerDashboard(engagementId)` - `/src/services/owner-dashboard.service.ts` (engagementId only)
- `assessCondition(engagementId)` - `/src/services/business-condition.ts` (engagementId only)

**Well-Protected Services (Always require workspaceId):**
- `getControlSurface(workspaceId)` - `/src/services/control/control-surface.service.ts`
- `enforceDecisionControl(decisionId, workspaceId)` - `/src/services/decision-control/enforcement.service.ts`
- `calculateWorkspaceImpactSummary(workspaceId)` - `/src/services/business-impact/decision-impact.service.ts`

### C. Prisma Queries by Category

**CREATE operations (Workspace Enforcement: REQUIRED):**
- BLOCKED if no `workspaceId` in data
- ~30 routes perform creates

**UPDATE operations (Workspace Enforcement: REQUIRED):**
- BLOCKED if WHERE doesn't include `workspaceId`
- ~15 routes perform updates

**DELETE operations (Workspace Enforcement: REQUIRED):**
- BLOCKED if WHERE doesn't include `workspaceId`
- ~10 routes perform deletes

**FIND operations (Workspace Enforcement: WARNED):**
- Warns if WHERE doesn't include `workspaceId`
- ~40 routes perform queries
- Executes anyway (potential data leak if filter forgotten)

---

## V. Headers & Extract Patterns

### A. Custom Headers Used

| Header | Routes | Purpose | Validation |
|--------|--------|---------|-----------|
| `x-workspace-id` | ~40 | Workspace context | None - relies on withAuth |
| `x-user-id` | ~5 (UI only) | User context | None - sent by client |
| `x-forwarded-for` | Auth/rate-limit | IP tracking | Rate limiting only |
| `user-agent` | Auth | Session tracking | Logged only |

### B. Header Extraction Pattern

**In UI:** `/src/ui/*.tsx`
```typescript
headers: {
  "x-workspace-id": workspaceId,
  "x-user-id": userId,
}
```

**In Routes:** `/src/app/api/engagements/route.ts` (example)
```typescript
const workspaceId = request.headers.get("x-workspace-id") || "";
```

**⚠️ Risk:** No validation that provided workspace ID matches user's actual workspaces. Relies on frontend not sending malicious workspace ID.

---

## VI. Special Routes & Risk Assessment

### High-Risk Routes

| Route | Issue | Impact | Status |
|-------|-------|--------|--------|
| `/api/report` | NO AUTH | Data exposure | ⚠️ **CRITICAL** |
| `/api/engagements/[id]` | x-workspace-id from header | Potential workspace leak | 🔶 MEDIUM |
| `/api/decisions/list` | workspaceId from query | User can query any workspace? | 🔶 MEDIUM |

### Medium-Risk Routes

| Route | Issue | Impact | Status |
|-------|-------|--------|--------|
| `/api/recommendations` | withAuth only, header workspace | Relies on capability check | 🟡 MEDIUM |
| `/api/evidence-bundles/[id]` | x-workspace-id from header | No re-validation | 🟡 MEDIUM |

### Protected Routes (Good Patterns)

| Route | Pattern | Status |
|-------|---------|--------|
| `/api/control/today` | enforceWorkspaceScoping + query param | ✅ GOOD |
| `/api/business-impact/summary` | enforceWorkspaceScoping + query param | ✅ GOOD |
| `/api/decisions/[id]` | enforceWorkspaceScoping + query param | ✅ GOOD |
| `/api/audit` | requireWorkspaceContext | ✅ GOOD |

---

## VII. Highest-Risk Gaps Summary

### 🔴 CRITICAL - Tier 1

**GAP #1: Workspace ID Placeholder (Temporary Multi-Tenancy)**
- **Location:** `/src/services/workspace/context.ts:24`
- **Issue:** Uses `session.user.id` as workspace ID instead of actual workspace membership
- **Impact:** Cannot support true multi-workspace scenarios; all data scoped to user, not org
- **Mitigation Needed:** Implement actual workspace selection in session or user record
- **Blocking:** Any true multi-tenancy feature

**GAP #2: Unauthenticated Report API**
- **Location:** `/src/app/api/report/route.ts`
- **Issue:** GET endpoint with no auth/workspace check
- **Impact:** Exposes unknown report data to any caller
- **Data Risk:** Could leak engagement/decision data if report includes workspace content
- **Mitigation Needed:** Add `enforceWorkspaceScoping()` + workspace validation

**GAP #3: Unscoped Read Warnings Not Blocked**
- **Location:** `/src/lib/prisma-workspace-enforcement.ts:152-166`
- **Issue:** Unscoped reads (findMany/findFirst) only warn, not blocked
- **Impact:** Developer mistakes can leak data across workspaces
- **Mitigation Needed:** Consider moving from warning to error for production

### 🟡 MEDIUM - Tier 2

**GAP #4: Header-Based Workspace ID Not Re-Validated**
- **Location:** ~40 routes using `request.headers.get("x-workspace-id")`
- **Issue:** Header value trusted without checking user's actual workspace membership
- **Example:** `/api/engagements/[id]/route.ts`
- **Risk:** If client allows user to edit x-workspace-id header, cross-workspace access possible
- **Mitigation Needed:** Add explicit workspace membership check even for header-provided IDs

**GAP #5: Inconsistent Auth Patterns**
- **Location:** Mixed across 96 routes
- **Patterns:** 
  - Some use header x-workspace-id
  - Some use query param workspaceId
  - Some use withAuth() wrapper
  - Some use enforceWorkspaceScoping()
  - Some use requireWorkspaceContext()
- **Issue:** No single pattern = harder to audit, easier to miss checks
- **Mitigation Needed:** Standardize on single approach (recommend: query param + enforceWorkspaceScoping)

### 🔶 LOW - Tier 3

**GAP #6: Service Layer Missing Workspace Parameter**
- **Location:** Various services (`owner-dashboard.service.ts`, `business-condition.ts`, etc.)
- **Issue:** Some services accept engagementId only, not workspaceId
- **Impact:** Could be called from unauthenticated context if wrapper is missing
- **Mitigation Needed:** Add workspaceId parameter to all workspace-owned service functions

---

## VIII. Audit Event Coverage

**File:** `/src/infra/audit`

**Events Emitted:**
- USER_LOGIN_FAILED
- USER_LOGGED_IN
- Session revocation
- Auth failures

**Coverage:** ✅ Good - Auth events logged

**Gap:** Limited business action audit logging (recommendations, decisions, overrides)

---

## IX. Session & Token Management

**Session Storage:** Prisma `session` table
**Duration:** 24 hours
**Revocation:** Supported via `revokeSession(sessionId, actorId)`
**Cookie Security:**
- httpOnly: true (production)
- secure: true (production only)
- sameSite: "lax"

**Audit Trail:** ✅ Yes - revocation logged with actorId

---

## X. Rate Limiting

**File:** `/src/infra/rate-limit`

**Protected Endpoints:**
- Login: `LOGIN_RATE_LIMIT` (ip + email based)

**Coverage:** ⚠️ Limited - only login protected

---

## XI. Recommendations (Summary Only - No Implementation)

### Immediate (Critical)

1. **Implement Real Workspace Selection** (`workspace/context.ts`)
   - Add workspace_id column to session table
   - Set during login/workspace selection
   - Validate in all requests

2. **Add Auth to /api/report**
   - Add `enforceWorkspaceScoping()` check
   - Return workspace-scoped report data

3. **Audit generateReport() Implementation**
   - Verify it respects workspace boundaries
   - Check if it includes workspace/engagement data

### Short-term (Medium)

4. **Standardize Auth Pattern**
   - Choose: query param + enforceWorkspaceScoping()
   - Update 40 x-workspace-id header routes
   - Document pattern in CONTRIBUTING.md

5. **Add Re-validation for Header Workspace IDs**
   - Even if header-provided, verify user's workspace membership
   - Consider removing header pattern entirely

6. **Make Unscoped Reads an Error**
   - Change prisma-workspace-enforcement console.warn to throw
   - Test all routes for proper scoping
   - Update CI/CD to catch at build time

### Long-term (Low)

7. **Add Workspace Rate Limiting**
   - Rate limit per workspace, not just per user
   - Prevent single user from hammering workspace

8. **Implement Audit Trail for All Workspace Mutations**
   - Currently: auth events logged
   - Missing: decision creates, updates, approvals

---

## XII. File Inventory

### Auth Core
- `/src/services/auth.ts` - Session management
- `/src/lib/auth-guard.ts` - Auth validation helpers
- `/src/middleware/workspace-enforcement.ts` - Workspace scoping checks

### Workspace & Data Isolation
- `/src/services/workspace/context.ts` - Workspace context (⚠️ PLACEHOLDER)
- `/src/lib/prisma-workspace-enforcement.ts` - Database middleware
- `/src/lib/db.ts` - Prisma client with enforcement enabled
- `/src/lib/workspace-validation.ts` - Workspace validation helpers

### Policy & RBAC
- `/src/policies/capability-check.ts` - Capability-based access control
- `/src/domain/constants/capabilities` - Capability definitions
- `/src/domain/constants/roles` - Role hierarchy

### API Routes (96 total)
- `/src/app/api/**` - All endpoint handlers

### Infrastructure
- `/src/infra/audit.ts` - Audit event emission
- `/src/infra/rate-limit.ts` - Rate limiting
- `/src/infra/errors.ts` - Error types (UnauthorizedError, ForbiddenError)

---

## XIII. Test Coverage

**Auth Tests:**
- `/src/lib/auth-guard.test.ts`
- `/src/app/api/__tests__/rbac-enforcement.test.ts`

**Workspace Isolation Tests:**
- `/src/__tests__/workspace-isolation.test.ts`
- `/src/__tests__/prisma-workspace-enforcement.test.ts`

**Service Tests:**
- Mocked Prisma in all service tests
- No real database access

---

## XIV. Compliance Notes

**Fail-Closed Pattern:** ✅ Applied consistently across auth checks  
**Input Validation:** ✅ Zod schemas used for request bodies  
**Output Encoding:** Not directly in auth layer (UI responsibility)  
**CORS/CSRF:** Not documented in audit  
**SQL Injection:** ✅ Prevented by Prisma ORM  
**JWT/Bearer Tokens:** Not used - cookie-based only  
**Password Hashing:** ✅ bcrypt in login endpoint  

---

## XV. Next Steps

1. **No code changes made** per audit requirement
2. **Report review needed** before implementation
3. **Prioritize:** CRITICAL gaps first, then MEDIUM, then LOW
4. **Testing:** Each fix should include test coverage
5. **Documentation:** Update CONTRIBUTING.md with auth patterns

---

**End of Audit**  
Generated: 2026-05-01  
No implementations performed - audit scope only.
