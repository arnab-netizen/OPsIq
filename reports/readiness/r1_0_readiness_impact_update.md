# R1-0: Readiness Impact Update — Private Beta Gates

**Date:** 2026-05-16  
**Context:** Governance hardening (R1) lanes planned; need to clarify which lanes are required for each readiness milestone  

---

## Question 1: Does R1 Block Private Beta?

### Answer: CONDITIONAL

**If all block-build violations (163) are fixed:** Private beta CAN launch with partial governance hardening  
**If critical violations remain unaddressed:** Private beta is BLOCKED  

---

## Question 2: Which R1 Lanes Are MUST-FIX Before Private Beta?

### MUST-FIX Lanes (Sequential Blocker)

#### Lane 1: SAFE_ROUTE_CANONICALIZATION (85 violations)
**Must-Fix Status:** REQUIRED ✓  
**Why:** Contains straightforward route modernizations that unblock billing (BL-003) and other high-priority routes  
**Implementation Effort:** 20-30 hours (1 week)  
**Private Beta Dependency:** YES - payment routes must work  
**Expected Reduction:** 85 violations  

#### Lane 2: CAPABILITY_ROUTE_CANONICALIZATION (78 violations)
**Must-Fix Status:** REQUIRED ✓  
**Why:** Contains owner and billing routes; capabilities already exist; safe to modernize  
**Implementation Effort:** 20-30 hours (1 week)  
**Private Beta Dependency:** YES - owner operations must work  
**Expected Reduction:** 78 violations  

#### Lane 3: POLICY_WRAPPER_REQUIRED (45 violations)
**Must-Fix Status:** PREFERRED (not hard blocker)  
**Why:** Routes that need policy enforcement; pattern proven; safety is low-risk  
**Implementation Effort:** 10-15 hours (3-4 days)  
**Private Beta Dependency:** NO - can defer if policy wrapper is well-tested  
**Can Defer To:** Paid beta with documented caveat  
**Expected Reduction:** 45 violations  

#### Lane 4: WORKSPACE_ROLE_REQUIRED (32 violations)
**Must-Fix Status:** OPTIONAL  
**Why:** Admin and workspace-scoped routes; role design is complete  
**Implementation Effort:** 8-12 hours (2-3 days)  
**Private Beta Dependency:** NO - admin features can be limited in MVP  
**Can Defer To:** Public beta without impact  
**Expected Reduction:** 32 violations  

#### Lane 5: SERVICE_BOUNDARY_REQUIRED (58 violations)
**Must-Fix Status:** OPTIONAL  
**Why:** Service refactor needed; low-risk but requires careful coordination  
**Implementation Effort:** 20-30 hours (1 week)  
**Private Beta Dependency:** NO - services work with new auth context if contracts defined  
**Can Defer To:** Paid beta  
**Expected Reduction:** 58 violations  

#### Lane 6: SCANNER_FALSE_POSITIVE (25 violations)
**Must-Fix Status:** NOT REQUIRED  
**Why:** Comments and documentation; scanner false positives  
**Implementation Effort:** 2-4 hours (configuration change)  
**Private Beta Dependency:** NO - not actual code violations  
**Can Defer To:** Indefinite  
**Expected Reduction:** 25 violations (via safe-listing)  

#### Lane 7: TEST/DEV CODE (78 violations)
**Must-Fix Status:** NOT REQUIRED  
**Why:** Test fixtures and development code  
**Implementation Effort:** 4-8 hours (test fixture update)  
**Private Beta Dependency:** NO - not production code  
**Can Defer To:** Indefinite  
**Expected Reduction:** 78 violations (via test code update or exclusion)  

#### Lane 8: UNKNOWN (43 violations)
**Must-Fix Status:** BLOCKED UNTIL AUDITED  
**Why:** Cannot classify safely; need individual audit  
**Implementation Effort:** 10-20 hours (audit + reclassification)  
**Private Beta Dependency:** UNKNOWN - depends on audit  
**Can Defer To:** After audit (likely can defer most to paid beta)  
**Expected Reduction:** 43 violations (once reclassified)  

---

## Question 3: Which R1 Lanes Can Defer to Paid Beta?

### Safe to Defer (No Private Beta Impact)

| Lane | Violations | Reason | Defer To |
|------|-----------|--------|----------|
| **Lane 3** | 45 | Policy wrapper optional for MVP | Paid beta |
| **Lane 4** | 32 | Admin features can be limited | Paid beta |
| **Lane 5** | 58 | Service refactor can be phased | Paid beta |
| **Lane 6** | 25 | Scanner false positives (safe-list) | Indefinite |
| **Lane 7** | 78 | Test code not production | Indefinite |
| **Lane 8** | 43* | Unknown - audit needed | After audit |

**Total Deferrable:** 281 violations (63%)  
**Must-Fix for Private Beta:** 163 violations (37%)  

*Lane 8 expected to reclassify mostly to Lanes 3-4 or 6-7 (deferrable)

---

## Question 4: Which R1 Lanes Can Defer to Enterprise Readiness (Phase N)?

