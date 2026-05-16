# X5A: Next Phase Decision

**Phase:** X5A (Audit Complete)  
**Date:** 2026-05-15  
**Current Baseline:** 455 violations (stable)

---

## Audit Results

### Lane 5 Feasibility Assessment

| Question | Answer |
|----------|--------|
| How many requireAuthForCapability() usages remain? | **2 in routes** |
| How many are safe pilot candidates? | **2 (both selected)** |
| Is migration directly possible using withCanonicalEnforcement? | **YES** |
| Are any usages actually Lane 7/8/9 blockers? | **NO** |
| Should next phase be X5B requireAuthForCapability pilot migration? | **YES - RECOMMENDED** |
| If not, what blocker phase is required? | **N/A - Ready to proceed** |

---

## Key Findings

### Lane 5 Exists and is Ready

Unlike Lane 4 (which found no candidates), Lane 5 has actual usage patterns:
- **Total requireAuthForCapability() usages found:** 2
- **All in route handlers:** YES (2 routes)
- **All safe for migration:** YES (both low-risk)
- **Both follow identical pattern:** YES (POST mutations, DECISION_ACCEPT)

### Pilot Candidates Summary

| Handler | Capability | Type | Risk | Ready |
|---------|------------|------|------|-------|
| decisions/[decisionId]/accept/route.ts POST | DECISION_ACCEPT | MUTATION | LOW | ✓ YES |
| decisions/[decisionId]/reject/route.ts POST | DECISION_ACCEPT | MUTATION | LOW | ✓ YES |

---

## Pattern Analysis

### Current Pattern

Both handlers follow the same structure:
```typescript
export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    // 1. Manual workspace extraction
    const workspaceId = request.headers.get("x-workspace-id");
    
    // 2. Manual workspace enforcement
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    
    // 3. Manual capability requirement
    const auth = await requireAuthForCapability(
      CAPABILITIES.DECISION_ACCEPT,
      undefined,
      workspaceId
    );
    
    // 4. Use auth.session.user.id for mutation
    // 5. Call service with auth context
    return result;
  }
);
```

### Migration Target

```typescript
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    // 1. Implicit workspace from ctx.verifiedWorkspaceId
    // 2. Implicit workspace enforcement from wrapper
    // 3. Implicit capability enforcement from wrapper
    // 4. Use ctx.verifiedActorId for mutation
    // 5. Call service with canonical context
    return result;
  },
  { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }
);
```

### Why This Works

1. **Capability is exact and known:** DECISION_ACCEPT (no ambiguity)
2. **Workspace source is standard:** x-workspace-id header (same as Lane 3)
3. **No policy context needed:** Neither handler uses policy checks
4. **No custom auth logic:** Both use standard workspace enforcement
5. **Service calls are straightforward:** Single service call per handler
6. **Pattern validated in Lane 3:** Identical to users/route.ts POST migration

---

## Violation Reduction Estimate

**Current State:** 455 violations  
**Expected Reduction:** ~2 violations (1 per handler)  
**After X5B Completion:** ~453 violations

---

## Recommended Path Forward

### Option 1: X5B PILOT MIGRATION (STRONGLY RECOMMENDED)

**Action:** Proceed to X5B to migrate both requireAuthForCapability handlers

**Rationale:**
1. Pilot candidates exist (2 handlers found)
2. All candidates are LOW risk (no blockers, clear patterns)
3. Pattern is validated (similar to Lane 3 POST migrations)
4. Expected to succeed (high confidence)
5. Quick execution (2 handlers, straightforward)

**Scope:**
- Migrate decisions/[decisionId]/accept/route.ts POST to withCanonicalEnforcement
- Migrate decisions/[decisionId]/reject/route.ts POST to withCanonicalEnforcement
- Validate build, tests, scanner
- Expected ~2 violation reduction

**Expected Duration:** Quick (similar to X3A)  
**Expected Baseline After:** ~453 violations  
**Recommendation Strength:** STRONG

### Option 2: DEFER LANE 5 (NOT RECOMMENDED)

**Action:** Skip Lane 5 and move to other lanes

**Rationale:** Not applicable - Lane 5 candidates are safe and ready

**Recommendation Strength:** WEAK

---

## Decision Matrix

| Criterion | X5B Pilot | Defer L5 |
|-----------|-----------|----------|
| Candidates Found | 2 | 2 |
| All Safe | ✓ YES | N/A |
| Pattern Validated | ✓ YES | N/A |
| Risk Level | LOW | N/A |
| Readiness | READY | N/A |
| Blocking Issues | NONE | N/A |
| Confidence | HIGH | LOW |
| **RECOMMENDATION** | **PROCEED** | **SKIP** |

---

## FINAL RECOMMENDATION

### NEXT PHASE: X5B REQUIREAUTHFORCAPABILITY PILOT MIGRATION

**Rationale:**
1. Lane 5 audit found 2 actionable candidates (vs Lane 4: zero)
2. All candidates are safe for migration (LOW risk)
3. Pattern is well-understood (identical to Lane 3 POST migrations)
4. Expected violation reduction: ~2
5. No blockers or prerequisites
6. High confidence of success

**X5B Scope:**
- Migrate decisions/[decisionId]/accept/route.ts POST
  - Current: `withEnforcementFull + requireAuthForCapability`
  - Target: `withCanonicalEnforcement { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }`
  
- Migrate decisions/[decisionId]/reject/route.ts POST
  - Current: `withEnforcementFull + requireAuthForCapability`
  - Target: `withCanonicalEnforcement { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }`

**Expected Outcome:**
- [ ] Build passes
- [ ] Tests pass (338/338)
- [ ] Scanner shows ~453 violations (2 reduction)
- [ ] No regressions

---

## Lane Summary

| Lane | Pattern | Candidates | Safe? | Ready? | Decision |
|------|---------|-----------|-------|--------|----------|
| 1 | GET (ENGAGEMENT_VIEW) | 15 | ✓ YES | ✓ DONE | CLOSED |
| 2 | GET (various capabilities) | 15 | ✓ YES | ✓ DONE | CLOSED |
| 3 | POST (CREATE capabilities) | 4 | ✓ YES | ✓ DONE | CLOSED |
| 4 | GET (getServerAuthContext) | 0 | N/A | ✗ NO | DEFERRED |
| 5 | POST (requireAuthForCapability) | 2 | ✓ YES | ✓ YES | **PROCEED** |

---

**Status:** ✓ AUDIT COMPLETE - READY FOR X5B PILOT  
**Classification:** RUNTIME_ENFORCED_HYBRID (maintained)  
**Authorization Needed:** For X5B Pilot Migration phase
