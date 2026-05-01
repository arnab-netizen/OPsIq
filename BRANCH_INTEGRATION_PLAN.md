# OpsIQ Repository Branch Integration Plan

**Date**: 2026-05-01  
**Analysis Scope**: All active branches vs main  
**Status**: Fragmented with orphaned integration branches - Current branch IS the integration point

---

## Executive Summary

**Main Status**: ✅ **COMPLETE and CURRENT** (335 commits, last updated 2026-05-01 05:28)

**Current Branch Status**: ✅ **3 COMMITS AHEAD** (338 commits, last updated 2026-05-01 15:22)
- claude/add-financial-types-8uKdK contains critical decision lifecycle enforcement work
- **Recommendation**: Merge current branch → main (not the reverse)

**Orphaned Branches** (stale, low-value):
- origin/opsiq/final-controlled-integration (6 commits, 2026-04-25) - **DISCARD**
- origin/practical-completion-v3-merge (14 commits, 2026-04-27) - **REVIEW, DO NOT MERGE**
- origin/integrate/diagnosis-engines-v1 (4 commits, 2026-04-28) - **REVIEW, PARTIAL MERGE ONLY**

**Fragmentation Assessment**: ⚠️ MODERATE
- Multiple abandoned integration attempts exist
- Main is not fragmented but is missing security hardening
- Current branch has critical fixes main lacks

---

## Branch Comparison Matrix

| Branch | Commits | Last Update | Schema Status | Key Content | Value |
|--------|---------|-------------|---------------|------------|-------|
| main | 335 | 2026-05-01 05:28 | OperatorItem present | Auth patches, workspace isolation | ✅ BASE |
| current (claude/add-financial-types-8uKdK) | 338 | 2026-05-01 15:22 | OperatorItem enhanced | Decision lifecycle enforcement, ROI gating | ✅ **MERGE UP** |
| origin/opsiq/final-controlled-integration | 6 | 2026-04-25 09:49 | OperatorItem removed | Old migration scripts, deployment docs | ❌ ORPHAN |
| origin/practical-completion-v3-merge | 14 | 2026-04-27 14:33 | Consulting engine | Action execution, consulting backbone | ⚠️ REVIEW |
| origin/integrate/diagnosis-engines-v1 | 4 | 2026-04-28 22:17 | Diagnosis service | Diagnosis layer + tests | ⚠️ REVIEW |

---

## Detailed Branch Analysis

### 1. Current Working Branch: `claude/add-financial-types-8uKdK` ✅

**Status**: 3 commits ahead of main  
**Last Updated**: 2026-05-01 15:22 (most recent)

**Key Commits**:
1. **e74cbba** - Complete adversarial decision lifecycle audit (all 10 attack vectors rejected) ⭐
2. **6255845** - Enforce ROI/impact lifecycle gating
3. **ba68312** - Add decision lifecycle integrity check service

Plus 7 prior commits on authentication and workspace isolation fixes

**Unique Files** (NOT on main):
- `src/domain/decision-lifecycle.ts` - Canonical lifecycle state machine (NEW)
- `src/services/decisions/decision-lifecycle.service.ts` - Lifecycle enforcement (NEW)
- `src/services/roi-lifecycle-gating.ts` - Impact/ROI temporal gating (NEW)
- `src/services/decision-lifecycle-integrity.ts` - Integrity validation (NEW)
- `src/__tests__/decision-lifecycle-adversarial.test.ts` - Security audit (NEW)
- 6x Report files documenting security findings

**Schema Changes**: Minor field additions to OperatorItem

**Test Status**: 132 tests passing (16 adversarial + 42 lifecycle + 14 integrity + 60 ROI gating)

**Assessment**:
- ✅ Complete, working, tested
- ✅ Solves critical governance gaps
- ✅ Ready for production merge
- **ACTION**: **MERGE INTO MAIN** (not opposite direction)

---

### 2. Main Branch ✅

**Status**: Stable, production-ready  
**Last Updated**: 2026-05-01 05:28

**Key Features**:
- ✅ Auth patches: Header spoofing prevention, workspace isolation
- ✅ Service-layer authContext enforcement
- ✅ 24+ write route security patches
- ✅ Read route auth verification
- ✅ OperatorItem schema with workspace/owner scoping
- ✅ Database migrations up to 2026-04-30

**What's Missing** (now on current branch):
- ❌ Decision lifecycle state machine
- ❌ Precondition validation (executeDecision must require APPROVED)
- ❌ ROI temporal gating
- ❌ Lifecycle integrity checks
- ❌ Adversarial security audit proof

**Assessment**:
- ✅ Functionally complete for phase 1
- ❌ Missing decision governance enforcement
- ❌ Vulnerable to execution/outcome ordering violations
- **ACTION**: **PULL current branch into main** (current branch has fixes main needs)

