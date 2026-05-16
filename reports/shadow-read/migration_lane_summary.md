# Migration Lane Summary & Fastest Safe Execution Plan

**Date:** 2026-05-14  
**Classification:** RUNTIME_ENFORCED_HYBRID  
**Status:** X1-G Final Summary

---

## Latest Scanner Counts

**Baseline:** 512 total violations
- Critical: 322
- Block-build: 190
- Unique routes: 108
- Dominant pattern: withAuth() (312/512 = 60.9%)

**Expected Post-Lane Reductions:**
- Post-LANE_1: ~480-490 violations (-20-30)
- Post-LANE_2: ~430-450 violations (-40-50)
- Post-LANE_3: ~405-425 violations (-15-25)
- Final estimate: ~400+ violations remaining (deferred patterns)

---

## Count by Lane

| Lane | Route Count (Estimated) | Violation Reduction | Safety Level | Difficulty |
|------|------------------------|---------------------|--------------|------------|
| LANE_1_SIMPLE_READ | 20-30 | 20-30 violations | LOWEST | TRIVIAL |
| LANE_2_CAPABILITY_READ | 40-50 | 40-50 violations | LOW | SMALL |
| LANE_3_CAPABILITY_MUTATION | 15-25 | 15-25 violations | MEDIUM | MEDIUM |
| LANE_4_GET_SERVER_AUTH | ~0-5 | ~5 violations | N/A | DEFERRED |
| LANE_5_REQUIRE_AUTH_FOR_CAP | ~0 | 0 violations | N/A | DEFERRED |
| LANE_6_REQUIRE_AUTH_NO_ARGS | ~1 | 1 violation | N/A | DEFERRED |
| LANE_7_POLICY_CONTEXT | ~0 | 0 violations | N/A | DEFERRED |
| LANE_8_CUSTOM_WORKSPACE | ~0-5 | ~5 violations | N/A | DEFERRED |
| LANE_9_CONTRACT_BLOCKER | ~0-3 | 0 violations (blocked) | N/A | DEFERRED |
| **TOTAL ACTIONABLE** | **75-110** | **75-110 violations** | — | — |
| **REMAINING (Deferred)** | — | **400+ violations** | — | — |

---

## Count by Risk

| Risk Level | Routes | Violations | Notes |
|-----------|--------|-----------|-------|
| LOW (LANE_1) | 20-30 | 20-30 | Simple reads, safe first wins |
| LOW (LANE_2) | 40-50 | 40-50 | Capability reads, well-defined |
| MEDIUM (LANE_3) | 15-25 | 15-25 | Mutations, requires proof |
| HIGH (LANE_4-9) | 0-18 | ~5-10 | Deferred, requires audit/design |
| BLOCKED (LANE_9) | 0-3 | 0 | Blockers must be resolved |

---

## Quarantined Bridge Count by Lane

**Current State:** 32 quarantined bridges (transitional debt)

**Distribution by Lane:**
- Most 32 bridges are in LANE_3_CAPABILITY_MUTATION
- Some may be in LANE_1/LANE_2 (if route was read-compatible but bridge was for mutation)
- Quarantine register: 32/32 entries with full metadata
- Status: TRANSITIONAL_DEBT (not final migration, not scanner-clean)

**Resolution Strategy:**
- LANE_3 execution must remove/replace all 32 quarantined bridges
- Alternative: Bridges remain quarantined if route proves ineligible for canonical
- Final outcome: Bridge registers updated post-LANE_3

---

## Blocked Lanes

| Lane | Reason | Unblock Criteria | Timeline |
|------|--------|------------------|----------|
| LANE_4_GET_SERVER_AUTH | Requires G8 audit | G8 design decision | Post-G7 (estimate: Week 8-10) |
| LANE_5_REQUIRE_AUTH_FOR_CAP | Requires G9 audit | G9 design decision | Post-G7 (estimate: Week 8-10) |
| LANE_6_REQUIRE_AUTH_NO_ARGS | Requires G10 audit | G10 design decision | Post-G7 (estimate: Week 8-10) |
| LANE_7_POLICY_CONTEXT | Requires G11 design | PolicyContext architecture | Post-G7 (estimate: Week 10-12) |
| LANE_8_CUSTOM_WORKSPACE | Requires G11 audit | Custom workspace pattern | Post-G7 (estimate: Week 10-12) |
| LANE_9_CONTRACT_BLOCKER | Blockers not yet identified | Contract decision | As discovered during Lane 1-3 |

