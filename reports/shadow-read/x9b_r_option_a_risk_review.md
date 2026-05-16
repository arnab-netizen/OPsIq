# X9B-R: Option A Hostile Security Review

**Phase:** X9B-R (Policy Design Safety Review)  
**Date:** 2026-05-15  
**Status:** FAILURE MODE ANALYSIS

---

## Overview

Systematic evaluation of Option A against 10 failure modes that could weaken auth.

Each failure mode is assessed as:
- **SAFE:** No exploit path identified
- **MITIGATED:** Risk exists but design includes specific mitigations
- **UNSAFE:** Exploit path exists with potential impact
- **UNKNOWN:** Unclear whether mitigation is sufficient

---

## Failure Mode 1: Policy Fabrication by Route

**Threat:** Route handler constructs fake policy and injects into context

**Attack Scenario:**
```typescript
// MALICIOUS ROUTE
export const GET = withCanonicalEnforcement(async (ctx) => {
  ctx.policy = {
    userId: ctx.verifiedActorId,
    roles: [{ role: "internal_admin" }]  // FAKE ROLE
  };
  
  // Now calls service with fabricated admin policy
  const result = await getEngagementById(id, ctx.verifiedWorkspaceId, ctx);
  return result;
});
```

**Design Assessment:**

Weak Point 1: ctx is mutable
- CanonicalAuthContext is passed as object, could be modified
- No Object.freeze() mentioned in X9B design
- Route code could mutate policy field

Weak Point 2: Services might accept ctx directly
- X9B says "Services should NOT access ctx.policy"
- But implementation can't prevent it if service function signature is `(ctx: CanonicalAuthContext)`
- TypeScript enforcement requires separate types (Option C)

Weak Point 3: policy field is optional
- Routes could add policy field that didn't exist before
- Services checking `if (ctx.policy)` would see fabricated policy

**Mitigation Analysis:**
- ✓ Routes go through wrapper (creates policy)
- ✓ Routes should not modify context (design intent)
- ✓ Services should use `verifiedInternalAccess` boolean not `ctx.policy` (design intent)
- ⚠ But design intent is NOT enforced by type system
- ⚠ JavaScript runtime allows mutation
- ⚠ Future developer might miss the "MUST NOT" rules

**Verdict:** ⚠️ **MITIGATED** (not SAFE)
- Mitigation: Design document rules + code review
- Risk: Design rules can be violated by malicious or careless code
- Residual Risk: MEDIUM (relies on discipline, not enforcement)

**Recommendation:** Add Object.freeze(ctx) in wrapper, or use Option C/D

---

## Failure Mode 2: Stale Policy Accepted as Valid

**Threat:** Wrapper computes policy once, policy becomes stale during request, service uses stale data

**Attack Scenario:**
```typescript
// REQUEST PROCESSING
1. Wrapper fetches policy (fresh)
2. Handler executes (uses policy)
3. Policy changes in database (role revoked)
4. Service uses policy computed from step 1 (stale)
5. Service grants access based on revoked role
```

**Design Assessment:**

Weak Point 1: X9B says "Wrapper refetches policy per request (no caching)"
- But actual wrapper code not shown
- Current wrapper (canonical-route-enforcement.ts) might cache
- No explicit "refetch on every call" guarantee

Weak Point 2: verifiedInternalAccess is computed once
- If role is revoked after wrapper checks but before service executes
- Service will still use cached verifiedInternalAccess = true
- No re-validation during request

Weak Point 3: CanonicalAuthContext is immutable per request
- But "per request" could mean cached for entire request lifecycle
- What if policy changes mid-request in background service?

**Mitigation Analysis:**
- ✓ Design says "Wrapper fetches fresh policy per request"
- ✓ Session snapshot is immutable point-in-time
- ✓ Services use computed boolean, not live policy
- ⚠ But "per request" is not "per operation"
- ⚠ No explicit freshness timestamp
- ⚠ No mechanism to invalidate during request

**Verdict:** ⚠️ **MITIGATED** (not SAFE)
- Mitigation: Wrapper fetches fresh per request
- Risk: Within single request, policy could change
- Residual Risk: LOW (within-request changes are rare, but possible)

**Recommendation:** Add policy freshness timestamp to CanonicalAuthContext, document SLA for staleness

---

## Failure Mode 3: Service Treating Route-Only Policy as Service-Safe

