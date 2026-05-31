# SIGNUP AND DASHBOARD PROOF AUDIT
**Date:** 2026-05-31  
**Branch:** main only  
**Method:** Code evidence only. No fixes. No assumptions.

---

## TASK 1: PROVE WHETHER SIGNUP IS ACTUALLY MISSING

### Search Results

#### File Search for Signup-Related Pages/Routes

**Search Command:**
```bash
find src -type f \( -name "*signup*" -o -name "*register*" -o -name "*create*account*" -o -name "*create*user*" \)
```

**Result:** ❌ NO FILES FOUND

**Search Command:**
```bash
grep -r "signup\|register\|sign up\|sign-up" src/app --include="*.tsx" --include="*.ts" -l
```

**Result:** 
- src/app/api/startup/route.ts (unrelated - startup events)
- src/app/api/webhooks/subscribe/route.ts (unrelated - webhook subscription)

**Search Command:**
```bash
find src/app -type f -name "*.tsx" -exec grep -l "Sign Up\|sign up\|Create Account\|create account" {} \;
```

**Result:** ❌ NO FILES FOUND

---

### Authentication Routes Present

| Route | File | Purpose | Authentication Required |
|---|---|---|---|
| **POST /api/auth/login** | `src/app/api/auth/login/route.ts` | Login with email + password | NO (public) |
| **POST /api/auth/logout** | `src/app/api/auth/logout/route.ts` | Logout user | YES (authenticated) |
| **POST /api/users** | `src/app/api/users/route.ts` | Create user | YES (authenticated + USER_CREATE capability) |

**Key Finding:** `/api/users` POST endpoint EXISTS but is PROTECTED by authentication.

---

### Login Page Analysis

**File:** `src/app/login/page.tsx`

**Code Evidence:**
```typescript
// Line 39
<p className="mt-1 text-sm text-muted-foreground">
  Sign in to continue
</p>

// Line 43-72
<form onSubmit={handleSubmit} className="space-y-4">
  <Input
    label="Email"
    type="email"
    ...
  />
  <Input
    label="Password"
    type="password"
    ...
  />
  <Button type="submit" isLoading={loginMutation.isLoading} className="w-full">
    Sign in
  </Button>
</form>
```

**Finding:** Login page shows "Sign in to continue" - no signup link, no "Don't have an account?" message, no link to create account.

---

### User Creation Endpoint Analysis

**File:** `src/app/api/users/route.ts`

**Code Evidence:**
```typescript
// Line 39-60
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;

    // Require Idempotency-Key (fail-closed)
    const idempotencyKey = ctx.request?.headers.get("Idempotency-Key");
    if (!idempotencyKey) {
      throw new UnauthorizedError("Idempotency-Key header required");
    }

    const body = await parseRequestBody(ctx.request!, createUserSchema);

    const { isNew, result } = await withIdempotency(
      idempotencyKey,
      "user.create",
      async () => createUser(body, ctx, workspaceId),
      body,
      ctx.verifiedActorId
    );

    return result;
  },
  { requireCapabilities: ["USER_CREATE"], requireWorkspace: true }
);
```

**Key Constraints:**
1. ✅ User creation route EXISTS
2. ❌ REQUIRES `withCanonicalEnforcement` wrapper = MUST BE AUTHENTICATED
3. ❌ REQUIRES `USER_CREATE` capability = MUST HAVE PERMISSION
4. ❌ REQUIRES `workspace` context = MUST ALREADY BE IN WORKSPACE

**Conclusion:** User creation is PROTECTED. Cannot be called by unauthenticated visitor.

---

### Onboarding Flow Analysis

**File:** `src/app/onboarding/page.tsx` (requires authentication)

**Code Evidence:**
```typescript
// Line 1
"use client";

// Line 8-9
const [step, setStep] = useState<"workspace" | "team" | "complete">("workspace");

// Line 22-54
const handleCreateWorkspace = async () => {
  ...
  const res = await fetch("/api/onboarding/workspace", {
    method: "POST",
    ...
  });
  ...
  setStep("team");
};
```

**Finding:** Onboarding page handles WORKSPACE CREATION, not ACCOUNT CREATION. It's located at `/onboarding` which is BEHIND authentication (requires prior login).

---

### Current Customer Signup Flow

**What exists:**
1. Login page at `/login` (public, email + password)
2. User creation endpoint at `POST /api/users` (protected - requires auth + capability)
3. Workspace creation flow at `/onboarding` (protected - requires auth)

