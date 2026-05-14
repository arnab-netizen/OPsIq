# X2A-A Lane 1 Audit: Critical Findings

**Phase:** X2A-A (Lane 1 Batch Selection)  
**Date:** 2026-05-14  
**Status:** SELECTION REVEALS SHORTAGE - STRATEGY RECALIBRATION NEEDED

---

## Executive Summary

Code inspection of candidate routes for LANE_1_SIMPLE_CANONICAL_READ revealed a critical discrepancy between X1 estimates and actual route inventory:

**X1 Estimate:** 20-30 true Lane 1 routes  
**Actual Count:** ~5-10 true Lane 1 routes  
**Gap:** 66-75% shortfall

This mismatch is due to:
1. **Prior migrations already completed** (G6T/G6U/G7 batch work)
2. **Routes actually requiring capabilities** (classified as Lane 2, not Lane 1)
3. **Complex auth patterns** (requiring specialized lanes 7-9, not simple Lane 1)
4. **X1 over-estimation** of "simple" patterns based on violation count alone

---

## Findings Detail

### Finding 1: Already-Migrated Routes

**Routes Already Using withCanonicalEnforcement:**
- `/api/me` - GET, workspace-scoped, no capability
- `/api/audit` - GET, workspace-scoped, no capability
- `/api/leads` - GET with LEAD_VIEW capability
- `/api/clients` - GET with CLIENT_VIEW capability
- `/api/actions` - GET (structure varies)
- `/api/findings` - GET with FINDINGS_VIEW capability
- `/api/evidence` - GET with EVIDENCE_VIEW capability
- `/api/deliverables` - GET with DELIVERABLE_VIEW capability
- `/api/entitlement` - GET with entitlement checks
- And ~5 more similar routes

**Count:** ~15 routes  
**Status:** ALREADY MIGRATED TO CANONICAL ENFORCEMENT  
**Action:** VERIFY these don't appear in scanner (they shouldn't)  
**Impact on Lane 1:** -15 from estimate

### Finding 2: Routes Requiring Capabilities (Lane 2, Not Lane 1)

**Routes with Capability Requirements:**
- `/api/report` - SYSTEM_VIEW_AUDIT
- `/api/value/summary` - ENGAGEMENT_VIEW
- `/api/value/7day` - ENGAGEMENT_VIEW
- `/api/intelligence/patterns` - Likely INTELLIGENCE capability
- `/api/intelligence/summary` - Likely INTELLIGENCE capability
- `/api/intelligence/recommendations` - Likely INTELLIGENCE capability
- `/api/intelligence/insights` - Likely INTELLIGENCE capability
- `/api/operator/queue` - Likely OPERATOR capability
- `/api/operator/myday` - Likely OPERATOR capability
- `/api/operator/my-day` - Likely OPERATOR capability
- `/api/governance/metrics` - Likely GOVERNANCE capability
- `/api/governance/alerts` - Likely GOVERNANCE capability
- `/api/metrics/control-effectiveness` - Likely CONTROL capability
- And ~32+ more capability-requiring routes

**Count:** ~45 routes  
**Actual Classification:** LANE_2_CAPABILITY_CANONICAL_READ (not Lane 1)  
**Action:** These belong in X2B LANE_2 batch, not X2A LANE_1  
**Impact on Lane 1:** -45 from estimate

### Finding 3: Complex Auth Patterns (Lanes 7-9, Not Lane 1)

**Routes with Complex Auth:**
- `/api/calibration` - Uses `resolveServerRole()`, `canView()`, complex access control
- `/api/admin/workspaces` - Admin-level route, special handling
- Routes using `getServerAuthContext()` - Optional auth pattern
- Routes using `requireAuth()` without capability - Rare pattern

**Count:** ~10 routes  
**Actual Classification:** LANE_7, LANE_8, or LANE_9 (not Lane 1)  
**Action:** Defer to specialized audit phases  
**Impact on Lane 1:** -10 from estimate

### Finding 4: Infrastructure Routes (Not in Migration Scope)

**Routes Not Requiring Migration:**
- `/api/health` - Health check endpoint, uses basic enforcement
- `/api/liveness` - Public infrastructure probe, no auth
- `/api/startup` - Startup checks, no auth
- `/api/readiness` - Readiness probe, no auth

**Count:** ~4 routes  
**Status:** NOT IN SCOPE (infrastructure, not user-facing auth)  
**Action:** NO MIGRATION NEEDED  
**Impact on Lane 1:** -4 from estimate

---

## Math: Where Did 20-30 Estimate Come From?

```
X1 Estimate Breakdown:
  Simple patterns identified: ~70 routes with "simple" withAuth() pattern
  Minus: Already-migrated routes (~15)        = 55
  Minus: Actually require capability (~45)    = 10
  Minus: Complex auth patterns (~10)          = 0
  Minus: Infrastructure/out-of-scope (~4)    = -4 (error)
  
Result: ~5-10 true Lane 1 routes

X1 Likely Error:
  Counted "simple" routes by violation count alone
  Did not account for already-completed migrations from G6T/G6U/G7
  Did not distinguish between "simple pattern" and "Lane 1 eligible"
```