**Threat:** Service receives CanonicalAuthContext, accesses ctx.policy, makes authorization decisions

**Attack Scenario:**
```typescript
// SERVICE FUNCTION
async function updateEngagement(input, ctx) {
  // Service receives full CanonicalAuthContext
  const policy = ctx.policy;
  
  // Service checks role directly (WRONG - should use wrapper)
  if (policy?.roles?.some(r => r.role === "admin")) {
    // Allow special operation
    await db.engagement.update(...);
  }
  // OR
  
  // Service calls hasInternalAccess (WRONG - should use verifiedInternalAccess)
  const isInternal = ctx.policy ? hasInternalAccess(ctx.policy) : false;
  // ... make different decisions based on isInternal
}
```

**Design Assessment:**

Weak Point 1: X9B says "Services should not access ctx.policy"
- But nothing prevents it at runtime
- No type system enforcement (TypeScript allows `ctx.policy` access)
- Future developer might not read design docs

Weak Point 2: X9B says "Services should use verifiedInternalAccess"
- But what if service is called without verifiedInternalAccess parameter?
- Service falls back to checking ctx.policy
- Design says "must not" but can't prevent

Weak Point 3: Wrapper computes policy, service re-uses policy
- Seems fine, but...
- What if wrapper policy was computed for different context?
- Service applies policy from different scenario

**Mitigation Analysis:**
- ✓ Design specifies "Services MUST NOT access ctx.policy"
- ✓ Design specifies "Services SHOULD receive boolean parameters"
- ⚠ But X9C implementation phase allows service to accept CanonicalAuthContext
- ⚠ No type-system enforcement of boundary
- ⚠ Relies entirely on code review and documentation

**Verdict:** ⚠️ **MITIGATED** (not SAFE)
- Mitigation: Design document + future X9C-3 refactoring (pass boolean, not ctx)
- Risk: During X9C-1 and X9C-2, services CAN access policy
- Residual Risk: MEDIUM (boundary is not enforced)

**Recommendation:** Implement X9C-3 immediately after X9C-1, enforce boundary via types

---

## Failure Mode 4: Internal Access Accidentally Exposed Broadly

**Threat:** verifiedInternalAccess computed incorrectly or exposed to unauthorized routes

**Attack Scenario:**
```typescript
// SCENARIO 1: Wrong Computation
export const GET = withCanonicalEnforcement(async (ctx) => {
  // Designer meant: only internal users can see internal records
  // But code does:
  const showInternal = ctx.verifiedInternalAccess ?? true;  // WRONG DEFAULT
  // Now client users see internal records
});

// SCENARIO 2: Wrong Propagation
const result = await getEngagementById(id, workspaceId, true); // HARDCODED
// Service treats as internal access for all users
```

**Design Assessment:**

Weak Point 1: verifiedInternalAccess is optional (?)
- X9B says `verifiedInternalAccess?: boolean` (optional)
- If optional and undefined, code does defensive pattern: `?? false`
- But developer might forget `?? false` and use `||` which makes undefined → true

Weak Point 2: Computation logic is simple but could be wrong
- `hasInternalAccess(policy) = policy.roles.some(r => !isClientRole(r))`
- If role categorization is wrong, computation is wrong
- What if new role is added and not categorized?

Weak Point 3: Default behavior is unspecified
- X9B says default to false, but code might default to true
- No enforcement of default

**Mitigation Analysis:**
- ✓ Design specifies fail-closed (default false)
- ✓ Computation logic is explicit
- ✓ First pilots have strong test coverage (visibility filtering tests)
- ⚠ But no runtime assertion that default is false
- ⚠ No type enforcement of boolean (could be undefined and treated as truthy)

**Verdict:** ✓ **SAFE**
- Mitigation: Explicit computation, defensive patterns, test coverage
- Design specifies fail-closed defaults
- First pilots have strong coverage
- Residual Risk: LOW (test suites cover visibility filtering)

**Recommendation:** Add unit tests for verifiedInternalAccess computation, assert default is false

---

## Failure Mode 5: Role / Tier Confused with Capability

**Threat:** Code treats policy.roles as verifiedCapabilities or vice versa

**Attack Scenario:**
```typescript
// CONFUSED CODE
if (ctx.verifiedCapabilities.has("admin")) {
  // Developer meant: has CAPABILITY for admin action
  // But admin is a ROLE, not capability
}

// OR REVERSE
const adminRole = Array.from(ctx.policy?.roles ?? []).some(r => r.role === "action:create");
// Developer checked for CAPABILITY in role list (wrong type)
```

