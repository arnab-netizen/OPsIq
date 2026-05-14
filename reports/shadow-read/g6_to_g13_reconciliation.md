# G6 through G13 Phase Reconciliation

**Date:** 2026-05-14  
**Classification:** RUNTIME_ENFORCED_HYBRID

---

## Foundational Truths

- **G6T/G6U proved canonical route migration** ✅ (pilot migration completed successfully)
- **G7B/G7C/G7D proved capability GET/read migration** ✅ (capability-based reads validated)
- **G7D-C accepted request?: NextRequest** ✅ (CanonicalAuthContext.request remains optional)
- **X1P restored 32 bridges as quarantined transitional debt** ✅ (documented, marked for LANE_3_CAPABILITY_MUTATION cleanup)
- **withCanonicalEnforcement proven pattern** ✅ (used in pilot routes successfully)

---

## Phase-by-Phase Status

### **G6D** - Migrate 3 pilot routes

**Status:** ✅ **COMPLETED**

**Summary:**
- 3 pilot routes migrated from withAuth() to withCanonicalEnforcement()
- Pattern validation: withCanonicalEnforcement(async (ctx) => { ... })
- Evidence: G6T/G6U proof of concept
- Handler behavior preserved: request field remains optional (request?: NextRequest)

**Evidence:**
- Pilot migrations: COMPLETED
- Test validation: PASSED
- No regression in migrated routes

**Completion Criteria:** ✅ MET
- Wrapper pattern proven
- Request contract preserved
- Handler compatibility confirmed

**Next Required Action:**
- Proceed to G6E (batch expansion of simple reads)

---

### **G6E** - Expand withAuth() no-args in batches of 10

**Status:** 🟡 **PARTIALLY COMPLETED (pilot phase)**

**Summary:**
- G6T/G6U served as pilot batch validation
- Pattern: withAuth() without capability argument
- Estimated matching routes in codebase: ~20-30 (based on X1 scan)
- Completion strategy: Lane 1 migration (LANE_1_SIMPLE_CANONICAL_READ)

**Current State:**
- Pilot validated
- Recipe documented: `withCanonicalEnforcement(async (ctx) => { ... })`
- Full codebase expansion pending X2 lane-based execution

**Acceptance Criteria:**
- ✅ Pilot validation complete
- ⏳ Full batch expansion requires X2_LANE_1_SIMPLE_CANONICAL_READ execution
- ⏳ 20-30 additional routes identified in migration matrix

**Known Eligible Routes:**
- Routes with GET-only operation
- Routes with no capability requirement
- Routes with no PolicyContext dependency
- ~20-30 total estimated

**Next Required Action:**
- X2_LANE_1_SIMPLE_CANONICAL_READ: Execute batch migration in groups of 10

---

### **G6F** - Close out low-risk pattern

**Status:** ✅ **COMPLETE (at pilot scope) / 🟡 PENDING FULL EXECUTION**

**Summary:**
- G6D/G6E demonstrated low-risk pattern (no-args withAuth)
- Full closure requires G6E expansion completion
- Low-risk classification: GET-only, no capability, no PolicyContext

**Completion Criteria:**
- ✅ Pattern classified as LANE_1_SIMPLE_CANONICAL_READ
- ✅ Recipe documented
- ⏳ 20-30 routes identified
- ⏳ Awaiting X2 batch execution

**Next Required Action:**
- X2_LANE_1_SIMPLE_CANONICAL_READ completion to close G6F

---

### **G7** - Migrate withAuth(capability)

**Status:** 🟡 **VALIDATED (pilot) / PENDING FULL EXECUTION**

**Summary:**
- G7B/G7C/G7D proved capability-based read migration
- Pattern: `withAuth({ capability: "EXACT_CAPABILITY" })`
- Estimated matching routes in codebase: ~40-50 (based on X1 scan)
- Migration lane: LANE_2_CAPABILITY_CANONICAL_READ

**Current State:**
- Pilot validation: COMPLETE
- Recipe: `withCanonicalEnforcement({ requireCapabilities: ["EXACT_CAPABILITY"] }, async (ctx) => { ... })`
- Request contract: Preserved (request?: NextRequest)
- Full codebase migration pending

**Phase Division:**
- **G7 Reading Phase (reads with capability):** 40-50 routes → LANE_2_CAPABILITY_CANONICAL_READ
- **G7 Mutation Phase (mutations with capability):** Separated to LANE_3_CAPABILITY_MUTATION

**Critical Constraint:**
> Do NOT mix read and mutation routes. Lane 3 mutations require full proof before migration.

**Acceptance Criteria:**
- ✅ Pilot validation complete
- ⏳ 40-50 read routes identified for LANE_2
- ⏳ Awaiting X2 batch execution

**Next Required Action:**
- X2_LANE_2_CAPABILITY_CANONICAL_READ: Execute capability-based read migration
- X2_LANE_3_CAPABILITY_MUTATION: Execute mutation migration (separate, with proof)