---

## Safest Next Lane

**🟢 LANE_1_SIMPLE_CANONICAL_READ**

### Why Lane 1 is Safest

1. **Lowest Complexity**
   - GET-only operations only
   - No capability required
   - No PolicyContext
   - No workspace complexity
   - Response shape guaranteed safe

2. **Highest Confidence**
   - Pattern proven in G6D/G6E pilots
   - Recipe: Simple wrapper injection
   - No mutation semantics to preserve
   - No capability branching to handle

3. **Fastest ROI**
   - 20-30 routes in batch
   - ~5-10 minutes per route
   - ~2-4 hours total batch time
   - ~20-30 violations eliminated immediately

4. **Minimal Risk**
   - Read operations cannot corrupt data
   - Wrong credentials = 403 Forbidden
   - No silent mutation side effects
   - Tests prove pattern works

### Lane 1 Execution Strategy

**Batch Size:** 10 routes per batch
**Batches Needed:** 2-3 batches
**Validation per Batch:**
- Run tests after each batch
- Scanner run after batch 2 (verify ~30-40 violations removed)
- Final scanner run after all 3 batches

**Recipe for Each Route:**
```typescript
// FROM:
export async function GET(request) {
  const { session } = await withAuth();
  // ... rest of handler
}

// TO:
export async function GET(request, ctx: CanonicalAuthContext) {
  // FROM WRAPPER:
  // withCanonicalEnforcement(async (ctx) => { ... })
  // 'ctx' provided by wrapper
  const { session } = ctx;
  // ... rest of handler
}
```

---

## Fastest Safe Execution Order

### Phase Order: Lane 1 → Lane 2 → Lane 3

```
X2_LANE_1_SIMPLE_READ (Weeks 1-2)
  ├─ Batch 1 (10 routes)
  ├─ Batch 2 (10 routes)
  └─ Batch 3 (~5 routes)
  
X2_LANE_2_CAPABILITY_READ (Weeks 3-4)
  ├─ Batch 1 (10 routes)
  ├─ Batch 2 (10 routes)
  ├─ Batch 3 (10 routes)
  ├─ Batch 4 (10 routes)
  └─ Batch 5 (~10 routes)
  
X2_LANE_3_CAPABILITY_MUTATION (Weeks 5-6)
  ├─ Pilot batch (5 mutations, with full proof)
  ├─ Batch 2 (5 mutations)
  ├─ Batch 3 (5 mutations)
  └─ Final cleanup (32 quarantined bridges)
```

**Rationale:**
1. Start with safest (Lane 1)
2. Build momentum with high-volume (Lane 2)
3. Finish with most complex (Lane 3) after gaining confidence
4. Deferred lanes (4-9) scheduled post-Lane-3

---

## Recommended Next Phase

### Immediate Next: **X2_LANE_1_SIMPLE_CANONICAL_READ**

**Not:** X2_LANE_2_CAPABILITY_READ  
**Not:** X2_LANE_3_CAPABILITY_MUTATION  
**Not:** G11_CATEGORY_B (requires code inspection of remaining)

### Rationale

1. **Lane 1 is enabled now**
   - All criteria known (GET-only, no capability)
   - Recipe proven in G6D/G6E
   - Can execute immediately

2. **Lane 2 requires preliminary work**
   - Need to inspect each route for exact capability
   - Capability may not be obvious from route name
   - Best done after Lane 1 experience

3. **Lane 3 requires proof**
   - Cannot execute without full mutation proof
   - Should wait until Lane 1-2 experience confirms process
   - Proof requires test writing (mutation coverage)

4. **Deferred lanes blocked**
   - Cannot execute until dedicated audits complete
   - Not blocking main path

### X2_LANE_1 Entry Conditions (All Met ✅)

- ✅ Pattern proven in G6D/G6E
- ✅ Wrapper recipe documented
- ✅ 20-30 routes identified
- ✅ Build passing
- ✅ Tests passing
- ✅ Scanner operational

### X2_LANE_1 Success Criteria

- 20-30 routes migrated
- All routes GET-only verified
- Tests passing (no regressions)
- Scanner run: ~20-30 violations removed
- Total violations: 480-490 (from 512)

**Estimated Duration:** 2 weeks

---

## Routes/Handlers to Avoid for Now

**Do NOT migrate these routes in X1/X2_LANE_1-3:**

1. **LANE_4 Routes** (~0-5 routes)
   - Any route with `getServerAuthContext()`
   - Requires G8 audit first