**Design Assessment:**

Weak Point 1: Two different authorization models are mixed
- Capabilities: Fine-grained, immutable, computed once
- Roles: Hierarchical, scope-sensitive, part of policy
- Both are boolean checks, easy to confuse

Weak Point 2: No type distinction
- `verifiedCapabilities: Set<string>` - strings could be anything
- `policy.roles: Array<{role: RoleName}>` - could be confused
- Both use string/enum matching

Weak Point 3: Documentation uses both terms
- Routes need both: capabilities AND roles
- Services might need both: capabilities AND internal access
- Easy to mix up which is which

**Mitigation Analysis:**
- ✓ Design clearly separates: capabilities in wrapper, roles in policy
- ✓ Type system distinguishes: Set<string> vs Array<{role}>
- ✓ First pilots don't use roles (GET handlers only need visibility)
- ✓ X9C-3 refactoring will separate services from policy
- ⚠ But no runtime assertion that they're different
- ⚠ Future code might mix them

**Verdict:** ✓ **SAFE**
- Mitigation: Clear design distinction, type system, test coverage
- First pilots don't use roles
- X9C-3 removes policy from service layer
- Residual Risk: LOW (phased rollout reduces confusion risk)

**Recommendation:** Add linting rule to prevent accessing policy.roles in capability checks

---

## Failure Mode 6: Workspace Membership Inferred Instead of Verified

**Threat:** Code assumes workspace membership without verifying, or infers it from policy

**Attack Scenario:**
```typescript
// SCENARIO 1: Wrapper assumes membership
export const withCanonicalEnforcement = async (handler) => {
  // Design says "workspace membership validated in wrapper"
  // But wrapper code is missing the validation check
  return handler(ctx);  // Called without membership verification
};

// SCENARIO 2: Service infers membership from policy
async function getEngagementById(id, workspaceId, ctx) {
  // Service assumes: if ctx.policy.userId matches, must be member
  // But user could be member of different workspace
  if (ctx.policy.userId) {
    // WRONG: assumes membership
    return db.engagement.findFirst({where: {id, workspaceId}});
  }
}
```

**Design Assessment:**

Weak Point 1: X9B says wrapper "must validate" but design doesn't show code
- Membership validation logic not specified
- Unclear what "validate" means: query database? check policy?
- Could be missing or incomplete

Weak Point 2: policy doesn't include workspace membership
- PolicyContext = {userId, roles, engagementMemberships}
- Missing: workspaceMemberships
- Service can't validate membership without database query

Weak Point 3: verifiedWorkspaceId in context, but no "verifiedMembership" boolean
- Handler gets workspaceId and policy
- No explicit "user is member of verifiedWorkspaceId" flag
- Service might need to re-check or assume

**Mitigation Analysis:**
- ✓ Design says wrapper validates before handler executes
- ✓ First pilots are GET handlers (don't modify, low-risk)
- ✓ If wrapper validation fails, handler never runs
- ⚠ But wrapper implementation not shown in design
- ⚠ Membership validation logic not specified
- ⚠ Could be missing from wrapper code in X9C-1

**Verdict:** ⚠️ **MITIGATED** (not SAFE)
- Mitigation: Wrapper must validate, design says so
- Risk: Wrapper implementation could be incomplete
- Residual Risk: MEDIUM (depends on X9C-1 code review)

**Recommendation:** X9C-1 MUST include workspace membership validation in wrapper, with tests

---

## Failure Mode 7: Background / System Actor Policy Ambiguity

**Threat:** Webhooks or background jobs have missing/fabricated policy, causing unexpected auth failures

**Attack Scenario:**
```typescript
// WEBHOOK HANDLER
export const POST = withEnforcementFull(async (request) => {
  // Webhook is system actor, no user context
  // But withEnforcementFull tries to fetch policy?
  // What policy is used?
  // If missing: verifiedInternalAccess = false (fine)
  // If fabricated: verifiedInternalAccess = true (dangerous)
  
  await handleWebhookEvent(request);
});
```

**Design Assessment:**

Weak Point 1: X9B focuses on user routes, not system actors
- withCanonicalEnforcement is for user requests
- Webhooks use withEnforcementFull (different wrapper)
- Unclear how verifiedInternalAccess is handled for system actors

Weak Point 2: System actor has no user identity
- No userId to validate policy for
- No role to compute internal access from
- Should verifiedInternalAccess default to false? true?

Weak Point 3: Background jobs and events not covered
- X9B focuses on route handlers
- Future service-layer jobs might use CanonicalAuthContext
- How are they constructed?

**Mitigation Analysis:**
- ✓ Design separates routes (withCanonicalEnforcement) from webhooks (withEnforcementFull)
- ✓ Webhooks don't use policy context (they can't)
- ✓ First pilots are user routes only (no system actors)
- ⚠ But future phases might call services with system context
- ⚠ No specification for how system actors get CanonicalAuthContext