---

### **G8** - Migrate getServerAuthContext()

**Status:** 🟡 **NOT FOUND IN X1 SCAN / DEFERRED**

**Summary:**
- getServerAuthContext() is optional auth context retrieval
- Detected in scanner violations but not in route files during X1
- Pattern requires server-side context decision
- Requires dedicated G8 audit before migration

**Current State:**
- Route file references: ~0 (not found in X1 baseline)
- Governance/library references: ~3 (comments, not active code)
- Classification: Low priority

**Acceptance Criteria:**
- 🔴 DEFERRED - Requires dedicated G8 audit
- No route migration of getServerAuthContext() in X1 or X2
- Defer to dedicated phase after G7 completion

**Blocking Factor:**
- Requires separate design decision on optional auth handling
- Cannot proceed until G8 audit clarifies optional context pattern

**Next Required Action:**
- Schedule dedicated G8 audit after G7 completion
- Do NOT migrate getServerAuthContext() routes in X1/X2

---

### **G9** - Migrate requireAuthForCapability()

**Status:** 🟡 **NOT DETECTED / DEFERRED**

**Summary:**
- requireAuthForCapability() is specialized capability helper
- Not detected in route files during X1 scan
- Potentially replaced by withAuth({ capability: "..." }) pattern
- Requires audit before migration

**Current State:**
- Route file references: ~0
- Status: Not a blocker

**Acceptance Criteria:**
- 🔴 DEFERRED - Requires G9 audit
- If discovered during Lane 1-3 migration, flag for dedicated G9 phase

**Next Required Action:**
- Schedule G9 audit as separate phase (not blocking X1/X2)

---

### **G10** - Migrate requireAuth()

**Status:** ⚠️ **RARE / SINGLE INSTANCE FOUND / DEFERRED**

**Summary:**
- requireAuth() is required auth without explicit capability
- Detected in 1 route during X1 scan
- Likely legacy pattern, replaced by withAuth() in most code
- Requires audit for handling

**Current State:**
- Route file references: ~1
- Classification: Not a batch - single instance

**Acceptance Criteria:**
- 🔴 DEFERRED - Requires G10 audit
- 1 instance found, flag for manual inspection during Lane code review

**Next Required Action:**
- Include in manual code inspection during Lane migration phases
- If pattern is clear, resolve during appropriate lane
- Otherwise, defer to G10 dedicated audit

---

### **G11** - Manually clear remaining CATEGORY_B

**Status:** 🔴 **PENDING - REQUIRES CODE INSPECTION**

**Summary:**
- CATEGORY_B violations: complexity requiring custom solutions
- Includes: PolicyContext routes, custom workspace logic, internal overrides
- X1 scan did not identify specific CATEGORY_B instances (requires classifier execution)
- Estimated routes: ~0-5 (from heuristic analysis)

**Current State:**
- Not yet executed classifier phase
- CATEGORY_B count unknown until scanner+classifier executed together
- Estimate: Low count (most routes are straightforward withAuth → withCanonicalEnforcement)

**Expected Distribution:**
- CATEGORY_A (direct replacement): ~90-100 routes
- CATEGORY_B (custom handling): ~0-10 routes
- CATEGORY_C (manual review): ~0-5 routes

**Acceptance Criteria:**
- ⏳ Classifier must be executed after Lane 1-2 migration
- 🔴 CATEGORY_B routes deferred to post-Lane-2 phase
- Requires individual analysis and custom recipe for each

**Next Required Action:**
- After Lane 1-2 completion: Run classifier on remaining violations
- Identify actual CATEGORY_B routes (not estimated)
- Create custom migration recipes per route
- Execute G11 phase with custom solutions

---

### **G12** - Runtime violation reconciliation

**Status:** 🔴 **PENDING - PHASE SEQUENCE DEPENDENT**

**Summary:**
- G12 validates that migrated routes produce no runtime auth violations
- Requires Lane 1-3 migrations to complete first
- Execution: After all canonical migrations complete
- Proof: Run scanner again and verify violation count decreased

**Current State:**
- Pre-Lane-migration baseline: 512 violations
- Expected post-LANE_1-3: ~300-350 violations remaining
- Difference validates successful migration

**Acceptance Criteria:**
- ⏳ Awaiting Lane 1-3 migration completion
- Run scanner after each lane to verify reduction
- Expected verification points:
  - Post-LANE_1: ~480-490 violations remaining (20-30 routes fixed)
  - Post-LANE_2: ~430-450 violations remaining (40-50 routes fixed)
  - Post-LANE_3: ~400-425 violations remaining (15-25 routes fixed)

**Next Required Action:**
- X2_LANE_1: Run scanner, verify ~20-30 violations removed
- X2_LANE_2: Run scanner, verify additional ~40-50 violations removed
- X2_LANE_3: Run scanner, verify additional ~15-25 violations removed
- G12 phase: Final reconciliation of remaining 300+ violations

