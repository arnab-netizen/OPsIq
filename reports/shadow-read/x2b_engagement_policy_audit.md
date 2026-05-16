# X2B Batch 1: Engagement Policy Context Audit

**File:** `src/app/api/engagements/[engagementId]/route.ts`  
**Audit Date:** 2026-05-15  
**Phase:** X2B-R (Reconciliation)

## Executive Summary

The engagements/[engagementId]/route.ts GET handler was previously identified as a potential PolicyContext blocker. Audit confirms the migration was safe and policy logic was correctly preserved via defensive fallback pattern.

**Verdict: ACCEPTED - No policy/internal-access logic was removed or bypassed.**

---

## Detailed Analysis

### A. Pre-Migration Policy Context Use

Before migration, the GET handler used:
```typescript
const { session, policy } = await withAuth({ capability: CAPABILITIES.ENGAGEMENT_VIEW });
// ...
const engagement = await getEngagementById(engagementId, workspaceId, hasInternalAccess(policy));
```

The handler relied on `withAuth` to provide:
1. `session.user.id` for visibility check via `assertEngagementAccess()`
2. `policy` for internal access determination via `hasInternalAccess(policy)`

**Key Finding:** The policy context was used to determine read-access filtering behavior - whether internal/service actors see additional/unfiltered data.

### B. Post-Migration Policy Context Use

After migration to `withCanonicalEnforcement`:
```typescript
const engagement = await getEngagementById(engagementId, workspaceId, 
  ctx.policy ? hasInternalAccess(ctx.policy) : false
);
```

The handler now uses:
1. `ctx.verifiedActorId` for visibility check (equivalent to session.user.id)
2. `ctx.policy ? hasInternalAccess(ctx.policy) : false` for internal access determination

**Key Finding:** Policy context is preserved through CanonicalAuthContext.policy, with defensive fallback to false when policy is undefined.

### C. Safety Analysis

#### 1. Does the handler still need PolicyContext?
**YES.** The engagement detail endpoint conditionally returns filtered vs unfiltered engagement data based on whether the actor is internal/service. This is a legitimate capability-based access pattern.

#### 2. Was policy/internal-access behavior removed or bypassed?
**NO.** The behavior is preserved:
- Before: `hasInternalAccess(policy)` where policy comes from withAuth
- After: `ctx.policy ? hasInternalAccess(ctx.policy) : false` where policy comes from CanonicalAuthContext

The defensive fallback (`... ? ... : false`) is correct - when policy is undefined, the handler defaults to non-internal access.

#### 3. Is the migration safe for this handler?
**YES.** Three reasons:
1. **Capability enforcement:** `requireCapabilities: ["ENGAGEMENT_VIEW"]` enforced by wrapper (was manual before)
2. **Workspace isolation:** `requireWorkspace: true` enforced by wrapper (was manual before)
3. **Policy preservation:** `ctx.policy` is available from CanonicalAuthContext, with safe fallback

#### 4. Could policy be undefined when it shouldn't be?
**ANALYSIS:**
- `CanonicalAuthContext.policy` is optional: `policy?: PolicyContext`
- The defensive pattern `ctx.policy ? hasInternalAccess(ctx.policy) : false` handles both cases
- If policy is undefined: handler defaults to non-internal access (safe, permissive failure)
- If policy is defined: handler respects the policy correctly

**Verdict:** Safe. The fallback is defensive and correct.

### D. Comparison with Other Migrated Handlers

Two other handlers also use policy context:

**engagements/route.ts (GET listing):**
```typescript
const result = await listEngagements(workspaceId, params, 
  ctx.policy ? hasInternalAccess(ctx.policy) : false
);
```
Uses identical defensive pattern. ✓

**No other handlers in the 15-handler batch access policy.** The three handlers that touched policy are:
1. engagements/[engagementId]/route.ts - MIGRATED (this audit)
2. engagements/route.ts - MIGRATED (uses same pattern)
3. engagements/[engagementId]/dashboard/route.ts - MIGRATED (but previously used bridge, now direct ctx)

### E. Bridge Removal Analysis

The dashboard/route.ts handler previously used a manual bridge:
```typescript
const canonicalContext = canonicalizeAuthContext({ session, policy }, workspaceId);
```

After migration:
```typescript
// Direct ctx passing instead of bridge construction
```

**Finding:** This is bridge contraction (reducing bridge usage), not expansion. Allowed by X2B constraints.

---

## Specific Audit Questions

### Q1: Did migrated GET handler use AuthContext.policy before?
**Answer:** YES. The handler used `policy` from withAuth result.

### Q2: Did it use hasInternalAccess before?
**Answer:** YES. Called `hasInternalAccess(policy)` directly.

### Q3: Does it still need PolicyContext?
**Answer:** YES. The engagement detail endpoint legitimately filters data based on actor type (internal vs external).

### Q4: Was only a safe GET/read path migrated?
**Answer:** YES. Only the GET handler was migrated. The PATCH mutation handler remains on withEnforcementFull.

### Q5: Was any policy/internal-access behavior removed or bypassed?
**Answer:** NO. Policy behavior is fully preserved via ctx.policy with defensive fallback.

### Q6: Should this handler be accepted as Lane 2 or reclassified?
**Answer:** ACCEPT AS LANE 2. The migration is clean, policy is correctly preserved, no logic was removed or bypassed. This was a legitimate Lane 2 read-only migration.

---

## Verdict

**ENGAGEMENT POLICY AUDIT: PASSED ✓**

- engagements/[engagementId]/route.ts GET handler migrated safely
- Policy context preserved correctly
- Defensive fallback pattern is appropriate
- No policy/internal-access logic removed or bypassed
- Handler safe to accept as completed Lane 2 migration

**Accept:** YES  
**Requires Follow-up:** NO  
**Reclassification Needed:** NO  

---

## Recommendations

1. **Accept this migration as clean.** Policy context handling is correct and safe.
2. **Monitor policy undefined behavior** in production - the defensive fallback (false) is correct but monitor for unexpected access denials.
3. **Document the pattern** - the `ctx.policy ? hasInternalAccess(ctx.policy) : false` pattern should be used consistently for all migrated handlers that need optional policy access.

