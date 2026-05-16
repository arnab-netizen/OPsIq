# R1-0: First Safe Batch Selection — Route Modernization Lane 1-4

**Date:** 2026-05-16  
**Batch:** R1-A (First Implementation Batch)  
**Lane Selection:** Lanes 1, 2, 3 (Safe Route Canonicalization)  
**Batch Size:** 5 routes (maximum as per requirement)  
**Risk Level:** LOW (proven pattern)  
**Expected Scanner Reduction:** ~40 violations  

---

## Selected Routes for R1-A

### Route 1: src/app/api/billing/upgrade/route.ts

**Current Pattern:**
```typescript
import { withAuth } from "@/lib/auth-guard";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const authContext = await withAuth();
  const userId = authContext.policy.userId;
  // ... billing logic
});
```

**Target Pattern:**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can('BILLING_CUSTOMER')) throw new ForbiddenError();
  const userId = policy.userId;
  // ... billing logic
});
```

**Lane:** 2 (Capability Route Canonicalization)  
**Required Capability:** BILLING_CUSTOMER (exists ✓)  
**Complexity:** SIMPLE (existing route, just replace pattern)  
**Why Safe:**
- Route already uses withEnforcementFull wrapper
- Capability exists and is properly mapped
- Billing user is authenticated before handler
- No service refactor needed
- Tests exist and should pass unchanged
- This is **BL-003** blocker — critical for paid beta

**Expected Test Impact:** 100% pass (no business logic changes)  
**Expected Scanner Reduction:** 3 violations (withAuth, import, capability reference)

---

### Route 2: src/app/api/operator/myday/route.ts

**Current Pattern:**
```typescript
import { withAuth } from "@/lib/auth-guard";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  // ... my-day logic
});
```

**Target Pattern:**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can('ACTION_READ')) throw new ForbiddenError();
  // ... my-day logic
});
```

**Lane:** 1 (Safe Route Canonicalization)  
**Required Capability:** ACTION_READ (exists ✓)  
**Complexity:** SIMPLE (read-only operation)  
**Why Safe:**
- Read-only endpoint (no state mutation)
- Capability exists (read-only actions)
- Pattern matches close route exactly
- No service refactor needed
- Tests exist

**Expected Test Impact:** 100% pass  
**Expected Scanner Reduction:** 3 violations

---

### Route 3: src/app/api/operator/queue/route.ts

**Current Pattern:**
```typescript
import { withAuth } from "@/lib/auth-guard";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  // ... queue logic
});
```

**Target Pattern:**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can('ACTION_READ')) throw new ForbiddenError();
  // ... queue logic
});
```

**Lane:** 1 (Safe Route Canonicalization)  
**Required Capability:** ACTION_READ (exists ✓)  
**Complexity:** SIMPLE (read-only operation)  
**Why Safe:**
- Read-only endpoint
- Same pattern as Route 2
- Proven capability
- No mutations

**Expected Test Impact:** 100% pass  
**Expected Scanner Reduction:** 3 violations

---

### Route 4: src/app/api/operator/my-day/route.ts

**Current Pattern:**
```typescript
import { withAuth } from "@/lib/auth-guard";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  // ... my-day update logic
});
```

**Target Pattern:**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can('ACTION_UPDATE')) throw new ForbiddenError();
  // ... my-day update logic
});
```

**Lane:** 2 (Capability Route Canonicalization)  
**Required Capability:** ACTION_UPDATE (exists ✓)  
**Complexity:** SIMPLE (state mutation but straightforward)  
**Why Safe:**
- Capability exists for update operations
- Pattern is straightforward
- No complex authorization needed
- Service layer doesn't need refactor

**Expected Test Impact:** 100% pass  
**Expected Scanner Reduction:** 3 violations

---

### Route 5: src/app/api/recommendations/[recommendationId]/route.ts

**Current Pattern:**
```typescript
import { withAuth, canonicalizeAuthContext } from "@/lib/auth-guard";

export const POST = withEnforcementFull(async (request: NextRequest) => {
  const authContext = await withAuth();
  // ... recommendation logic
});
```

**Target Pattern:**
```typescript
export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  const { policy } = ctx.verifiedSessionSnapshot;
  if (!policy.can('RECOMMENDATION_READ')) throw new ForbiddenError();
  // ... recommendation logic
});
```

**Lane:** 1 (Safe Route Canonicalization)  
**Required Capability:** RECOMMENDATION_READ (exists ✓)  
**Complexity:** SIMPLE (read-only operation)  
**Why Safe:**
- Read-only endpoint
- Capability exists
- Pattern straightforward
- No mutations

**Expected Test Impact:** 100% pass  
**Expected Scanner Reduction:** 3 violations

---

## Batch Summary

