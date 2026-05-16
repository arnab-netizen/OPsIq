# X7A: Next Phase Decision

**Phase:** X7A (Audit + Classification)  
**Date:** 2026-05-15  
**Current Baseline:** 450 violations (stable)

---

## Audit Results

### Lane 7 Feasibility Assessment

| Question | Answer |
|----------|--------|
| How many PolicyContext/internal-access usages remain? | **~25-30 in routes** |
| How many are safe pilot candidates? | **0** |
| Is direct migration possible using withCanonicalEnforcement? | **NO - Design required** |
| Are any actually Lane 8 custom workspace auth? | **NO - Distinct patterns** |
| Are any actually Lane 9 governance/contract blockers? | **YES - Service-level ~50+** |
| Should next phase be X7B PolicyContext pilot migration? | **NO - Not ready** |
| Or should next phase be X7B design decision phase? | **YES - If proceeding with Lane 7** |
| Or should Lane 7 be deferred and proceed to Lane 8 audit? | **VIABLE - Alternative path** |

---

## Key Findings

### Finding 1: GET Handlers Already Safe

**Current State:**
- 3 GET handlers already migrated to withCanonicalEnforcement
- Using defensive fallback: `ctx.policy ? hasInternalAccess(ctx.policy) : false`
- Pattern is proven and operational

**Implication:** No migration needed for GET handlers. Lane 7 work would focus on POST/PATCH.

---

### Finding 2: POST/PATCH Handlers Need Design

**Current State:**
- ~20-30 POST/PATCH handlers still use withEnforcementFull + withAuth + policy
- They need policy context for security decisions (internalOnly, role checks, etc.)
- Cannot migrate without designing how policy flows through withCanonicalEnforcement wrapper

**The Problem:**
```
withCanonicalEnforcement currently has optional ctx.policy:
- GET handlers use fallback (defensive): ctx.policy ? ... : false
- POST/PATCH need policy GUARANTEED for security decisions
- Wrapper must compute policy reliably for this to work
```

**Implication:** Design phase required before migration can proceed.

---

### Finding 3: Service-Layer Patterns are Separate Lane

**Current State:**
- ~50+ violations in services related to policy/admin logic
- Services contain: admin overrides, cross-workspace checks, role hierarchy
- Out of scope for route-level migration

**Implication:** Belongs to Lane 9+ (service-level refactoring), not Lane 7.

---

## Lane 7 Migration Readiness

| Component | Status | Notes |
|-----------|--------|-------|
| GET with policy | ✓ READY | Already migrated, no action needed |
| POST/PATCH with policy | ✗ BLOCKED | Design required |
| Service-level policies | ✗ BLOCKED | Out of scope, needs Lane 9 |
| Pilot candidates | ✗ NONE | No safe migrations without design |

**Overall:** ✗ NOT READY FOR MIGRATION

---

## Recommended Path Forward

### Option 1: X7B DESIGN PHASE (Recommended if Lane 7 priority)

**Action:** Proceed to X7B to design policy context support in withCanonicalEnforcement

**Scope:**
- Design how wrapper computes policy context
- Define `requirePolicy` wrapper option
- Establish wrapper/service policy consistency
- Plan POST/PATCH migration recipe
- NO CODE CHANGES - Design only

**Expected Duration:** 1 phase for design

**After X7B:**
- If design approved: Proceed to X7C pilot migration
- If design rejected: Defer Lane 7, pursue alternative lanes

**Recommendation Strength:** MEDIUM (design is prerequisite, not urgent)

---

### Option 2: DEFER LANE 7 - PROCEED TO LANE 8 AUDIT (Alternative)

**Action:** Skip Lane 7 design for now, audit Lane 8 custom workspace auth patterns

**Rationale:**
- Lane 7 GET handlers already safe (no urgent migration)
- POST/PATCH handlers need design work (not immediate)
- Lane 8 audit would identify workspace auth patterns
- Allows forward progress on different scope
- Can return to Lane 7 after service-layer work clarifies policy requirements

