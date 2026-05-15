# X9B-R: Option A vs B vs D Comparison

**Phase:** X9B-R (Policy Design Safety Review)  
**Date:** 2026-05-15  
**Status:** COMPARATIVE ANALYSIS

---

## Three Options Under Review

### Option A: Add Policy Fields Directly
```typescript
interface CanonicalAuthContext {
  verifiedInternalAccess?: boolean;  // NEW
  policy?: PolicyContext;             // Existing, optional
}
```

### Option B: Nested CanonicalPolicyContext
```typescript
interface CanonicalPolicyContext {
  verifiedInternalAccess: boolean;
  verifiedHighestRole: RoleName | null;
}

interface CanonicalAuthContext {
  policy?: {
    context: CanonicalPolicyContext;   // Canonical policy data
    raw?: PolicyContext;                // Optional raw for observability
  };
}
```

### Option D: Layered withCanonicalPolicyEnforcement Wrapper
```typescript
interface CanonicalAuthContext {
  // Unchanged from current
  verifiedActorId: string;
  verifiedWorkspaceId: string;
  verifiedCapabilities: Set<string>;
  // NO policy fields
}

// NEW wrapper for policy-sensitive routes
export function withCanonicalPolicyEnforcement(
  handler,
  options?: {
    requireInternalAccess?: boolean;
    requirePolicyContext?: boolean;
  }
)
```

---

## Fail-Closed Strength Comparison

### Option A
**Fail-closed mechanism:** `ctx.verifiedInternalAccess ?? false` (defensive pattern)
- ✓ Routes can default to false if field missing
- ⚠ Relies on developer implementing defensive pattern correctly
- ⚠ No compiler enforcement
- **Strength:** MEDIUM

### Option B
**Fail-closed mechanism:** `ctx.policy?.context?.verifiedInternalAccess ?? false`
- ✓ More explicit separation (canonical vs raw)
- ✓ Nesting makes it clear which fields are computed
- ⚠ Deeper nesting = more places for bugs
- ⚠ Still relies on defensive pattern
- **Strength:** MEDIUM-HIGH

### Option D
**Fail-closed mechanism:** Wrapper enforces before handler executes
```typescript
if (options?.requireInternalAccess) {
  const internalAccess = ctx.policy ? hasInternalAccess(ctx.policy) : false;
  if (!internalAccess) {
    return new NextResponse({ error: "..." }, { status: 403 });
  }
}
```
- ✓ Policy check happens in wrapper, before handler
- ✓ Handler never runs if policy fails
- ✓ No defensive pattern needed in handler
- ✓ Fail-closed by design (402 before execution)
- **Strength:** VERY HIGH

**Winner: Option D (fail-closed enforced by wrapper)**

---

## Resistance to Policy Fabrication

### Option A
**Resistance:** Design intent + code review
- ✓ Routes shouldn't modify ctx
- ⚠ But CanonicalAuthContext is mutable object
- ⚠ No Object.freeze()
- ⚠ Future service-layer code could add fake policy
- **Resistance:** LOW (intent-based, not enforced)

### Option B
**Resistance:** Same as Option A
- ✓ Nested structure makes fabrication slightly more obvious
- ⚠ Still mutable object
- ⚠ Still relies on intent + review
- **Resistance:** LOW (intent-based, not enforced)

