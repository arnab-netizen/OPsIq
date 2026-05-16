# R1-SERVICE-0: Implementation Plan

**Date:** 2026-05-16  
**Phase:** R1-SERVICE-0 Service Boundary Contract Audit - Planning Only  
**Status:** PLANNING PHASE - NO IMPLEMENTATION YET

---

## A. Service Contract Audit Completion Status

**Planning Phase Tasks:**
✓ A. Baseline confirmation (COMPLETE)
✓ B. Service auth contract inventory (COMPLETE)
✓ C. Route to service coupling map (COMPLETE)
✓ D. Contract design options evaluation (COMPLETE)
✓ E. Select service contract strategy (COMPLETE: VerifiedServiceContext)
✓ F. Pilot selection (COMPLETE: findings/[findingId] PATCH + updateFinding)
✓ G. Implementation plan (THIS DOCUMENT)
✓ H. Readiness impact update (NEXT)

**All R1-SERVICE-0 Planning Complete**

---

## B. Authorization Decision

### AUTHORIZATION FOR PILOT IMPLEMENTATION: DEFERRED

**Status:** Planning phase complete. Pilot implementation NOT YET AUTHORIZED.

**Reason:** R1-SERVICE-0 is a planning/audit phase. Implementation is deferred to next phase: R1-SERVICE-0-PILOT (or R1-D2-B equivalent naming).

**When Pilot Will Be Authorized:**
After user approves R1-SERVICE-0 audit results and explicitly authorizes implementation phase.

---

## C. Planned Implementation Phases

If pilot implementation is authorized in follow-up:

### Phase 1: R1-SERVICE-0-PILOT (Pilot Implementation)
**Scope:** 1 route handler (findings/[findingId] PATCH)  
**Service Changes:** 0  
**Violations Fixed:** 4  
**Duration:** 1-2 hours  

**Allowed Files:**
- src/app/api/findings/[findingId]/route.ts (PATCH handler only)

**Forbidden Files:**
- src/services/findings.ts (NO service changes in pilot)
- All other service files
- Wrapper files
- Auth middleware
- Database files

**Success Criteria:**
- npm run build passes
- npm test passes (402/402)
- Scanner shows 348 violations (-4)
- All route tests pass
- No regressions

### Phase 2: R1-SERVICE-0-A (Post-Pilot Learning)
**Task:** Analyze pilot success/failure, decide next pilots

**Options:**
1. If pilot succeeds: Begin Phase 3 (Phase 2 pilots)
2. If pilot fails: Revert and audit why

### Phase 3: R1-SERVICE-0-B/C/D (Phased Route Modernization)
**Scope:** Remaining 39 routes with service coupling  
**Batch Sizing:** 4-5 routes per phase  
**Service Changes:** Phase-by-phase (VerifiedServiceContext definitions)  
**Violations Fixed:** ~140 total across phases  

---

## D. Detailed Implementation Rules (For Future Execution)

### DO:
✓ Modernize route handlers from withEnforcementFull to withCanonicalEnforcement
✓ Update handler signature: (request, context, params) → (ctx: CanonicalAuthContext, params)
✓ Declare requireCapabilities in wrapper options
✓ Declare requireWorkspace in wrapper options
✓ Create VerifiedServiceContext (or ServiceAuthEnvelope) adapter
✓ Use ctx.verifiedActorId and ctx.verifiedWorkspaceId
✓ Pass verified context to services
✓ Remove await withAuth() calls
✓ Remove enforceWorkspaceScoping() calls
✓ Remove canonicalizeAuthContext() calls (handled by adapter)
✓ Test with npm test before committing
✓ Verify scanner output

### DO NOT:
✗ Modify service files (services accept original types during pilot)
✗ Create new services
✗ Change service function signatures (not in pilot scope)
✗ Modify wrapper implementations
✗ Remove or change auth-guard imports (just stop using them)
✗ Add any new capabilities
✗ Modify database schemas
✗ Add feature flags or toggles
✗ Skip capability checks
✗ Skip workspace checks
✗ Try to modernize all 40 routes at once (pilot only)
✗ Change response shapes
✗ Modify business logic

---

## E. Stop Conditions

**Stop and Revert If:**
1. TypeScript compilation fails
2. Any test fails (402/402 becomes < 402)
3. Scanner total increases (352 becomes > 348)
4. Route handler broken (returns error instead of data)
5. Capability checks not working (401/403 not returned when expected)
6. Workspace isolation broken (can access other workspace)

**Severity:**
- Any stop condition = FULL ROLLBACK
- No partial implementations
- Revert entire pilot if any stop condition hit

---

## F. Validation Commands

**Before Pilot Implementation (Already Done in Planning):**
- ✓ git status --short (clean)
- ✓ git branch --show-current (main)
- ✓ npm run build (passes - DB not set, expected)
- ✓ npm test governance-capabilities (32/32)
- ✓ npx tsx src/governance/auth-shadow-read-scanner.ts (352)