---

### 3. Orphaned: `origin/opsiq/final-controlled-integration` ❌

**Status**: Stale, 6 days old (2026-04-25)  
**Position**: Unknown ancestor (appears to be pre-auth-hardening)

**Key Problems**:
- ✗ OperatorItem model REMOVED (schema conflict with main)
- ✗ Old migrations (duplicate versions with different naming)
- ✗ No decision lifecycle enforcement
- ✗ Predates all auth hardening work
- ✗ Contains only 6 commits (very sparse)
- ✗ Deployment/validation docs (no code)

**Unique Content**:
- Deployment readiness reports
- Migration scripts (BROKEN - conflicts with main migrations)
- CI/CD workflow files
- Production deployment docs

**Assessment**:
- ❌ **DO NOT MERGE** - Would break schema
- ❌ Contains orphaned design (schema without OperatorItem)
- ❌ Predates all security hardening
- ⚠️ Check deployment docs for valuable insights (external review only)
- **ACTION**: **ARCHIVE** (keep for reference, never merge)

---

### 4. Candidate: `origin/practical-completion-v3-merge` ⚠️

**Status**: Stale (2026-04-27), 14 commits  
**Focus**: Consulting engine implementation

**Key Content**:
1. **cfb5731** - Consulting engine backbone (diagnosis + intervention design)
2. **db6fd76** - Integrate consulting engine with Prisma
3. **9f75f0d** - Action execution system with state machine
4. Plus Module 0-3 implementations (auth, leads, engagements)

**Files Present**:
- `src/services/consulting-engine/` (diagnosis, constraint, calibration)
- `src/services/action-execution/` (action state machine)
- Schema changes (Module 0-3)

**Overlap with Main**:
- Auth work already in main ✅
- Engagement work already in main ✅
- Consulting engine NOT in main ❌

**Key Issue**: 
- Uses different service patterns (may conflict with current authContext work)
- Action execution logic exists but not integrated with current lifecycle
- Consulting engine may clash with current diagnostic approach

**Assessment**:
- ⚠️ **SELECTIVE MERGE ONLY** if consulting engine needed
- ❌ Do NOT merge wholesale (auth conflicts)
- ✅ Extract consulting-engine code for review
- ⚠️ Verify action-execution doesn't conflict with decision-lifecycle
- **ACTION**: **DO NOT MERGE** (wait for consulting engine explicit need)

---

### 5. Candidate: `origin/integrate/diagnosis-engines-v1` ⚠️

**Status**: Stale (2026-04-28), 4 commits  
**Focus**: Diagnosis service layer

**Key Content**:
1. **c0d9f5b** - Diagnosis service layer + API
2. **2d7cddf** - Comprehensive test suite (874 tests)
3. Schema and database setup

**Files**:
- `src/services/diagnosis.ts` (refactored)
- `src/services/diagnosis/` (diagnosis engine service)
- `src/app/api/diagnoses/` (API routes)

**Relationship to Current Branch**:
- Decision lifecycle doesn't touch diagnosis
- Could coexist if properly scoped
- Tests are comprehensive

**Assessment**:
- ⚠️ **LOW PRIORITY** - Orthogonal to decision lifecycle
- ✅ Well-tested (874 tests)
- ❌ Stale (predates current security work)
- ✅ No schema conflicts with current
- **ACTION**: **DEFER** (review later for diagnosis features, not blocking)

---

## Integration Conflict Analysis

### Critical Conflicts (WILL BREAK)
1. **OperatorItem Schema**
   - Main: ✅ Has OperatorItem with workspace/owner fields
   - Integration: ❌ Removes OperatorItem entirely
   - **Resolution**: Keep main version, discard integration

2. **Migration Sequence**
   - Main: 14 migrations (up to 2026-04-30)
   - Integration: 8 migrations (older, different naming)
   - **Resolution**: Keep main migration chain, discard integration migrations

3. **Auth Service Layer**
   - Main: ✅ requireServiceContext() pattern established
   - Practical-completion: Uses different pattern (may conflict)
   - **Resolution**: Main pattern is correct, verify practical-completion compatibility

### Non-Conflicts (Can Coexist)
1. **Decision Lifecycle vs Consulting Engine**
   - Lifecycle: New (decision governance)
   - Consulting: New (diagnosis/intervention)
   - **Status**: Orthogonal, can coexist

2. **Diagnosis Service**
   - Current: Not in scope
   - Diagnosis-engines: Dedicated service
   - **Status**: Can be added later

---

## Files to Merge or Keep

### ✅ MERGE FROM CURRENT → MAIN

