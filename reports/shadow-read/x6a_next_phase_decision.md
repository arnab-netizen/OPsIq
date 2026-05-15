# X6A: Next Phase Decision

**Phase:** X6A (Audit Complete)  
**Date:** 2026-05-15  
**Current Baseline:** 453 violations (stable)

---

## Audit Results

### Lane 6 Feasibility Assessment

| Question | Answer |
|----------|--------|
| How many requireAuth() no-args usages remain? | **1 in route** |
| How many are safe pilot candidates? | **1 (selected)** |
| Is migration directly possible using withCanonicalEnforcement? | **YES** |
| Are any usages actually Lane 7/8/9 blockers? | **NO** |
| Should next phase be X6B requireAuth pilot migration? | **YES - RECOMMENDED** |
| If not, what blocker phase is required? | **N/A - Ready to proceed** |

---

## Key Findings

### Lane 6 Exists and is Ready

Lane 6 has a single safe usage pattern:
- **Total requireAuth() no-args usages found:** 1
- **All in route handlers:** YES (1 route)
- **All safe for migration:** YES (low-risk)
- **Pattern is straightforward:** YES (GET read-only)

### Pilot Candidate Summary

| Handler | Method | Type | Risk | Ready |
|---------|--------|------|------|-------|
| entity/route.ts GET | GET | READ | LOW | ✓ YES |

---

## Pattern Analysis

### Current Pattern

Handler follows straightforward structure:
```typescript
export const GET = withEnforcementFull(
  async (request: NextRequest) => {
    // 1. Manual auth requirement
    await requireAuth();
    
    // 2. Manual workspace extraction
    const workspaceId = request.headers.get("x-workspace-id");
    
    // 3. Manual workspace enforcement
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    
    // 4. Simple read-only service call
    return getEntities();
  }
);
```

### Migration Target

```typescript
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    // 1. Implicit auth from wrapper
    // 2. Implicit workspace from ctx.verifiedWorkspaceId
    // 3. Implicit workspace enforcement from wrapper
    // 4. Simple read-only service call
    return getEntities();
  },
  { requireWorkspace: true }
);
```

### Why This Works

1. **No capability required:** Handler doesn't enforce specific capability
2. **Workspace source is standard:** x-workspace-id header (same as others)
3. **No policy context needed:** Handler doesn't use policy checks
4. **No custom auth logic:** Both use standard workspace enforcement
5. **Service call is straightforward:** Single read-only service call
6. **Pattern validated in Lane 2:** Identical to successful GET migrations

---

## Violation Reduction Estimate

**Current State:** 453 violations  
**Expected Reduction:** ~1 violation (1 handler)  
**After X6B Completion:** ~452 violations

---

## Recommended Path Forward

### Option 1: X6B PILOT MIGRATION (STRONGLY RECOMMENDED)

**Action:** Proceed to X6B to migrate requireAuth() no-args handler

**Rationale:**
1. Pilot candidates exist (1 handler found)
2. Candidate is LOW risk (no blockers, clear pattern)
3. Pattern is validated (identical to Lane 2 GET migrations)
4. Expected to succeed (high confidence)
5. Quick execution (1 handler, straightforward)

**Scope:**
- Migrate entity/route.ts GET to withCanonicalEnforcement
- Validate build, tests, scanner
- Expected ~1 violation reduction

**Expected Duration:** Quick (similar to X5B single-handler migration)  
**Expected Baseline After:** ~452 violations  
**Recommendation Strength:** STRONG

### Option 2: DEFER LANE 6 (NOT RECOMMENDED)

**Action:** Skip Lane 6 and move to other lanes

**Rationale:** Not applicable - Lane 6 candidate is safe and ready

**Recommendation Strength:** WEAK

---

## Decision Matrix

| Criterion | X6B Pilot | Defer L6 |
|-----------|-----------|----------|
| Candidates Found | 1 | 1 |
| All Safe | ✓ YES | N/A |
| Pattern Validated | ✓ YES | N/A |
| Risk Level | LOW | N/A |
| Readiness | READY | N/A |
| Blocking Issues | NONE | N/A |
| Confidence | HIGH | LOW |
| **RECOMMENDATION** | **PROCEED** | **SKIP** |

---

## FINAL RECOMMENDATION

### NEXT PHASE: X6B REQUIREAUTH PILOT MIGRATION

**Rationale:**
1. Lane 6 audit found 1 actionable candidate (safe for migration)
2. All candidates are safe for migration (LOW risk)
3. Pattern is well-understood (identical to Lane 2 GET migrations)
4. Expected violation reduction: ~1
5. No blockers or prerequisites
6. High confidence of success

**X6B Scope:**
- Migrate entity/route.ts GET
  - Current: `withEnforcementFull + requireAuth() + enforceWorkspaceScoping`
  - Target: `withCanonicalEnforcement { requireWorkspace: true }`

**Expected Outcome:**
- [ ] Build passes
- [ ] Tests pass (338/338)
- [ ] Scanner shows ~452 violations (1 reduction)
- [ ] No regressions

---

## Lane Summary

| Lane | Pattern | Candidates | Safe? | Ready? | Decision |
|------|---------|-----------|-------|--------|----------|
| 1 | GET (ENGAGEMENT_VIEW) | 15 | ✓ YES | ✓ DONE | CLOSED |
| 2 | GET (various capabilities) | 15 | ✓ YES | ✓ DONE | CLOSED |
| 3 | POST (CREATE capabilities) | 4 | ✓ YES | ✓ DONE | CLOSED |
| 4 | GET (getServerAuthContext) | 0 | N/A | ✗ NO | DEFERRED |
| 5 | POST (requireAuthForCapability) | 2 | ✓ YES | ✓ DONE | CLOSED |
| 6 | GET (requireAuth no-args) | 1 | ✓ YES | ✓ YES | **PROCEED** |

---

**Status:** ✓ AUDIT COMPLETE - READY FOR X6B PILOT  
**Classification:** RUNTIME_ENFORCED_HYBRID (maintained)  
**Authorization Needed:** For X6B Pilot Migration phase