**During Pilot Implementation (Will Be Run):**
- npm run build (must pass TypeScript)
- npm test (must show 402/402)
- npx tsx src/governance/auth-shadow-read-scanner.ts (must show 348)

**After Pilot Closes:**
- git log --oneline (verify commits)
- git diff main (verify only allowed files changed)

---

## G. Branching Strategy

**For Pilot (When Authorized):**
- Branch: main (if instructed to use branch, will be provided)
- Or local commits on main with explicit push approval

---

## H. Commit Structure (For Pilot)

**Single Commit or Multiple?**
- SINGLE COMMIT for pilot (all 1 route at once)
- Message: "R1-SERVICE-0-PILOT: Modernize findings/[findingId] PATCH to withCanonicalEnforcement"
- Include: scanner output update (shadow_read_violations.json)

---

## I. Testing Strategy

### Manual Testing (Before Commit)
```bash
# 1. Type check
npm run build

# 2. Unit + integration tests
npm test

# 3. Scanner baseline
npx tsx src/governance/auth-shadow-read-scanner.ts

# 4. Specific route testing (if curl available)
# GET /api/findings/[id] - verify works
# PATCH /api/findings/[id] - verify works with auth, fails without
```

### Automated Testing
- Existing test suites cover route handlers
- No new tests needed (wrapper pattern proven in R1-A/B/C/D)

---

## J. Acceptance Criteria (For Pilot)

**All Must Pass:**
✓ TypeScript compiles (0 errors)
✓ npm test shows 402/402 PASS
✓ Scanner shows 348 violations (was 352, -4)
✓ GET findings/[id] handler works
✓ PATCH findings/[id] handler works
✓ Capability checks enforced (401 when missing auth, 403 when missing capability)
✓ Workspace checks enforced (403 when different workspace)
✓ No other routes affected (no regressions)
✓ Handler returns correct response shape
✓ No new errors in logs

---

## K. Service Contract Integration (For Pilot)

**VerifiedServiceContext Definition:**
```typescript
// In src/lib/canonical-route-enforcement.ts (if needed for pilot)
export interface VerifiedServiceContext {
  readonly verifiedActorId: string;
  readonly verifiedWorkspaceId: string;
  readonly verifiedCapabilities: ReadonlySet<string>;
}
```

**For Pilot:** Can skip VerifiedServiceContext definition and just use ServiceAuthEnvelope (temporary adapter)

**For Future Phases:** Will define VerifiedServiceContext and refactor services to accept it

---

## L. Known Issues / Edge Cases

### Known Safe:
- withCanonicalEnforcement wrapper pattern (proven in 18+ routes, R1-A/B/C/D)
- Handler signature change (known compatible)
- Capability check declaration (works as proven)
- Workspace requirement (works as proven)

### Potential Edge Cases:
- If service.ts has complex internal state (unlikely, findings is simple)
- If tests mocking request headers break (unlikely, test framework updated)
- If IdempotencyKey handling different (not in scope for pilot)

---

## M. Next Phase Decision Points

**After Pilot Completes:**

**IF PILOT SUCCEEDS:**
→ Next: R1-SERVICE-0-A (post-pilot analysis)
→ Decision: Begin Phase 3 (more route pilots)
→ Expected: Continued similar successes

**IF PILOT FAILS:**
→ Next: Root cause analysis
→ Decision: Service design re-audit or wrapper pattern issue
→ Expected: Low probability (pattern proven in 18+ routes)

---

## N. Expected Outcome

**After R1-SERVICE-0-PILOT Implementation (If Authorized):**

**Scanner Result:** 348 violations (-4 from pilot)
**Violations Remaining:** 348 (can be broken down by deferred route type)
**Next Blocking Issues:** Service coupling still blocks ~136 more routes
**Unblocked for Future:** Clear understanding that VerifiedServiceContext will work
**Risk Assessment:** LOW for remaining routes (pilot proves pattern)

---

## O. Readiness for Next Phases

**R1-D2-B Can Proceed In Parallel:** YES
- Service boundary contract now clear
- Workspace semantics audit (R1-WORKSPACE-0) independent
- Policy wrapper audit (R1-POLICY-0) independent

**R2-0 Can Proceed In Parallel:** YES
- Deployment readiness audit not blocked

---

## Final Status

**R1-SERVICE-0 Planning Phase:** ✓ COMPLETE
**Ready for User Decision:** YES (approve pilot implementation or adjust)
**Authorization for Pilot:** DEFERRED (awaiting user approval)

---

**Next Action: User must explicitly authorize R1-SERVICE-0-PILOT implementation phase, OR request adjustments to service contract strategy.**