### Option D
**Resistance:** Type system
- ✓ Services never see `ctx.policy` field (it doesn't exist in their context)
- ✓ Policy checks happen in wrapper, not passed to services
- ✓ No fabrication possible because policy isn't in service layer
- **Resistance:** VERY HIGH (type system enforced)

**Winner: Option D (type system prevents fabrication)**

---

## Service-Boundary Safety

### Option A
**Boundary:** Design document says "services MUST NOT access ctx.policy"
- ✓ Specified in design
- ⚠ Not enforced by types
- ⚠ Not enforced by compiler
- ⚠ Requires code review to catch violations
- ⚠ X9C-3 refactoring to fix (many months away)
- **Boundary Safety:** LOW

### Option B
**Boundary:** Same as Option A
- ✓ Slightly more explicit with nesting
- ⚠ Still not enforced by types
- ⚠ Still requires code review
- **Boundary Safety:** LOW

### Option D
**Boundary:** Type system enforces
```typescript
// Route handler
export const GET = withCanonicalPolicyEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // ctx has policy field? NO - only in wrapper
  },
  { requireInternalAccess: true }
);

// Service function
async function getEngagementById(id, workspaceId, ctx) {
  // ctx doesn't have policy field
  // Service cannot access policy (compile error if tried)
}
```
- ✓ Policy field doesn't exist in handler's context
- ✓ Service receives different context type (no policy)
- ✓ Compiler enforces boundary
- **Boundary Safety:** VERY HIGH

**Winner: Option D (type system enforces boundary)**

---

## Scanner Clarity

### Option A
**Scanner Recognition:**
- Sees `ctx.policy` access in routes
- Sees `ctx.verifiedInternalAccess` access in routes
- Cannot distinguish safe vs unsafe access (both look same to scanner)
- Cannot distinguish route-level vs service-level (same field name)
- **Scanner Clarity:** LOW

### Option B
**Scanner Recognition:**
- Sees `ctx.policy.context` access
- Sees `ctx.policy.raw` access
- More explicit what's canonical vs raw
- Still can't distinguish route vs service safely
- More complex patterns = harder to scan
- **Scanner Clarity:** MEDIUM

### Option D
**Scanner Recognition:**
- Routes see different wrapper: `withCanonicalPolicyEnforcement`
- Services never see policy field
- Scanner can flag incorrect wrapper usage
- Scanner can flag policy in service layers (doesn't exist, so clear violation)
- **Scanner Clarity:** VERY HIGH

**Winner: Option D (clear separation of concern)**

---

## Migration Complexity

### Option A
**Implementation:**
1. Add `verifiedInternalAccess?: boolean` to interface
2. Update wrapper to compute field
3. No route changes needed (defensive pattern still works)
4. Services updated in X9C-3 (many phases later)

**Complexity:** LOW (few changes in X9C-1, refactoring deferred)
**Risk:** MEDIUM (long period where policy is accessible to services)
**Timeline:** Fast implementation, long tail (X9C-3)

### Option B
**Implementation:**
1. Create CanonicalPolicyContext interface
2. Restructure CanonicalAuthContext.policy object
3. Update wrapper to populate new structure
4. Update all routes: `ctx.policy.context.verifiedInternalAccess` instead of `ctx.policy ? hasInternalAccess : false`
5. Services still need updating in X9C-3

**Complexity:** MEDIUM (more restructuring, route updates needed)
**Risk:** MEDIUM (breaking changes, more refactoring)
**Timeline:** More work upfront, still needs X9C-3

### Option D
**Implementation:**
1. Create `withCanonicalPolicyEnforcement` wrapper
2. Update routes to use new wrapper with options
3. Policy checking moves into wrapper (before handler)
4. Services never receive policy in context

**Complexity:** MEDIUM (new wrapper, new options, route updates)
**Risk:** LOW (cleaner boundaries from start, no deferred refactoring)
**Timeline:** More work upfront, but cleaner going forward

**Winner: Option A (simplest immediate implementation)**
**Caveat:** But adds debt that X9C-3 must pay later

---

## Compatibility with Current withCanonicalEnforcement

### Option A
**Compatibility:** ✓ EXCELLENT
- Just adds fields to existing interface
- Existing code continues working
- Non-breaking change
- Can be adopted incrementally

### Option B
**Compatibility:** ⚠ PARTIAL
- Restructures existing `ctx.policy` object
- Routes need updates: `ctx.policy.context.field` instead of `ctx.policy.field`
- Breaking change to existing routes
- Requires updating migrated GET handlers

### Option D
**Compatibility:** ⚠ PARTIAL
- New wrapper for policy-aware routes
- Existing non-policy routes unchanged
- But policy-sensitive routes need new wrapper
- Not a drop-in replacement

**Winner: Option A (backward compatible)**

---

## Compatibility with Background/System Contexts

### Option A
**System Actors:**
- withEnforcementFull still used for webhooks
- No policy context for webhooks (they don't need it)
- But if service is called from webhook with `verifiedInternalAccess = false`, works fine
- **Compatibility:** GOOD

### Option B
**System Actors:**
- Same as Option A (policy context still optional for webhooks)
- Nested structure might be awkward for missing-policy case
- **Compatibility:** GOOD

### Option D
**System Actors:**
- withCanonicalPolicyEnforcement only for policy-aware routes
- Webhooks use withEnforcementFull (unchanged)
- System actors never call withCanonicalPolicyEnforcement
- **Compatibility:** EXCELLENT

**Winner: Option D (clean separation of concerns)**

---

## Preserving Internal-Access Semantics

### Option A
**Internal Access:**
- `verifiedInternalAccess` boolean computed in wrapper
- Routes use: `ctx.verifiedInternalAccess ?? false`
- Services use: boolean parameter
- **Semantics:** PRESERVED (but depends on discipline)

### Option B
**Internal Access:**
- `verifiedInternalAccess` in nested context
- Routes use: `ctx.policy?.context?.verifiedInternalAccess ?? false`
- More explicit what's canonical
- **Semantics:** PRESERVED (more explicitly)

### Option D
**Internal Access:**
- Policy checking in wrapper: `if (options?.requireInternalAccess)`
- Handler only runs if internal access confirmed
- Services don't see the check at all
- **Semantics:** BEST PRESERVED (enforced in wrapper)

**Winner: Option D (semantics enforced, not advisory)**

---

## Separating Policy Routes from Ordinary Routes

### Option A
**Separation:**
- All routes use same wrapper: `withCanonicalEnforcement`
- Policy routes use ctx.policy optionally
- No clear distinction at import/usage level
- **Separation:** LOW (mixing concerns)

### Option B
**Separation:**
- Still same wrapper
- Nesting makes it clearer but routes still mixed
- **Separation:** MEDIUM

### Option D
**Separation:**
- Policy routes: `withCanonicalPolicyEnforcement(handler, {requireInternalAccess})`
- Ordinary routes: `withCanonicalEnforcement(handler)`
- Clear distinction at the call site
- **Separation:** VERY HIGH (explicit wrapper choice)

**Winner: Option D (clear intention at wrapper level)**

---

## Comparison Matrix Summary

| Factor | Option A | Option B | Option D |
|--------|----------|----------|----------|
| **Fail-Closed Strength** | MEDIUM | MEDIUM-HIGH | VERY HIGH |
| **Fabrication Resistance** | LOW | LOW | VERY HIGH |
| **Service-Boundary Safety** | LOW | LOW | VERY HIGH |
| **Scanner Clarity** | LOW | MEDIUM | VERY HIGH |
| **Migration Complexity** | LOW | MEDIUM | MEDIUM |
| **Current Compatibility** | EXCELLENT | PARTIAL | PARTIAL |
| **System Context Fit** | GOOD | GOOD | EXCELLENT |
| **Internal-Access Preservation** | PRESERVED | PRESERVED | BEST |
| **Route Separation** | LOW | MEDIUM | VERY HIGH |
| **Implementation Risk** | LOW | MEDIUM | MEDIUM |

---

## Trade-off Analysis

### Option A: Simplest, But Riskiest Long-Term
- ✓ Fast to implement (X9C-1 just adds fields)
- ✓ No breaking changes
- ✓ Backward compatible
- ✗ Low type-system enforcement (relies on discipline)
- ✗ Service-boundary violations won't be caught until X9C-3
- ✗ Scanner can't distinguish safe vs unsafe access
- ✗ Mixing concerns (policy + identity in same context)

**Best for:** Fastest path if team discipline is very high

### Option B: Middle Ground
- ✓ More explicit with nesting
- ✓ Clearer canonical vs raw distinction
- ⚠ Still not type-enforced
- ⚠ Requires more route updates than A
- ⚠ Still has mixing concerns

**Best for:** If you want clearer semantics but can't do full Option D

### Option D: Safest, But More Upfront Work
- ✓ Type-system enforced boundaries (compiler prevents misuse)
- ✓ Fail-closed by design (wrapper enforces policy checks)
- ✓ Clear route separation (different wrapper = clear intention)
- ✓ Scanner can easily distinguish (different wrapper = clear signal)
- ✓ No mixing of concerns (policy wrapper separate from identity wrapper)
- ✗ More implementation work upfront (new wrapper, route updates)
- ✗ Not 100% backward compatible (policy routes need new wrapper)

**Best for:** If you want maximum safety and can afford initial complexity

---

## Risk-Adjusted Recommendation

**If code review discipline is EXCELLENT:** Option A
- Fast implementation
- Good enough with careful reviews

**If code review discipline is GOOD:** Option B
- Slightly better semantics
- Still needs careful review

**If code review discipline is NORMAL:** Option D
- Type system prevents mistakes
- Compiler enforces boundaries
- Worth the extra upfront work

---

**Status:** ✓ Comparative Analysis Complete
