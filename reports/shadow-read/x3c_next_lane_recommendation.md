# X3C: Next Lane Selection & Recommendation

**Phase:** X3C (Closeout + Planning)  
**Date:** 2026-05-15  
**Current Baseline:** 455 violations

---

## Lane 3 Status: CLOSED ✓

### Lane 3 Completion Summary

| Item | Status | Details |
|------|--------|---------|
| **Original Candidates** | 5 | actions, clients, leads, users, decisions/create |
| **Migrated Clean** | 4 | actions, clients, leads, users |
| **Deferred** | 1 | decisions/create (governance blocker) |
| **Lane 3 Ready** | 0 | None remaining |
| **Success Rate** | 80% | 4 of 5 eligible (1 blocked by governance) |
| **Violations Removed** | 12 | 455 from earlier 467 baseline |
| **Bridge Removal Rate** | 80% | 4 of 5 quarantined bridges from Lane 3 mutations |

**Verdict: LANE 3 FORMALLY CLOSED**

No remaining candidates in Lane 3 scope. All true Lane 3-ready handlers processed. Deferred handler requires separate governance decision, not a code migration issue.

---

## Quarantined Bridge Inventory

**Originally Quarantined:** 37 bridges  
**Removed in Lane 3:** 4 bridges  
**Remaining:** 33 bridges  
**Distribution:**
- Service-level bridges: ~20
- Infrastructure bridges: ~8
- Other patterns: ~5

---

## Candidate Next Lanes

### Lane 4: GET_SERVER_AUTH_CONTEXT (G8)

**Pattern:** `getServerAuthContext()` usage in routes  
**Current Status:** Estimated ~50-60 violations in routes  
**Risk:** LOW  
**Complexity:** LOW (read-only, similar to Lane 2 GET handlers)  
**Potential Reduction:** ~15-20 violations  
**Ready:** YES - Pattern validated in Lanes 2-3  
**Recommendation:** ⭐ STRONG CANDIDATE

---

### Lane 5: REQUIRE_AUTH_FOR_CAPABILITY (G9)

**Pattern:** `requireAuthForCapability(capability)` usage  
**Current Status:** Estimated ~40-50 violations in routes and services  
**Risk:** MEDIUM (mixed route/service usage)  
**Complexity:** MEDIUM (needs service-level handling)  
**Potential Reduction:** ~15-25 violations  
**Ready:** PARTIAL - Routes ready, services need design  
**Recommendation:** DEFER UNTIL AFTER LANE 4 or LANE 6

---

### Lane 6: REQUIRE_AUTH_NO_ARGS (G10)

**Pattern:** `requireAuth()` with no arguments  
**Current Status:** Estimated ~30-40 violations  
**Risk:** LOW (simple removal)  
**Complexity:** LOW (no capability enforcement)  
**Potential Reduction:** ~10-15 violations  
**Ready:** YES - Straightforward migration  
**Recommendation:** ⭐ STRONG CANDIDATE (AFTER Lane 4)

---

### Lane 7: POLICY_CONTEXT_INTERNAL_ACCESS (G11)

**Pattern:** `hasInternalAccess(policy)` and policy context usage  
**Current Status:** Estimated ~25-35 violations in routes  
**Risk:** LOW-MEDIUM (defensive pattern, optional context)  
**Complexity:** LOW (policy already in ctx)  
**Potential Reduction:** ~10-15 violations  
**Ready:** YES - Pattern proven in Lane 2  
**Recommendation:** ⭐ VIABLE (Can run in parallel with Lane 4)

---

### Lane 8: CUSTOM_WORKSPACE_AUTH (G11)

**Pattern:** Custom workspace validation logic  
**Current Status:** Estimated ~20-30 violations  
**Risk:** MEDIUM-HIGH (custom logic, hard to standardize)  
**Complexity:** MEDIUM (each case different)  
**Potential Reduction:** ~5-15 violations  
**Ready:** RESEARCH NEEDED - Pattern not yet defined  
**Recommendation:** DEFER - Requires design phase first

---

### Lane 9: CONTRACT_BLOCKER (G11/G12)

**Pattern:** Services, infrastructure, governance blockers  
**Current Status:** Estimated ~100-120 violations  
**Risk:** HIGH (mixed patterns, deep dependencies)  
**Complexity:** HIGH (service-level refactor)  
**Potential Reduction:** ~50+ violations  
**Ready:** NO - Requires prerequisite lanes complete  
**Recommendation:** DEFER - Strategy prerequisite