**What's missing:**
1. ❌ Public signup page (no `/signup` route)
2. ❌ Public account creation endpoint (POST /api/auth/signup)
3. ❌ Link from login → signup
4. ❌ Account creation form
5. ❌ Email verification flow
6. ❌ Password confirmation
7. ❌ Terms of service acceptance

---

### How New Customer Can Sign Up Today

**Current Broken Flow:**
```
1. Visitor lands on OpsIQ
2. Clicks "Sign Up" (button doesn't exist)
3. No signup page found → 404 Not Found OR redirected to login
4. Visitor sees login page (email + password)
5. No account exists → login fails
6. No path to create account
7. Visitor leaves
```

---

## CONCLUSION: SIGNUP STATUS

### **SIGNUP_MISSING** ✅ CONFIRMED

**Evidence:**
- No signup page in codebase
- No signup route
- No signup component
- Only login page (no account creation)
- User creation endpoint requires prior authentication
- No public API to create account
- No signup flow for unauthenticated users

**Severity:** CRITICAL — New customers cannot onboard

---

---

## TASK 2: TRACE DASHBOARD DATA SOURCE

### Dashboard API Endpoint

**Route:** `GET /api/owner/dashboard`  
**File:** `src/app/api/owner/dashboard/route.ts`

---

### Widget 1: Engagements/Health Status

**Component:** `OwnerDashboard` in `src/ui/owner-dashboard.tsx`  
**API:** `GET /api/owner/dashboard`  
**Service:** `calculateWorkspaceHealth()` in `src/services/owner-mode/dashboard.service.ts`

**Data Source - Line 64-71:**
```typescript
const mockEngagementSnapshots = [
  {
    engagementId: "550e8400-e29b-41d4-a716-446655440000",  // ← HARDCODED UUID
    status: "healthy" as const,
    kpiOnTrackCount: 8,
    kpiTotalCount: 10,
  },
];
```

**How It's Used - Line 96:**
```typescript
const health = await calculateWorkspaceHealth(context, mockEngagementSnapshots);
```

**Data Source Type:** **HARDCODED MOCK OBJECT**

---

### Widget 2: Action Queue

**Component:** `OwnerDashboard` in `src/ui/owner-dashboard.tsx`  
**API:** `GET /api/owner/dashboard`  
**Service:** `summarizeActionQueue()` in `src/services/owner-mode/dashboard.service.ts`

**Data Source - Line 73-94:**
```typescript
const mockActions = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",           // ← HARDCODED UUID
    engagementId: "550e8400-e29b-41d4-a716-446655440000",  // ← HARDCODED UUID
    name: "Complete market analysis",
    status: "in_progress",
    priority: "high",
    dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
    assignee: "john@example.com",
    blockerCount: 0,
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",           // ← HARDCODED UUID
    engagementId: "550e8400-e29b-41d4-a716-446655440000",  // ← HARDCODED UUID
    name: "Implement pricing strategy",
    status: "pending",
    priority: "critical",
    dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
    assignee: "jane@example.com",
    blockerCount: 1,
  },
];
```

**How It's Used - Line 97:**
```typescript
const actionQueue = await summarizeActionQueue(context, mockActions);
```

**Data Source Type:** **HARDCODED MOCK ARRAY**

---

### Widget 3: KPI Metrics

**Component:** `OwnerDashboard` in `src/ui/owner-dashboard.tsx`  
**API:** `GET /api/owner/dashboard`  
**Service:** Inline in dashboard route (not called via service)

**Data Source - Line 112-123:**
```typescript
const mockKPIs = [
  {
    id: "kpi-001",
    name: "Revenue Growth",
    currentValue: 120000,
    targetValue: 150000,
    direction: "increase" as const,
    trend: "improving" as const,
    percentOfTarget: 80,
    lastUpdated: new Date().toISOString(),
  },
];
```

**Condition - Line 125:**
```typescript
const dashboard = await buildOwnerDashboardView(
  context,
  config,
  health,
  actionQueue,
  queryParams.includeKPIs === "true" ? mockKPIs : []  // ← Either mock KPIs or empty array
);
```

**Data Source Type:** **HARDCODED MOCK ARRAY**

---

### Widget 4: Top Risks

**Component:** `OwnerDashboard` in `src/ui/owner-dashboard.tsx`  
**API:** `GET /api/owner/dashboard`  
**Service:** `calculateWorkspaceHealth()` returns topRisks

**Data Source - Line 35 (in DTO transformation):**
```typescript
topRisks: data.health?.topRisks || [],
```

**Upstream Source:** `calculateWorkspaceHealth(context, mockEngagementSnapshots)` (Line 96)