**Verdict:** ⚠️ **MITIGATED** (not SAFE, needs clarification)
- Mitigation: System actors excluded from this phase
- Risk: Future phases might introduce system actor context incorrectly
- Residual Risk: MEDIUM (future work could go wrong)

**Recommendation:** X9B-R must specify how system actors construct CanonicalAuthContext (if at all)

---

## Failure Mode 8: Cross-Workspace Override Leakage

**Threat:** User's policy from one workspace is used for operation in different workspace

**Attack Scenario:**
```typescript
// USER IN WORKSPACE A
GET /api/workspaces/A/engagements
// Wrapper fetches policy for workspace A

// THEN ATTACKER REQUESTS
POST /api/workspaces/B/engagements
// Header: x-workspace-id: B
// But uses cached policy from workspace A
// Policy has admin role in A, service grants access in B
```

**Design Assessment:**

Weak Point 1: Policy is fetched once per request
- X9B says "per request"
- But if multiple workspace IDs in same request flow, which policy?
- Sequential calls to different workspaces in same request?

Weak Point 2: verifiedWorkspaceId is from request header
- Header could be forged/changed mid-request
- Policy might not match workspaceId

Weak Point 3: No policy-workspace binding
- Policy doesn't include which workspace(s) it applies to
- Service assuming policy applies to verifiedWorkspaceId?

**Mitigation Analysis:**
- ✓ Design says wrapper validates workspace membership
- ✓ If policy doesn't include membership in verifiedWorkspaceId, handler shouldn't execute
- ✓ Wrapper computes policy fresh per request
- ✓ First pilots are single-route handlers (one workspace ID per request)
- ⚠ But cross-workspace binding not explicit in design

**Verdict:** ✓ **SAFE**
- Mitigation: Wrapper validates membership per workspace
- Wrapper computes fresh policy per request
- Single request = single workspace context
- Residual Risk: LOW

**Recommendation:** Add comment in wrapper: "Validate policy includes verifiedWorkspaceId membership"

---

## Failure Mode 9: Scanner Accepting Unsafe Policy Contexts

**Threat:** Shadow read scanner doesn't detect when services access ctx.policy unsafely

**Attack Scenario:**
```typescript
// SERVICE ACCESSING POLICY (WRONG)
async function updateEngagement(id, ctx) {
  const policy = ctx.policy;  // Shadow read scanner doesn't see violation
  if (policy?.roles?.some(r => r.role === "admin")) {
    // Do something special for admins
  }
}

// Scanner might not flag this because:
// - It's not an auth-guard import
// - It's just field access
// - Pattern might not be recognized
```

**Design Assessment:**

Weak Point 1: Scanner looks for imports, not field access
- Shadow read scanner detects `import { ... } from "@/lib/auth-guard"`
- Doesn't detect `ctx.policy` field access
- Safe pattern (routes access policy) and unsafe pattern (services) look same

Weak Point 2: Design recognition rule is weak
- X9B says scanner should accept `ctx.policy` in routes
- But how does scanner know it's a route, not service?
- No file path distinction mentioned

Weak Point 3: No type-based violation detection
- Scanner could use TypeScript to check service function types
- But would need to enforce strict types (Option C does this)
- Option A doesn't have type enforcement

**Mitigation Analysis:**
- ✓ X9C-3 phase will remove policy field from service layer
- ✓ Test coverage on routes will catch policy misuse
- ✓ Code review will find unsafe service-level policy access
- ⚠ But no automated detection between X9C-1 and X9C-3
- ⚠ Scanner won't flag service-level policy access

**Verdict:** ⚠️ **MITIGATED** (not SAFE)
- Mitigation: Code review + tests + X9C-3 refactoring
- Risk: Services could access policy unsafely during X9C-1/X9C-2
- Residual Risk: MEDIUM (requires vigilant code review)