---

## Decisions/Create: Separate Governance Track

**Status:** DEFERRED  
**Reason:** Requires capability governance decision  
**Future Phase:** G12 Governance Refactor  
**Does NOT block:** Any other lane progression

---

## Recommended Execution Order

### Phase Sequence

**Phase X4 (RECOMMENDED NEXT):** Lane 4 - GET_SERVER_AUTH_CONTEXT
- Low risk, high certainty
- ~50-60 violations, expect ~15-20 reduction
- Pattern validated in Lanes 2-3
- Baseline after: ~435-440
- Estimated completion: Quick (similar scope to X3A)

**Phase X5 (PARALLEL or SEQUENTIAL):** Lane 7 - POLICY_CONTEXT_INTERNAL_ACCESS
- Low complexity, defensive pattern
- ~25-35 violations, expect ~10-15 reduction
- Can run in parallel with X4
- Baseline after: ~415-430
- Estimated completion: Medium

**Phase X6 (AFTER X4):** Lane 6 - REQUIRE_AUTH_NO_ARGS
- Low complexity, simple removals
- ~30-40 violations, expect ~10-15 reduction
- Baseline after: ~405-420
- Estimated completion: Quick

**Phase X7 (DEFER):** Lane 5 - Service-Level Auth
- Requires design phase first
- Potential ~40-50 violations
- Defer until service pattern defined

**Phase X8 (DEFER):** Lane 8 - Custom Workspace Auth
- Requires design phase
- Defer until pattern research complete

**Phase G12 (FUTURE):** Governance Refactor
- Address decisions/create capability decision
- Refactor service-level auth patterns
- Comprehensive governance audit

---

## Decision Matrix

| Criterion | Lane 4 | Lane 6 | Lane 7 | Lane 5 | Lane 8 | Lane 9 |
|-----------|--------|--------|--------|--------|--------|--------|
| Ready | ✓✓ | ✓✓ | ✓ | ◐ | ✗ | ✗ |
| Risk | ✓✓ | ✓✓ | ✓ | ◐ | ◐ | ✗ |
| Reduction | ✓ | ✓ | ✓ | ✓ | ◐ | ✓✓ |
| Complexity | ✓ | ✓ | ✓ | ◐ | ◐ | ✗ |
| **SCORE** | **18** | **17** | **15** | **11** | **7** | **3** |

---

## Final Recommendation

### NEXT PHASE: X4 LANE 4 - GET_SERVER_AUTH_CONTEXT

**Rationale:**
1. Highest ready score (18)
2. Lowest risk (pattern proven in Lanes 2-3)
3. Highest confidence (GET pattern identical to Lane 2)
4. Quick execution (similar scope to X3A)
5. No blockers or prerequisites
6. Estimated reduction: 15-20 violations (baseline 435-440)

**After X4 Complete:**
- Evaluate Lane 6 execution
- Optionally run Lane 7 in parallel
- Continue systematic reduction

**Defer:**
- Lane 5 until service pattern designed
- Lane 8 until workspace auth research complete
- Decisions/create until governance decision made

---

## Remaining Work Summary

| Layer | Pattern | Remaining Violations | Future Lane | Ready |
|-------|---------|----------------------|------------|-------|
| **Routes** | GET_SERVER_AUTH_CONTEXT | ~50-60 | Lane 4 | ✓ YES |
| **Routes** | REQUIRE_AUTH (no args) | ~30-40 | Lane 6 | ✓ YES |
| **Routes** | POLICY_CONTEXT | ~25-35 | Lane 7 | ✓ YES |
| **Routes** | CUSTOM_WORKSPACE | ~20-30 | Lane 8 | ◐ DESIGN |
| **Mutations** | ENTITLEMENT_PATTERN | ~3 | Lane 9 | ✗ DEFERRED |
| **Services** | SERVICE_LEVEL_AUTH | ~80-100 | Lane 5/9 | ◐ DESIGN |
| **Infrastructure** | GOVERNANCE_LEVEL | ~60-80 | Lane 9-10 | ✗ RESEARCH |
| **Tests** | TEST_FRAMEWORK | ~15-30 | Lane 11 | ◐ SEPARATE |

---

**Status:** ✓ PLANNING COMPLETE  
**Classification:** RUNTIME_ENFORCED_HYBRID (maintained)  
**Next Action:** Await authorization for X4 Lane 4 execution