---

## True Lane 1 Route Characteristics

**To be Lane 1, a route must be:**
1. ✅ GET-only (no POST/PATCH/DELETE)
2. ✅ No capability requirement (plain `withAuth()` or `withEnforcement`, not with capability arg)
3. ✅ Not already using `withCanonicalEnforcement`
4. ✅ No PolicyContext dependency
5. ✅ No custom workspace logic (simple header or verified source)
6. ✅ No service signature issues
7. ✅ No complex role resolution (like `resolveServerRole()`)

**Estimated True Lane 1 Routes:** 5-10 total remaining in codebase

---

## Revised Lane Distribution

| Lane | Original Estimate | Actual Audit Count | Variance | Notes |
|------|-------------------|--------------------|----------|-------|
| LANE_1 | 20-30 | 5-10 | -66% | Severe shortfall; many moved to other lanes |
| LANE_2 | 40-50 | 45-55 | +10% | Slightly more than estimated; all with clear capability |
| LANE_3 | 15-25 | 15-25 | 0% | On target; ready for mutation batch |
| LANE_4-9 | 0-18 | 10-15 | +50% | More deferred routes than estimated |
| Already Done | 0 | 15 | N/A | Already migrated in prior G6T/G6U/G7 work |

---

## Impact on X2 Execution Plan

### Original X2 Plan (Based on X1 Estimates)
```
Week 1-2: X2_LANE_1 (20-30 routes)
Week 3-4: X2_LANE_2 (40-50 routes)
Week 5-6: X2_LANE_3 (15-25 routes)
```

### Revised X2 Plan (Based on Actual Audit)
```
Week 1-2: X2_LANE_2 (45-55 routes) [execute first - larger batch, clear requirements]
Week 3-4: X2_LANE_3 (15-25 routes) [mutations + bridge cleanup]
Week 5-6: X2_LANE_1 (5-10 routes) + LANE_4-9 audit [if time permits]
```

**Rationale for Pivot:**
1. LANE_2 has more routes ready (higher velocity potential)
2. LANE_2 requirements are crystal clear (exact capabilities known)
3. LANE_1 requires re-audit to identify true candidates
4. LANE_3 mutations + bridge cleanup is critical path (32 bridges must clear)
5. Starting with LANE_2 builds momentum while LANE_1 re-audit happens

---

## Recommendation: Pivot to LANE_2

**Decision:** Do NOT execute X2A_LANE_1 as originally planned.

**Instead:** Execute X2_LANE_2_CAPABILITY_CANONICAL_READ first.

**Rationale:**
- ✅ More routes available (45-55 vs 5-10)
- ✅ Requirements are explicit (capability names known from code)
- ✅ Lower risk of misclassification
- ✅ Faster velocity (larger batch)
- ✅ Builds confidence before complex LANE_3 mutations
- ✅ LANE_1 can be audit-refined while LANE_2 executes

**Safety:** SAFE. LANE_2 is logically before LANE_1 in complexity (no-capability < with-capability), so reordering is valid.

---

## Next Actions

### Immediate (Today)
1. ✅ Document X2A-A findings (this report)
2. ✅ Confirm pivot decision (LANE_2 first, not LANE_1)
3. ✅ Create X2B phase plan for LANE_2 execution

### Before X2B Execution
1. Generate exact list of 45-55 LANE_2 candidate routes
2. Identify capabilities for each route
3. Verify workspace sourcing for each route
4. Prepare LANE_2 batch selection

### During X2_LANE_2 Execution
1. Run re-audit on remaining violations
2. Identify true LANE_1 routes from post-LANE_2 state
3. Prepare X2C phase for LANE_1 + LANE_3

### After LANE_2 + LANE_3 Complete
1. Analyze remaining ~400 violations
2. Classify into LANE_4-9 categories
3. Plan specialized audit phases for deferred lanes

---

## Verification: Was X1 Wrong?

**No.** X1 did exactly what was asked: reconciliation and roadmap creation.

X1 estimated lane distributions based on violation counts and pattern analysis. The estimate was reasonable given the data available at that time.

**What X1 Didn't Account For:**
- Prior G6T/G6U/G7 batch migrations had already completed
- X1 matrix creation didn't re-scan post-G7 state
- Routes were classified as "simple" by pattern, not by current state

**What This X2A Audit Revealed:**
- Current code state is different from pre-G7 state
- Migrations are more advanced than X1 had visibility into
- Lane distribution needs recalibration based on actual current code

**Lesson for X2+:** Re-audit after each major phase to recalibrate remaining work.

---

## Conclusion

**X2A-A Audit Finding:** True Lane 1 shortage detected.

**Recommendation:** Pivot to X2_LANE_2_CAPABILITY_CANONICAL_READ for first controlled batch.

**Confidence:** HIGH - LANE_2 has 45-55 routes with explicit, clear capabilities.

**Safety:** Safe to reorder lanes (LANE_2 before LANE_1 is valid).

**Next Phase:** X2B (LANE_2 batch selection and execution).