**Recommendation:** Add ESLint rule to prevent `ctx.policy` access outside allowed files

---

## Failure Mode 10: Future Services Depending on Optional Policy Incorrectly

**Threat:** New service code assumes policy exists and doesn't handle missing case

**Attack Scenario:**
```typescript
// NEW SERVICE WRITTEN IN FUTURE
async function createRecommendation(input, ctx) {
  // Developer accesses policy without checking
  const role = ctx.policy.roles[0].role;  // Crashes if policy is undefined
  
  // OR: Makes wrong assumption
  const isAdmin = ctx.policy?.roles?.some(r => r.role === "admin");
  // If policy is missing, isAdmin = undefined (truthy? falsy?)
  // Might grant access unintentionally
}
```

**Design Assessment:**

Weak Point 1: policy is optional (?)
- X9B specifies `policy?: PolicyContext`
- Optional fields invite bugs: what if undefined?
- Code might not check before access

Weak Point 2: No documentation of optional semantics
- When is policy present? When missing?
- What should code do if policy is undefined?
- Design doesn't say "policy always present" or "always missing"

Weak Point 3: Future developers won't have context
- Design documents are in reports/
- Future developer might not read design
- Might assume policy is always available

**Mitigation Analysis:**
- ✓ Design clearly marks `policy?` as optional
- ✓ Design shows defensive pattern: `ctx.policy ? ... : false`
- ✓ First pilots demonstrate safe pattern
- ✓ Code review will enforce patterns
- ⚠ But no type-system enforcement
- ⚠ Future developers might miss the documentation

**Verdict:** ⚠️ **MITIGATED** (not SAFE)
- Mitigation: Design documentation, code review, test coverage
- Risk: Future code could misuse optional field
- Residual Risk: MEDIUM (discipline-based, not enforced)

**Recommendation:** Add TypeScript strict null checks to enforce `policy?` handling

---

## Failure Mode Summary Table

| Failure Mode | Verdict | Risk Level | Mitigation |
|--------------|---------|-----------|-----------|
| 1. Policy Fabrication | MITIGATED | MEDIUM | Design intent, code review, X9C-3 |
| 2. Stale Policy | MITIGATED | LOW | Per-request fetch, immutable snapshot |
| 3. Service Policy Misuse | MITIGATED | MEDIUM | Design rules, X9C-3 refactoring |
| 4. Internal Access Exposure | SAFE | LOW | Fail-closed defaults, test coverage |
| 5. Role/Capability Confusion | SAFE | LOW | Type system, test coverage |
| 6. Workspace Inference | MITIGATED | MEDIUM | Wrapper validation required in X9C-1 |
| 7. System Actor Ambiguity | MITIGATED | MEDIUM | Clarify system actor context in design |
| 8. Cross-Workspace Leakage | SAFE | LOW | Per-request fetch, membership validation |
| 9. Scanner Blind Spots | MITIGATED | MEDIUM | ESLint rule, code review, X9C-3 |
| 10. Future Service Bugs | MITIGATED | MEDIUM | Optional field handling, strict null checks |

---

## Overall Risk Assessment

**UNSAFE Modes:** 0 (None identified as truly unsafe)
**MITIGATED Modes:** 7 (Risks exist but have mitigations)
**SAFE Modes:** 3 (Well-protected)

**Mitigation Quality:**
- ✓ Design intent is clear and documented
- ⚠ But relies heavily on discipline, not type enforcement
- ⚠ X9C-3 refactoring is critical (not optional)
- ⚠ Code review and testing must be strict

**Verdict: OPTION A IS MITIGATED BUT NOT BULLETPROOF**

---

## Recommendation

Option A can proceed **WITH CONDITIONS**:

1. **REQUIRED:** X9C-3 refactoring (remove policy from service layer) must happen immediately after X9C-1
2. **REQUIRED:** Add Object.freeze(ctx) to wrapper to prevent context mutation
3. **REQUIRED:** Workspace membership validation code must be audited in X9C-1
4. **RECOMMENDED:** Add ESLint rules to prevent `ctx.policy` access outside routes
5. **RECOMMENDED:** Add TypeScript strict null checks for optional fields
6. **RECOMMENDED:** Enforce code review with security focus for all X9C phases

**If these conditions cannot be met, use Option B or D instead.**

---

**Status:** ✓ Hostile Review Complete