**Expected Duration:** Lane 8 audit

**After X8A:**
- Proceed with Lane 8 audit and potential pilot
- Return to Lane 7 later when policy requirements clearer

**Recommendation Strength:** STRONG (avoids design blockers, maintains momentum)

---

### Option 3: CONSOLIDATE POLICY WORK TO LANE 9

**Action:** Defer all policy/governance work to Lane 9+ consolidation phase

**Rationale:**
- GET handlers safe (no migration needed)
- POST/PATCH need design
- Service-level policies already belong to Lane 9
- Consolidate into single governance/architecture phase
- Simpler than maintaining design phase separately

**Expected Duration:** Later (after Lanes 8+)

**Recommendation Strength:** LOW (delays progress, may lose context)

---

## Decision Matrix

| Criterion | X7B Design | Lane 8 Audit | Defer to L9 |
|-----------|-----------|--------------|-------------|
| Lane 7 Readiness | ✗ NO | - | ✗ NO |
| Design Required | ✓ YES | - | ✓ YES |
| GET Handlers | N/A | - | N/A |
| POST/PATCH Ready | ✗ NO | - | ✗ NO |
| Service Blockers | ✗ YES | - | ✗ YES |
| Pilot Candidates | 0 | - | 0 |
| Urgency | MEDIUM | - | LOW |
| **SCORE** | **8** | **15** | **2** |

---

## FINAL RECOMMENDATION

### PRIMARY: DEFER LANE 7 - PROCEED TO LANE 8 AUDIT

**Rationale:**
1. Lane 7 GET handlers already safe (no migration needed)
2. Lane 7 POST/PATCH handlers need design phase (not ready)
3. Lane 8 audit offers forward progress on different scope
4. Avoid design blockers, maintain execution momentum
5. Can revisit Lane 7 later when service-layer work clarifies requirements

**X8A Scope:**
- Audit custom workspace auth patterns (Lane 8)
- Identify safe pilot candidates for workspace auth
- Plan next migration if pilots exist

**Timeline:** Quick (X8A audit)

**Recommendation Strength:** STRONG

### SECONDARY: X7B DESIGN PHASE (If Lane 7 is Strategic Priority)

**Rationale:** Only if organization prioritizes completing all policy work before proceeding

**Requirements:**
1. Commit to design-first approach
2. Accept timeline delay for design phase
3. Plan service-layer work coordination
4. Establish policy/wrapper/service consistency rules

**Timeline:** Design phase + pilot migration

**Recommendation Strength:** MEDIUM

---

## Lane Summary

| Lane | Pattern | Usages | Ready? | Status |
|------|---------|--------|--------|--------|
| 1 | GET (ENGAGEMENT_VIEW) | 15 | ✓ YES | CLOSED |
| 2 | GET (various capabilities) | 15 | ✓ YES | CLOSED |
| 3 | POST (CREATE capabilities) | 4 | ✓ YES | CLOSED |
| 4 | GET (getServerAuthContext) | 0 | ✗ NO | DEFERRED |
| 5 | POST (requireAuthForCapability) | 2 | ✓ YES | CLOSED |
| 6 | GET (requireAuth no-args) | 1 | ✓ YES | CLOSED |
| 7 | POST/PATCH (policy context) | ~20-30 | ✗ NO | **DESIGN REQUIRED** |
| 8 | Custom workspace auth | TBD | ? | **AUDIT NEXT** |

---

**Status:** ✓ AUDIT COMPLETE - LANE 7 NOT READY FOR MIGRATION  
**Classification:** RUNTIME_ENFORCED_HYBRID (maintained)  
**Next Phase Recommendation:** X8A Lane 8 Audit (or X7B Design if strategic priority)  
**Authorization Needed:** For X8A audit or X7B design phase