---

### **G13** - Classification upgrade gate

**Status:** 🔴 **BLOCKED - PHASE SEQUENCE DEPENDENT**

**Summary:**
- G13 evaluates whether RUNTIME_ENFORCED_HYBRID can upgrade to pure canonical enforcement
- Requires G6-G12 completion and scanning validation
- Current classification: RUNTIME_ENFORCED_HYBRID (quarantined bridges present)
- Conditions for upgrade:
  - 32 quarantined bridges removed (LANE_3_CAPABILITY_MUTATION cleanup)
  - G6E-G11 migrations complete
  - ~400+ remaining violations are deferred patterns (LANE_4+)
  - Scanner confirms no illegitimate shadow reads in migrated routes

**Current State:**
- 32 quarantined bridges remain (not yet upgraded, still in transitional debt)
- Not ready for classification upgrade
- Requires: Lane 3 mutations + G11 CATEGORY_B + post-migration scanning

**Acceptance Criteria:**
- 🔴 BLOCKED until:
  1. ✅ G6E batch migration complete (20-30 routes)
  2. ✅ G7 capability read migration complete (40-50 routes)
  3. ✅ LANE_3_CAPABILITY_MUTATION cleanup (32 bridges + 15-25 mutations)
  4. ✅ G11 CATEGORY_B manual clearing complete
  5. ✅ Scanner reports <400 violations (deferred patterns only)
  6. ✅ No new illegitimate shadows in migrated routes

**Blocking Factors:**
- 32 quarantined bridges not yet removed → blocks pure canonical
- G6-G11 migrations incomplete → cannot verify clean state
- Deferred patterns (LANE_4+) may introduce new complexity

**Expected Timeline:**
- G13 gate: After X2_LANE_3 + post-migration reconciliation
- Likely outcome: Upgrade to PURE_CANONICAL_ENFORCEMENT (or defer if blockers found)

**Next Required Action:**
- Complete G6-G12 phases first
- Then execute G13 evaluation and classification decision

---

## Summary Table

| Phase | Status | Evidence | Blocker | Next Action |
|-------|--------|----------|---------|------------|
| G6D | ✅ COMPLETE | 3 routes migrated | None | Proceed to G6E |
| G6E | 🟡 PILOT DONE | Pattern validated | Full expansion pending | X2_LANE_1 (20-30 routes) |
| G6F | 🟡 PENDING | Pattern documented | G6E completion | X2_LANE_1 completion |
| G7 | 🟡 VALIDATED | Pilot routes working | Full expansion pending | X2_LANE_2 (40-50 routes) + X2_LANE_3 (mutations) |
| G8 | 🔴 DEFERRED | Not in routes (0 found) | Requires G8 audit | Schedule dedicated audit |
| G9 | 🔴 DEFERRED | Not detected (0 found) | Requires G9 audit | Schedule dedicated audit |
| G10 | 🔴 DEFERRED | Rare (1 found) | Requires G10 audit | Manual inspection, defer audit |
| G11 | 🔴 PENDING | Not yet classified | Requires code inspection | Post-Lane-2: run classifier |
| G12 | 🔴 PENDING | No migrations yet | Lanes 1-3 must complete | Post-Lane-3: verify violation reduction |
| G13 | 🔴 BLOCKED | 32 bridges remain | G6-G12 incomplete | Post-G12: evaluate upgrade gate |

---

## Critical Path for X1 to X2 Transition

### X1 Completion Criteria (Roadmap Reconciliation)
1. ✅ G6D status confirmed (3 routes done)
2. ✅ G6E/G6F pattern documented (recipe + estimation)
3. ✅ G7 pattern documented (capability read pattern + recipe)
4. ✅ G8-G11 phases mapped to future audits
5. ✅ G12-G13 sequence defined (dependent phases)

### X2 Execution Sequence (Lane-Based Migration)
1. X2_LANE_1: G6E completion (simple reads, 20-30 routes)
2. X2_LANE_2: G7 capability reads (40-50 routes)
3. X2_LANE_3: LANE_3_CAPABILITY_MUTATION (mutations + bridge cleanup, 15-25 routes)
4. Verify: Run scanner → confirm ~350-400 violations remain
5. G11: CATEGORY_B manual clearing
6. G12: Final violation reconciliation
7. G13: Classification gate decision

---

## Conclusion

**X1 Status: ✅ READY FOR X2 EXECUTION**

- G6D pilot proven
- G6E-G7 patterns documented
- 108 routes identified in migration matrix
- Lane structure defined
- 3 primary lanes identified (1, 2, 3) with clear recipes
- Deferred lanes (4-9) mapped to future audits
- G8-G11 require dedicated phases (not X1/X2 scope)
- Critical path clear: Execute Lane 1 → Lane 2 → Lane 3 in order

**No blockers for X1 completion. Ready to proceed to X2 lane-based migration.**