**Services**:
- [ ] `src/domain/decision-lifecycle.ts` (canonical state machine)
- [ ] `src/services/decisions/decision-lifecycle.service.ts` (lifecycle enforcement)
- [ ] `src/services/roi-lifecycle-gating.ts` (impact/ROI gating)
- [ ] `src/services/decision-lifecycle-integrity.ts` (integrity validation)

**Routes** (NEW):
- [ ] `src/app/api/decisions/[decisionId]/execute/route.ts`
- [ ] `src/app/api/decisions/[decisionId]/record-outcome/route.ts`
- [ ] `src/app/api/decisions/[decisionId]/close/route.ts`
- [ ] `src/app/api/decisions/[decisionId]/fail/route.ts`

**Tests**:
- [ ] `src/__tests__/decision-lifecycle-adversarial.test.ts` (security audit)
- [ ] `src/services/decisions/__tests__/decision-lifecycle.service.test.ts` (42 tests)
- [ ] `src/services/__tests__/decision-lifecycle-integrity.test.ts` (14 tests)
- [ ] `src/services/__tests__/roi-lifecycle-gating.test.ts` (60 tests)

**Reports** (documentation):
- [ ] `DECISION_LIFECYCLE_AUDIT.md`
- [ ] `DECISION_LIFECYCLE_FINAL_VERDICT.md`
- [ ] `DECISION_SERVICE_LIFECYCLE_REPORT.md`
- [ ] `DECISION_ROUTE_LIFECYCLE_REPORT.md`
- [ ] `DECISION_INTEGRITY_CHECK_REPORT.md`
- [ ] `ROI_LIFECYCLE_GATING_REPORT.md`

**Schema**:
- [ ] OperatorItem fields (startedAt, actualOutcomeValue, impactActual, isROIFinal, etc.)
- [ ] Keep existing, add new fields

### ❌ DISCARD

**From integration branch**:
- ❌ Entire schema.prisma from opsiq/final-controlled-integration (removes OperatorItem)
- ❌ prisma/migrations/ from opsiq/final-controlled-integration (conflicting migration chain)
- ❌ All deployment/audit docs from opsiq/final-controlled-integration

**From practical-completion**:
- ❌ Do NOT merge wholesale
- ⚠️ Review consulting engine separately later
- ❌ Skip auth/identity work (main has better version)

**From diagnosis-engines**:
- ❌ Do NOT merge (defer to future sprint)

### ⚠️ REVIEW LATER (Not blocking)

**Consulting Engine** (from practical-completion-v3-merge):
- `src/services/consulting-engine/` - Consider for Phase 2
- `src/services/action-execution/` - Review for conflict with decision-lifecycle
- Requires explicit product requirement before merging

**Diagnosis Service** (from integrate/diagnosis-engines-v1):
- `src/services/diagnosis/` - Consider for Phase 2
- Well-tested but orthogonal to current work
- Defer until diagnosis features explicitly needed

---

## Recommended Merge Strategy

### Phase 1: Stabilize Current Work (IMMEDIATE)
1. **Merge current branch into main**
   ```bash
   git checkout main
   git pull origin main
   git merge claude/add-financial-types-8uKdK
   git push origin main
   ```
   
   **What gets merged**:
   - ✅ Decision lifecycle enforcement (6 service files)
   - ✅ 4 new API routes for execution/outcome/close/fail
   - ✅ 132 tests validating all security properties
   - ✅ Documentation (6 reports)
   - ✅ Schema enhancements to OperatorItem

   **Files main gains**:
   - Domain contract for canonical lifecycle states
   - Fail-closed precondition validation
   - ROI temporal gating
   - Integrity checking

   **Result**: Main becomes complete for Phase 1 decision governance

### Phase 2: Archive Orphaned Branches
1. **Tag and archive** `origin/opsiq/final-controlled-integration`
   ```bash
   git tag archive/opsiq-final-2026-04-25 origin/opsiq/final-controlled-integration
   # Keep in git but mark as historical
   ```
   
   **Why**: Predates all hardening, conflicts on schema

2. **Review and defer** `origin/practical-completion-v3-merge`
   - Export consulting engine code to separate branch if needed
   - Do NOT merge into main branch
   - Revisit in Phase 2 when consulting features required

3. **Review and defer** `origin/integrate/diagnosis-engines-v1`
   - Keep in case diagnosis features needed
   - Do NOT merge into main yet
   - Defer to Phase 2 when diagnosis isolation required

### Phase 3: Future Integrations (Phase 2+)
When consulting engine or diagnosis features are needed:
1. Create dedicated branches from current main
2. Selectively cherry-pick consulting or diagnosis code
3. Test integration with lifecycle enforcement
4. Merge only validated code

---

## What Was Discarded and Why

