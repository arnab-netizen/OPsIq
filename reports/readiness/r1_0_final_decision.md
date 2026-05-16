# R1-0: Final Decision — Governance Hardening Implementation Authorization

**Date:** 2026-05-16  
**Decision:** R1 IMPLEMENTATION AUTHORIZED ✓  
**Phase:** R1-A (First Batch)  
**Next Phase Name:** R1-A-First-Batch-Safe-Route-Modernization  
**Timeline:** Week 1-2 (Days 1-10)  
**Code Changes Allowed:** YES (route modernization only)  

---

## AUTHORIZATION DECISION

**May R1 implementation begin?** **YES ✓**

**Conditions Met:**
- ✓ Baseline confirmed (444 violations all classified)
- ✓ Lanes defined (8 lanes, all safe or can-be-made-safe)
- ✓ First batch selected (5 routes, LOW risk)
- ✓ Execution plan documented (phased, with gates)
- ✓ Readiness impact clear (private beta unblocked after R1-A)

---

## EXACT AUTHORIZATION SCOPE: R1-A FIRST BATCH

### Routes Authorized for Implementation

**Exactly these 5 routes and no others:**

```
1. src/app/api/billing/upgrade/route.ts
2. src/app/api/operator/myday/route.ts
3. src/app/api/operator/queue/route.ts
4. src/app/api/operator/my-day/route.ts
5. src/app/api/recommendations/[recommendationId]/route.ts
```

### Files Authorized for Modification

**Only within selected routes:**
- Change `import { withAuth } from "@/lib/auth-guard"` → remove
- Change `await withAuth()` → `ctx.verifiedSessionSnapshot`
- Change `authContext.policy` → `policy` (from context)
- Add capability check: `if (!policy.can('CAPABILITY')) throw new ForbiddenError()`

**Files NOT permitted to change:**
- src/lib/auth-guard.ts (not for R1-A)
- src/lib/enforced-route.ts (not for R1-A)
- src/governance/capabilities.ts (not for R1-A)
- src/governance/role-mappings.ts (not for R1-A)
- src/services/* (not for R1-A - deferred to R1-B)
- prisma/schema.prisma (not for R1-A)
- package.json, package-lock.json (not for R1-A)
- src/app/api/** (only the 5 specified routes)

---

## EXACT PATTERN REQUIRED (From Close Route X9G-4)

**Template:**

```typescript
// src/app/api/[route]/route.ts

// 1. REMOVE: import { withAuth } from "@/lib/auth-guard";

import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";

// 2. USE: withEnforcementFull wrapper (already in place)
export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  // 3. EXTRACT: policy from context snapshot
  const { policy } = ctx.verifiedSessionSnapshot;
  
  // 4. ENFORCE: required capability (check before handler)
  if (!policy.can('REQUIRED_CAPABILITY_HERE')) {
    throw new ForbiddenError('Insufficient permissions');
  }
  
  // 5. PROCEED: with business logic using policy
  const userId = policy.userId;
  const workspaceId = policy.workspaceId;
  
  // ... rest of handler unchanged
  return { /* ... */ };
});
```

**Variations:**
- Read-only routes: `policy.can('RESOURCE_READ')`
- Write routes: `policy.can('RESOURCE_WRITE')` or `policy.can('RESOURCE_UPDATE')`
- Create routes: `policy.can('RESOURCE_CREATE')`
- Delete routes: `policy.can('RESOURCE_DELETE')`

---

## EXACT REQUIRED CAPABILITIES (Per Route)

### Route 1: billing/upgrade
- **Capability:** BILLING_CUSTOMER
- **Verification:** Exists in src/governance/capabilities.ts ✓
- **Change:**
  ```typescript
  // FROM
  const authContext = await withAuth();
  const userId = authContext.policy.userId;
  
  // TO
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can('BILLING_CUSTOMER')) throw new ForbiddenError();
  const userId = policy.userId;
  ```

### Route 2: operator/myday
- **Capability:** ACTION_READ
- **Verification:** Exists ✓
- **Change:** Replace `await withAuth()` with context extraction + capability check

### Route 3: operator/queue
- **Capability:** ACTION_READ
- **Verification:** Exists ✓
- **Change:** Replace `await withAuth()` with context extraction + capability check

### Route 4: operator/my-day
- **Capability:** ACTION_UPDATE
- **Verification:** Exists ✓
- **Change:** Replace `await withAuth()` with context extraction + capability check

### Route 5: recommendations/[recommendationId]
- **Capability:** RECOMMENDATION_READ
- **Verification:** Exists ✓
- **Change:** Replace `await withAuth()` with context extraction + capability check

---

## EXACT VALIDATION COMMANDS (Must Pass)

### Per-Route Tests
```bash
npm test -- billing          # Must: 100% pass
npm test -- operator         # Must: 100% pass
npm test -- recommendations  # Must: 100% pass
```

### Core Governance Tests (Must Not Regress)
```bash
npm test -- governance-capabilities      # Must: 32/32 pass
npm test -- policy-wrapper-enforcement   # Must: 32/32 pass
npm test -- g6r-auth-bridge              # Must: 14/14 pass
```

### Scanner Validation
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
# Must show: violations reduced from 444 to ~429 (15+ violations fixed)
# Must show: no NEW violations introduced
```

### Build Validation
```bash
DATABASE_URL=postgresql://user:pass@host/db npm run build
# Must: exit code 0 (build succeeds)
```

---

## EXACT STOP CONDITIONS (When to Stop R1-A)