**Data Source Type:** **CALCULATED FROM MOCK ENGAGEMENTS** → will always show same risks for same mock data

---

### Widget 5: Recommended Actions

**Component:** `OwnerDashboard` in `src/ui/owner-dashboard.tsx`  
**API:** `GET /api/owner/dashboard`  
**Service:** `calculateWorkspaceHealth()` returns recommendedActions

**Data Source - Line 36 (in DTO transformation):**
```typescript
recommendedActions: data.health?.recommendedActions || [],
```

**Upstream Source:** `calculateWorkspaceHealth(context, mockEngagementSnapshots)` (Line 96)

**Data Source Type:** **CALCULATED FROM MOCK ENGAGEMENTS** → will always show same recommendations for same mock data

---

### Widget 6: Critical Actions

**Component:** `OwnerDashboard` in `src/ui/owner-dashboard.tsx`  
**API:** `GET /api/owner/dashboard`  
**Service:** `summarizeActionQueue()` returns criticalActions

**Data Source - Line 37 (in DTO transformation):**
```typescript
criticalActions: data.actionQueue?.criticalActions || [],
```

**Upstream Source:** `summarizeActionQueue(context, mockActions)` (Line 97)

**Data Source Type:** **CALCULATED FROM MOCK ACTIONS** → will filter and display same demo actions

---

### Complete Data Flow

```
GET /api/owner/dashboard
  ↓
Handler at line 42 (src/app/api/owner/dashboard/route.ts)
  ↓
Create mock objects:
  - mockEngagementSnapshots (line 64)
  - mockActions (line 73)
  - mockKPIs (line 112)
  ↓
Process with services:
  - calculateWorkspaceHealth(context, mockEngagementSnapshots) [line 96]
  - summarizeActionQueue(context, mockActions) [line 97]
  ↓
Build view with mock data:
  - buildOwnerDashboardView(context, config, health, actionQueue, mockKPIs) [line 125]
  ↓
Transform to DTO:
  - toOwnerDashboardDTO(dashboard) [line 140]
  ↓
Return Response
```

**Critical Finding:** There is NO database query in this entire flow. All data is hardcoded or calculated from hardcoded objects.

---

## TASK 3: PROVE UUID 550e8400-e29b-41d4-a716-446655440000 IS RETURNED IN PRODUCTION

### Direct References in Code

**File:** `src/app/api/owner/dashboard/route.ts`

| Line | Reference | Type |
|---|---|---|
| 66 | `engagementId: "550e8400-e29b-41d4-a716-446655440000"` | engagementId in mockEngagementSnapshots |
| 75 | `id: "550e8400-e29b-41d4-a716-446655440001"` | action id (different UUID, same prefix) |
| 76 | `engagementId: "550e8400-e29b-41d4-a716-446655440000"` | engagement reference in action 1 |
| 85 | `id: "550e8400-e29b-41d4-a716-446655440002"` | action id (different UUID, same prefix) |
| 86 | `engagementId: "550e8400-e29b-41d4-a716-446655440000"` | engagement reference in action 2 |

**Total Occurrences:** 5 times with the exact prefix `550e8400-e29b-41d4-a716-446655440000`

---

### Execution Path to Response

**Step 1: Handler executes (line 42)**
```typescript
export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  // ... auth checks ...
  
  // Step 2: Create mock engagement snapshots
  const mockEngagementSnapshots = [
    {
      engagementId: "550e8400-e29b-41d4-a716-446655440000",  // ← HARDCODED HERE
```

**Step 2: Pass to health calculation (line 96)**
```typescript
const health = await calculateWorkspaceHealth(context, mockEngagementSnapshots);
// health object now contains data derived from UUID 550e8400-e29b-41d4-a716-446655440000
```

**Step 3: Build dashboard view (line 125)**
```typescript
const dashboard = await buildOwnerDashboardView(context, config, health, actionQueue, ...);
// dashboard object contains health.engagementCount and health.topRisks based on mock data
```

**Step 4: Transform to DTO (line 140)**
```typescript
return toOwnerDashboardDTO(dashboard);
// Returns JSON with data derived from mock engagementId
```

**Step 5: Response sent to client**
```
HTTP 200 OK
{
  "workspaceId": "<actual user's workspace>",
  "engagementCount": 1,  // from mock data
  "healthyEngagements": 1,  // from mock data
  "topRisks": [...],  // calculated from mock engagement UUID
  "recommendedActions": [...],  // calculated from mock engagement UUID
  "actionQueueSize": 2,  // from mock actions array
  "criticalActions": [...]  // from mock actions
}
```