| Route | File | Pattern | Capability | Risk | Impact |
|-------|------|---------|-----------|------|--------|
| 1 | billing/upgrade | withAuth() | BILLING_CUSTOMER | LOW | BL-003 fix |
| 2 | operator/myday | withAuth() | ACTION_READ | LOW | Read-only |
| 3 | operator/queue | withAuth() | ACTION_READ | LOW | Read-only |
| 4 | operator/my-day | withAuth() | ACTION_UPDATE | LOW | Update op |
| 5 | recommendations/* | withAuth() | RECOMMENDATION_READ | LOW | Read-only |

**Total Routes:** 5  
**Total Files to Change:** 5  
**Total Lines to Change:** ~15-20 per file  
**Total Violations Addressed:** ~15 violations  
**Remaining Violations:** 429  

---

## Implementation Details

### Files Modified
```
src/app/api/billing/upgrade/route.ts
src/app/api/operator/myday/route.ts
src/app/api/operator/queue/route.ts
src/app/api/operator/my-day/route.ts
src/app/api/recommendations/[recommendationId]/route.ts
```

### Pattern Template (from close route)

Each route follows this template:

```typescript
// 1. Remove auth-guard import
// OLD: import { withAuth } from "@/lib/auth-guard";

// 2. Use canonical enforcement wrapper
export const POST = withEnforcementFull(async (request: NextRequest, { ctx }) => {
  // 3. Extract policy from context
  const { policy } = ctx.verifiedSessionSnapshot;
  
  // 4. Enforce required capability
  if (!policy.can('REQUIRED_CAPABILITY')) {
    throw new ForbiddenError('Insufficient permissions');
  }
  
  // 5. Proceed with business logic using policy
  const userId = policy.userId;
  // ... rest of handler
});
```

---

## Testing Strategy

### Per-Route Testing

**Unit Tests:**
- Route test suite must pass: `npm test -- [route-name]`
- No test changes needed (business logic unchanged)
- Verify capability check works: test with missing capability → expect 403

**Integration Tests:**
- Test: authenticated user with required capability → success
- Test: authenticated user without capability → 403
- Test: unauthenticated user → 401

**Regression Tests:**
- Verify original functionality preserved
- No changes to response shape
- No changes to business logic

### Validation Commands

**Per-route validation:**
```bash
npm test -- billing
npm test -- operator
npm test -- recommendations
```

**Full governance validation:**
```bash
npm test -- governance-capabilities         # 32 tests must pass
npm test -- policy-wrapper-enforcement      # 32 tests must pass
npm test -- g6r-auth-bridge                 # 14 tests must pass
```

**Scanner validation:**
```bash
npx tsx src/governance/auth-shadow-read-scanner.ts
# Expected: violations reduced from 444 to ~429
```

---

## Rollback Rule

**If any route test fails:**
1. Revert route to previous pattern
2. Diagnose why capability check failed
3. Verify capability is defined in governance/capabilities.ts
4. Check if policy mapping is correct in role-mappings.ts
5. Retry with corrected capability name or mapping

**If all routes fail:**
1. Verify ctx.verifiedSessionSnapshot is available in middleware
2. Verify withEnforcementFull wrapper is properly injecting ctx
3. Check if auth-guard module has breaking changes

---

## Why This Batch is Safe

✓ **Pattern proven:** Close route modernized in X9G-4, all tests pass  
✓ **Capabilities exist:** All required capabilities already defined  
✓ **No service refactor:** Routes don't call legacy service patterns  
✓ **No policy changes:** Policy enforcement unchanged  
✓ **Read-heavy:** Mostly read-only routes, minimal mutation risk  
✓ **Isolated:** Routes don't cross-call each other  
✓ **Limited scope:** 5 files, 15-20 lines per file  
✓ **Reversible:** Can rollback any route independently  

---

## Expected Outcomes

**Violations Reduced:**
- From: 444 total (281 critical, 163 block-build)
- To: ~429 total (after batch 1)

**Tests Status:**
- Core governance: 78/78 passing (no change expected)
- Batch routes: 100% passing (no business logic changes)

**Scanner Status:**
- Block-build: 158/163 remaining
- Critical: 276/281 remaining
- Total: 434/444 remaining

**Readiness Impact:**
- BL-003 (Stripe route) FIXED ✓
- Proof-of-pattern established for subsequent batches
- Gateway cleared for Batch 2 (service boundaries)

---

## Next Steps After Batch 1

Once Batch 1 passes all tests and scanner shows 429 violations:

1. **Batch 2 Selection:** Service boundary routes (Lane 5, ~58 violations)
2. **Batch 3 Selection:** Unknown routes (Lane 8, ~43 violations)
3. **Batch 4 Selection:** Test/dev code (Lane 7, ~78 violations)
4. **Final Validation:** Scanner 0 violations