### Critical Stop: DO NOT COMMIT
1. Any route test fails after modernization and cannot be fixed in 30 minutes
2. Core governance tests fail (any of 78 tests)
3. Build fails with new route changes
4. Scanner shows violation count INCREASED (not decreased)
5. New violations introduced that weren't in baseline

### Warning Stop: Pause and Investigate
1. Route behavior changes (output format different)
2. Authorization check happens at wrong point (before business logic)
3. More than 3 violations remain in single route after modernization

### When to Proceed to Next Route
1. Route test passes 100%
2. Core governance tests still pass 100%
3. Scanner shows violation reduction
4. No test output format changes

---

## COMMITS ALLOWED FOR R1-A

### Commit Style
- One commit per route batch (not per individual route)
- Commit message: `R1-A: Modernize [route names] from withAuth() to canonical enforcement`
- Example: `R1-A: Modernize billing/upgrade and operator routes with DECISION_* capabilities`

### Commit Contents
- Only the 5 selected route files
- Only auth pattern changes (no business logic changes)
- Clear diff showing: removed imports, replaced context extraction, added capability checks

### Commit Process
```bash
# 1. Modify route files
# 2. Run tests
npm test -- [routes]
npm test -- governance-capabilities

# 3. Run scanner
npx tsx src/governance/auth-shadow-read-scanner.ts

# 4. Commit (if all pass)
git add src/app/api/billing/upgrade/route.ts \
        src/app/api/operator/myday/route.ts \
        src/app/api/operator/queue/route.ts \
        src/app/api/operator/my-day/route.ts \
        src/app/api/recommendations/[recommendationId]/route.ts

git commit -m "R1-A: Modernize operator and billing routes to canonical enforcement

- billing/upgrade: withAuth() → ctx.verifiedSessionSnapshot + BILLING_CUSTOMER capability
- operator/myday: withAuth() → ctx.verifiedSessionSnapshot + ACTION_READ capability
- operator/queue: withAuth() → ctx.verifiedSessionSnapshot + ACTION_READ capability
- operator/my-day: withAuth() → ctx.verifiedSessionSnapshot + ACTION_UPDATE capability
- recommendations: withAuth() → ctx.verifiedSessionSnapshot + RECOMMENDATION_READ capability

Expected scanner reduction: 15 violations (444 → 429)
All tests passing: 78/78 core governance + route tests
"

# 5. Push
git push origin main
```

---

## NEXT PHASE AFTER R1-A

**After R1-A passes all tests:**
1. Verify scanner shows ~429 violations remaining
2. Verify all 78 core governance tests still pass
3. Trigger R1-B authorization (Batch 1.2: owner/dashboard routes)

**R1-A → R1-B Transition Criteria:**
- ✓ 5 routes modernized and passing tests
- ✓ Scanner shows violation reduction
- ✓ No regressions in core tests
- ✓ Build passes (with DATABASE_URL)

**Estimated Timeline:** Days 1-2 (2 days for 5 routes)

---

## EXPECTED OUTCOMES

### Violations
- **Before:** 444 total (281 critical, 163 block-build)
- **After R1-A:** ~429 total (276 critical, 158 block-build)
- **Reduction:** ~15 violations (3.4% progress)

### Tests
- **Before:** 78/78 core governance passing
- **After R1-A:** 78/78 core governance passing (no regression)
- **Route Tests:** 100% passing (no business logic changes)

### Build
- **Before:** ENV-GATED (DATABASE_URL required)
- **After R1-A:** Still ENV-GATED (will become fully passing after all block-build violations fixed)

### Readiness
- **Before:** Conditional readiness entry approved
- **After R1-A:** Pattern proven, R1-B authorized, Lane 1-4 path clear

---

## CRITICAL CONSTRAINTS FOR R1-A

**DO NOT:**
- ❌ Change business logic (logic must remain identical)
- ❌ Change response structure (API output must be same)
- ❌ Add new parameters (function signatures must not change)
- ❌ Modify auth-guard.ts (not in scope)
- ❌ Change governance/capabilities.ts (not in scope)
- ❌ Modify services (deferred to R1-B)
- ❌ Update tests (test should not require changes)
- ❌ Create new routes (only modernize existing 5)

**DO:**
- ✓ Replace auth pattern only
- ✓ Add capability check (before handler)
- ✓ Remove auth-guard imports
- ✓ Extract policy from context
- ✓ Test that capability check works (403 if missing)
- ✓ Verify output is identical to before

---

## FINAL DECISION SUMMARY

| Item | Decision |
|------|----------|
| **May R1 begin?** | **YES ✓** |
| **R1-A authorized?** | **YES ✓** |
| **Routes authorized** | 5 routes (specified) |
| **Files permitted** | Only those 5 routes |
| **Pattern required** | Close route template (X9G-4) |
| **Tests required** | 100% pass (all 78 core governance + route tests) |
| **Expected violations reduced** | 15 (444 → 429) |
| **Private beta blocked?** | NO (R1-A unblocks Week 1-2) |
| **Next phase** | R1-B (after R1-A passes) |
| **Code changes allowed** | YES (auth patterns only) |
| **Commits allowed** | YES (one per route batch) |
| **Force push allowed** | NO |
| **Merge allowed** | NO (stay on main) |
| **Estimated time R1-A** | 2 days (with experienced developer) |

**AUTHORIZATION:** R1-A FIRST BATCH IMPLEMENTATION APPROVED ✓

Begin implementation immediately upon team confirmation. Execute exactly as specified above. All 5 routes must pass tests before committing. All core governance tests must continue passing. No deviations from specified routes or pattern.