---

### Is This UUID Actually Returned to Client?

**Answer: INDIRECTLY YES**

The UUID itself is not explicitly returned in the response, but:

1. The engagement count is 1 (from mockEngagementSnapshots array with 1 item)
2. The engagement health status is "healthy" (from line 67: `status: "healthy"`)
3. The KPI counts are 8/10 (from line 68-69: `kpiOnTrackCount: 8, kpiTotalCount: 10`)
4. The action queue has exactly 2 items (from mockActions array with 2 items)
5. The action names are "Complete market analysis" and "Implement pricing strategy"
6. The action statuses and priorities match the hardcoded values

**Every customer accessing this endpoint receives:**
- Same engagement count: 1
- Same health status: healthy  
- Same KPI metrics: 8/10
- Same actions: 2 (market analysis, pricing strategy)
- Same action priorities: high, critical

---

## TASK 4: CLASSIFY DASHBOARD

### Analysis

| Aspect | Finding | Classification |
|---|---|---|
| **Database Queries** | ZERO - no db.engagement, db.action calls | **FULL_MOCK** |
| **Real Data** | None in main flow | **FULL_MOCK** |
| **Mock Objects** | mockEngagementSnapshots, mockActions, mockKPIs | **FULL_MOCK** |
| **Hardcoded UUIDs** | 550e8400-* series throughout | **FULL_MOCK** |
| **Conditional Logic** | No "if real data exists, use it; else use mock" | **FULL_MOCK** |
| **User Data** | Zero customer data shown | **FULL_MOCK** |

---

### Dashboard Classification

**FULL_MOCK** ✅ CONFIRMED

**Evidence:**
- Engagements: Hardcoded mock object (line 64-71)
- Actions: Hardcoded mock array (line 73-94)
- KPIs: Hardcoded mock array (line 112-123)
- Health calculation: Uses mock engagements (line 96)
- Action queue summary: Uses mock actions (line 97)
- Response: Derived entirely from hardcoded mock data (line 140)

**Impact:**
- Every user sees identical dashboard (same mock engagement, same actions)
- No real workspace data displayed
- No real customer metrics shown
- No way to differentiate between customers

---

## TASK 5: OUTPUT BLOCKER STATUS

### Blocker 1: SIGNUP

| Item | Status | Evidence |
|---|---|---|
| Signup page exists | ❌ NO | No /signup route, no signup component |
| Signup API exists | ❌ NO | Only /api/users (protected by auth) |
| Public account creation | ❌ NO | All user creation requires authentication |
| Signup link on login | ❌ NO | Login page has no signup link |
| Customer can self-onboard | ❌ NO | Cannot create account without auth |

**Result:** **BLOCKER_CONFIRMED** 🔴

**Exact Path Missing:** No public flow from visitor → account creation → login → dashboard

---

### Blocker 2: DASHBOARD

| Item | Status | Evidence |
|---|---|---|
| Dashboard returns mock data | ✅ YES | Lines 64-123 in /api/owner/dashboard/route.ts |
| Hardcoded UUIDs used | ✅ YES | UUID 550e8400-e29b-41d4-a716-446655440000 |
| Real engagement data shown | ❌ NO | Zero database queries |
| Customer can see their metrics | ❌ NO | Shows demo actions & engagement |
| Data is workspace-scoped | ❌ NO | Same data for all users |

**Result:** **BLOCKER_CONFIRMED** 🔴

**Exact File and Lines:**
- `src/app/api/owner/dashboard/route.ts` lines 64-140
- `src/app/api/owner/dashboard/route.ts` line 66 (hardcoded engagement UUID)
- `src/app/api/owner/dashboard/route.ts` lines 75-76, 85-86 (hardcoded action UUIDs)

---

## FINAL VERDICT

### Blocker 1: Signup
**BLOCKER_CONFIRMED**

### Blocker 2: Dashboard  
**BLOCKER_CONFIRMED**

---

## SUMMARY

Both blockers identified in hostile MVP audit are **CONFIRMED with evidence:**

1. **NO SIGNUP FLOW** — New customers cannot create accounts
2. **DASHBOARD RETURNS MOCK DATA** — Customers see demo engagement + actions, not their own data

These are not assumptions or inferences. They are code facts:
- Signup missing: No files, no routes, no components, no flow
- Dashboard mock: Hardcoded arrays at lines 64, 73, 112 in `/api/owner/dashboard/route.ts`

**MVP cannot deliver customer value.** Core blockers confirmed.
