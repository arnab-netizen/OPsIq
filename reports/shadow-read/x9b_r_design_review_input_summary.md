# X9B-R: Design Review Input Summary

**Phase:** X9B-R (Policy Design Safety Review)  
**Date:** 2026-05-15  
**Status:** HOSTILE REVIEW IN PROGRESS

---

## X9B Design Recommendation Summary

### Selected Option: Option A
**Add policy fields directly to CanonicalAuthContext**

### Proposed Contract Shape

**CanonicalAuthContext Interface (Updated):**

```typescript
interface CanonicalAuthContext {
  // IDENTITY LAYER (Already canonical, no changes)
  verifiedActorId: string;
  verifiedActorType: "user" | "service";
  verifiedActor: AuthenticatedUser;
  
  // SCOPE LAYER (Already canonical, no changes)
  verifiedWorkspaceId: string;
  
  // CAPABILITY LAYER (Already canonical, no changes)
  verifiedCapabilities: Set<string>;
  
  // IMMUTABILITY LAYER (Already present, no changes)
  verifiedSessionSnapshot: {...};
  
  // REQUEST CONTEXT (Already present, no changes)
  request?: NextRequest;
  correlationId?: string;
  requestId?: string;
  
  // TRACING (Already present, no changes)
  traceId?: string;
  executionTrace?: Readonly<any>;
  
  // SESSION INFO (Already present, no changes)
  session?: SessionInfo;
  
  // NEW POLICY FIELDS (Proposed)
  verifiedInternalAccess?: boolean;  // Computed at auth time
  policy?: PolicyContext;             // Optional, for observability
}
```

### Proposed Policy Fields

1. **verifiedInternalAccess?: boolean**
   - Type: Optional boolean
   - Source: Computed by wrapper from policy.roles
   - Computation: `hasInternalAccess(policy)` = any non-client role exists
   - Freshness: Computed once per request
   - Immutable: Yes (passed to handler, not modified)
   - Visible to: Routes and services
   - Use case: Visibility filtering (internal vs. client-visible records)

2. **policy?: PolicyContext**
   - Type: Optional PolicyContext object
   - Source: Fetched from auth system during auth
   - Contents: `{ userId, roles, engagementMemberships }`
   - Freshness: Per-request (no caching)
   - Immutable: Yes (passed to handler, not modified)
   - Visible to: Routes only (not services)
   - Use case: Observability (routes examining role/tier info)

### Proposed Fail-Closed Behavior

**When policy is missing:**
- `verifiedInternalAccess = false` (default)
- `verifiedCapabilities = []` (empty, computed from no policy)
- Handler executes with no special access
- Services see unprivileged context

**When policy is stale or invalid:**
- Wrapper refetches policy per request (no caching)
- If fetch fails: return 500, do NOT proceed
- Never use cached policy from earlier request
- Services never see stale policy

**When verifiedInternalAccess is needed but missing:**
- Defensive pattern: `ctx.verifiedInternalAccess ?? false`
- If policy is null, default to false (fail-closed)
- No implicit internal access granted

**When workspace membership cannot be verified:**
- Wrapper validates before handler execution
- If not a member: return 403 Forbidden
- Handler never called
- Services never called

### Proposed Scanner Recognition Rule

**Acceptable patterns:**
- ✓ `ctx.verifiedInternalAccess` - Computed field, not a violation
- ✓ `ctx.policy ? hasInternalAccess(ctx.policy) : false` - Defensive, acceptable
- ✓ `ctx.verifiedCapabilities` - Pre-computed, not a violation
- ✓ Routes accessing `ctx.policy` for observability - Routes can see it

**Unacceptable patterns:**
- ✗ Services accessing `ctx.policy` - Services should not see raw policy
- ✗ Routes constructing `{ policy: {...} }` - Route fabrication
- ✗ `ctx.policy.roles.some(...)` in services - Services inferring from policy
- ✗ Routes modifying `ctx.verifiedInternalAccess` - Immutability violation

### Proposed Migration Recipe

**Phase X9C-1: Wrapper Enhancement**
```
1. Add verifiedInternalAccess?: boolean to CanonicalAuthContext interface
2. Update wrapper to compute: verifiedInternalAccess = policy ? hasInternalAccess(policy) : false
3. No route changes needed
4. No service changes needed
Expected reduction: 0 (infrastructure)
```

**Phase X9C-2: Route Cleanup (Optional)**
```
1. Routes switch from ctx.policy ? hasInternalAccess : false to ctx.verifiedInternalAccess ?? false
2. ~3-4 routes affected
Expected reduction: 0-2 (observability improvement)
```

**Phase X9C-3: Service Refactoring**
```
1. Services stop receiving full ctx, receive boolean instead
2. Service signatures: getEngagementById(id, workspaceId, hasInternalAccess)
3. Routes pass: ctx.verifiedInternalAccess ?? false
4. Services: Use boolean, don't access ctx.policy
Expected reduction: 6-8 (service auth violations)
Total: 6-10 violations over all phases
```

### Proposed First Pilot Candidates

**Safe Pilots (Low Risk):**
1. src/app/api/engagements/route.ts (GET)
   - Current: `ctx.policy ? hasInternalAccess(ctx.policy) : false`
   - Change: Use `ctx.verifiedInternalAccess ?? false`
   - Risk: LOW - Same behavior, clearer intent
   - Proof: Engagement list still filters visibility correctly

2. src/app/api/engagements/[engagementId]/route.ts (GET)
   - Current: `ctx.policy ? hasInternalAccess(ctx.policy) : false`
   - Change: Use `ctx.verifiedInternalAccess ?? false`
   - Risk: LOW - Same behavior
   - Proof: Single engagement filters correctly

3. src/app/api/me/route.ts (GET)
   - Current: `ctx.policy ? highestRole(ctx.policy) : null; ctx.policy ? hasInternalAccess : false`
   - Change: Use `ctx.verifiedInternalAccess ?? false`
   - Risk: LOW - Observability, not enforcement
   - Proof: Response includes correct isInternal flag

**Medium-Risk Pilot (Service Refactoring):**
1. src/services/engagement.ts (getEngagementById)
   - Current: Accepts ctx, computes `hasInternalAccess(ctx.policy)`
   - Change: Accept `hasInternalAccess` boolean parameter
   - Risk: MEDIUM - Service signature change
   - Proof: All visibility filtering tests pass

---

## Safety Review Scope

This review will assess Option A for:

1. **Policy Fabrication:** Can route create fake policy?
2. **Policy Staleness:** Is policy guaranteed fresh?
3. **Service Misuse:** Can services access policy unsafely?
4. **Internal Access Exposure:** Could internal access be granted accidentally?
5. **Role/Capability Confusion:** Could role be mistaken for capability?
6. **Workspace Validation:** Is membership truly verified?
7. **System Actor Ambiguity:** How do webhooks/jobs fit?
8. **Cross-Workspace Leakage:** Could policy leak across workspaces?
9. **Scanner Clarity:** Will scanner recognize unsafe patterns?
10. **Future Service Errors:** Could future services misuse optional fields?

---

**Status:** ✓ Design Summary Complete - Ready for Hostile Review