### Enterprise-Specific Lanes

#### Lane 4: WORKSPACE_ROLE_REQUIRED
**Enterprise Impact:** Enterprise customers need sophisticated role management  
**Defer Timeline:** Can defer to Phase N (Enterprise Readiness)  
**Why:** Private beta uses simplified roles; enterprise requires RBAC, team management, scoping  

#### Lane 5: SERVICE_BOUNDARY_REQUIRED (Partial)
**Enterprise Impact:** Some services (audit, compliance) need refactoring for enterprise features  
**Defer Timeline:** Core services refactor for paid beta; enterprise extensions in Phase N  

---

## Question 5: Is Scanner Total = 0 Required Before Private Beta?

### Answer: NO ✗

**Clarification:**
- Scanner 0 is NOT required for private beta
- Scanner 163 (block-build only) IS required to be fixed
- Scanner 281 (critical in non-essential routes) CAN remain through private beta

**Private Beta Readiness Threshold:**
```
Required: BLOCK_BUILD violations = 0
Acceptable: CRITICAL violations ≤ 281 (in deferred lanes)
Final: Scanner total can be > 0 if violations are classified and deferred
```

---

## Question 6: What Scanner Threshold is Acceptable for Private Beta?

### Acceptable Thresholds for Each Milestone

#### Private Beta Launch (Week 3)
```
Block-build violations:  0 / 163 required  ← MUST FIX ALL
Critical violations:     ~200-281 acceptable (in deferred lanes)
Total violations:        ~200-281 acceptable
Condition:               All remaining violations must be classified & roadmapped
```

**Private Beta Readiness:**
- ✓ Block-build = 0 (all 163 fixed)
- ✓ Lane 1 + 2 complete (163 violations resolved)
- ✓ Remaining 281 violations classified into Lanes 3-8
- ✓ Lanes 3-8 have documented deferral timeline

#### Paid Public Beta (Week 4+)
```
Block-build violations:  0 / 163 required
Critical violations:     ~100-150 acceptable (Lane 5 + 8 remaining)
Total violations:        ~100-150 acceptable
Condition:               All critical violations must be in audited/deferred lanes
```

**Paid Beta Readiness:**
- ✓ Block-build = 0
- ✓ Lanes 1-4 complete
- ✓ Lane 5 (service boundary) complete
- ✓ Remaining 100-150 violations are Lane 6, 7, 8 (false positives, test code, unknown)

#### General Availability (Week 6+)
```
Block-build violations:  0 / 163 required
Critical violations:     0 / 281 required
Total violations:        0 / 444 required
Condition:               All routes modernized, all services refactored, all tests updated
```

**GA Readiness:**
- ✓ All 444 violations resolved
- ✓ Scanner reports 0 violations
- ✓ All tests passing
- ✓ All services use new auth context

---

## Summary: Governance Hardening Readiness Map

```
PRIVATE BETA (Week 3)
├─ Must Have: Lanes 1 + 2 complete (163 violations → 0)
├─ Must Have: Block-build violations = 0
├─ Can Defer: Lanes 3-8 (281 violations)
├─ Condition: All deferred violations classified & roadmapped
└─ Scanner Result: ~281 violations remaining (acceptable if classified)

PAID BETA (Week 4+)
├─ Must Have: Lanes 1-2 complete
├─ Must Have: Lanes 1-5 complete (241 violations → 0)
├─ Can Defer: Lanes 6-8 (103 violations)
├─ Condition: Service boundary refactor complete
└─ Scanner Result: ~100-150 violations remaining

GENERAL AVAILABILITY (Week 6+)
├─ Must Have: All lanes complete (444 violations → 0)
├─ Must Have: Scanner reports 0
├─ Condition: All production routes modernized
└─ Scanner Result: 0 violations
```

---

## Critical Path Clarification

**Critical Path for Readiness Entry:**
```
R0 (Audit Complete) → R1-A (Lanes 1-2) → Private Beta Gate 1
                   → R1-B (Lanes 3-5) → Paid Beta Gate 2
                   → R1-C/D (Lanes 6-8) → GA Gate 3
```

**Minimum for Private Beta:** R1-A complete (2 weeks)  
**Minimum for Paid Beta:** R1-B complete (3 weeks)  
**Minimum for GA:** R1-C/D complete (3-4 weeks)

---

## Final Decision for Readiness Impact

| Milestone | Scanner Threshold | Lane 1 | Lane 2 | Lane 3 | Lane 4 | Lane 5 | Lane 6 | Lane 7 | Lane 8 |
|-----------|------------------|--------|--------|--------|--------|--------|--------|--------|--------|
| Private Beta | 0 block-build | ✓ | ✓ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| Paid Beta | ≤100-150 critical | ✓ | ✓ | ✓ | ✓ | ✓ | ✗ | ✗ | ✗ |
| GA | 0 total | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

**Conclusion:** R1 implementation is NOT an all-or-nothing effort. Lanes can be completed in sequence with clear readiness gates at each milestone. Private beta can launch in Week 3 with Lanes 1-2 complete, unblocking the broader readiness roadmap.