2. **LANE_6 Routes** (~1 route)
   - Uses `requireAuth()` without capability
   - Deferred to G10 audit

3. **LANE_7 Routes** (~0-5 routes if found)
   - Uses `AuthContext.policy`
   - Uses `hasInternalAccess()`
   - Requires G11 PolicyContext design

4. **LANE_8 Routes** (~0-5 routes if found)
   - Custom workspace resolution
   - `resolveServerRole()` usage
   - Requires G11 custom workspace audit

5. **LANE_9 Routes** (~0-3 routes if found)
   - Request field dependency issues
   - Wrapper contract issues
   - Service signature blockers
   - Flagged during code inspection

6. **Admin Routes** (unclear count)
   - `/admin/` paths may have special context
   - Inspect first before migration

**Strategy:** If discovered during Lane 1-3 code inspection, flag and skip to Deferred Lanes phase.

---

## Can G7 Read Batching Continue Safely?

### Answer: **YES - Safely in X2_LANE_2**

**Not Before:**
- Lane 1 should complete first (gain experience)
- Lane 1 takes ~2 weeks

**After Lane 1:**
- G7 capability read batching becomes X2_LANE_2
- Can execute as second phase (Weeks 3-4)
- Estimated 40-50 routes
- Expected 4-5 batches of 10 routes each

**Safety Conditions:**
- Each batch must have capability identified beforehand
- Tests must include capability enforcement
- Read-only operation must be verified for each route
- Scanner validation after each batch

---

## Is Lane 3 Mutation Pilot Ready?

### Answer: **YES - Ready to pilot after Lane 1**

**Not Yet During X1:**
- X1 is roadmap reconciliation only (no migration)

**When Ready in X2:**
- After Lane 1-2 experience (gain confidence in process)
- After implementation of test pattern for mutations
- Estimated: Weeks 5-6

**Preparation for Lane 3:**
1. Identify all mutation routes (15-25 estimated)
2. Write mutation proof tests:
   - Wrong workspace cannot mutate
   - Missing capability cannot mutate
   - Correct capability can mutate
3. Extract service contracts and audit requirements
4. Separate from read routes (no mixing)
5. Plan quarantined bridge removal/replacement

**Risk Mitigation:**
- Start with pilot batch (5 mutations, highest confidence)
- Verify proof tests pass
- Expand to remaining mutations
- Maintain separate test suite for mutations

---

## Should PolicyContext Migration be Deferred?

### Answer: **YES - Defer to Post-Lane-3**

**Why Defer:**
1. Estimated 0-5 routes (low priority)
2. Requires dedicated G11 PolicyContext architecture
3. Cannot be part of batch migration
4. Not blocking main path (Lanes 1-3)

**Deferral Timeline:**
- Lane 1: Weeks 1-2 (simple reads)
- Lane 2: Weeks 3-4 (capability reads)
- Lane 3: Weeks 5-6 (mutations)
- G11 Design: Weeks 7-8 (PolicyContext audit)
- PolicyContext Migration: Weeks 9-10 (separate, custom)

**Decision Point:**
- After G7 completion, run classifier
- Identify actual PolicyContext routes
- Schedule G11 audit if routes found
- Defer migration to post-Lane-3

---

## Final Lane Summary

| Phase | Status | Start | Duration | Violations | Next |
|-------|--------|-------|----------|-----------|------|
| X1 | ✅ COMPLETE | Done | — | — | X2_LANE_1 |
| X2_LANE_1 | 🟢 READY | Immediate | 2 weeks | -20-30 | X2_LANE_2 |
| X2_LANE_2 | 🟡 READY (after L1) | Week 3 | 2 weeks | -40-50 | X2_LANE_3 |
| X2_LANE_3 | 🟡 READY (after L2) | Week 5 | 2 weeks | -15-25 | G11/Deferred |
| G11_POLICY | 🔴 DEFERRED | Week 8+ | TBD | TBD | Phase H |

---

## Conclusion

**✅ X1 Complete. X2 Ready to Execute.**

**Safest next lane:** LANE_1_SIMPLE_CANONICAL_READ (20-30 routes)  
**Expected reduction:** 20-30 violations in 2 weeks  
**Safe execution order:** Lane 1 → Lane 2 → Lane 3 (then deferred)  
**No blockers for X2 entry**  
**Estimated total X2 duration:** 6-8 weeks (Lanes 1-3)

**Recommended Next Phase:** X2_LANE_1_SIMPLE_CANONICAL_READ