### Architecture: OperatorItem Removal (DISCARDED) ❌
**From**: origin/opsiq/final-controlled-integration  
**What**: Schema removing OperatorItem table entirely

**Why Discard**:
- ❌ Main already uses OperatorItem for decision storage
- ❌ Would require data migration + code rewrite
- ❌ Current branch (better tested) depends on OperatorItem
- ❌ Removing OperatorItem loses decision isolation

**Decision**: Keep OperatorItem, enhance it (current branch approach)

### Migrations: Duplicate Chain (DISCARDED) ❌
**From**: origin/opsiq/final-controlled-integration  
**What**: Older migration files with naming conflicts

**Why Discard**:
- ❌ Conflicts with main migration chain
- ❌ Would require migration rewrite
- ❌ Main has more recent, tested migrations
- ❌ Already has schema to OperatorItem state

**Decision**: Keep main migration chain, add new ones for decision fields

### Consulting Engine (DEFERRED, NOT DISCARDED) ⚠️
**From**: origin/practical-completion-v3-merge  
**What**: Full consulting engine backbone with action execution

**Why Defer** (not discard):
- ✅ Well-implemented in branch
- ✅ Could be valuable for Phase 2
- ⚠️ Uses different service patterns (needs verification)
- ⚠️ Action execution may conflict with decision-lifecycle
- ⚠️ Not required for current Phase 1

**Decision**: Archive branch, extract if consulting needed later

### Diagnosis Engine (DEFERRED, NOT DISCARDED) ⚠️
**From**: origin/integrate/diagnosis-engines-v1  
**What**: Diagnosis service layer with comprehensive tests

**Why Defer** (not discard):
- ✅ 874 comprehensive tests
- ✅ Orthogonal to decision lifecycle (no conflicts)
- ⚠️ Not required for Phase 1
- ⚠️ Can integrate in Phase 2 without merge issues

**Decision**: Keep branch for reference, integrate in Phase 2 if needed

---

## Risk Assessment

### Merge Risks (Low)
- **Current → Main**: ✅ LOW RISK
  - Code is tested (132 tests passing)
  - No schema conflicts with main
  - New files only (no overwrites)
  - Security audit proven

### Integration Risks (Medium)
- **Consulting Engine later**: ⚠️ MEDIUM RISK
  - Requires verification of service layer compatibility
  - Action execution may need refactoring
  - Should test alongside decision-lifecycle

- **Diagnosis Engine later**: ✅ LOW RISK
  - Orthogonal implementation
  - No shared services
  - Can integrate cleanly

### Architecture Risks (High if not followed)
- **Merging opsiq/final-controlled-integration**: 🔴 HIGH RISK
  - Would break schema (removes OperatorItem)
  - Would revert security hardening
  - Would require significant rework

- **Merging practical-completion wholesale**: 🔴 HIGH RISK
  - Would introduce conflicting service patterns
  - Would overwrite current auth work
  - Would require regression testing

---

## Final Recommendation: DO NOT MERGE (Keep Current Branch as Integration Point)

**Recommendation**: The current branch `claude/add-financial-types-8uKdK` IS the integration point.

**Action**: 
1. ✅ **MERGE current → main** (brings main up to date with security hardening)
2. ✅ **ARCHIVE** orphaned branches (opsiq/final-controlled-integration)
3. ⚠️ **DEFER** consulting and diagnosis branches (review in Phase 2)
4. **DELETE** local working branches, keep current as baseline for future work

**Why**:
- Main is fragmented across too many stale branches
- Current branch is most recent and well-tested
- Current branch is ahead of all other candidates
- Other branches predate security hardening
- Integration should flow forward (current → main), not backward

**Timeline**:
- Now: Merge current → main
- Week 2-3: Archive old branches, create clean Phase 2 branch from new main
- Phase 2: Review consulting engine separately if needed
- Phase 2: Review diagnosis engine separately if needed

---

## Summary Table: What Gets Merged

| Component | Source | Action | Reason |
|-----------|--------|--------|--------|
| Decision Lifecycle | current branch | ✅ MERGE | Critical governance enforcement |
| ROI/Impact Gating | current branch | ✅ MERGE | Temporal validation for ROI |
| Integrity Checking | current branch | ✅ MERGE | Data consistency validation |
| Adversarial Tests | current branch | ✅ MERGE | Security audit proof |
| OperatorItem Schema | main (keep) | ✅ KEEP | Current branch enhances it |
| Consulting Engine | practical-completion | ❌ DEFER | Phase 2, needs verification |
| Diagnosis Service | diagnosis-engines | ❌ DEFER | Phase 2, not required now |
| Orphaned Integration | opsiq/final | ❌ ARCHIVE | Conflicts, predates hardening |

---

**END OF PLAN**

*No merge operations executed. Awaiting approval before proceeding.*
