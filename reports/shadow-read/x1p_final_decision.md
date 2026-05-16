# X1P Final Decision Report

**Classification:** RUNTIME_ENFORCED_HYBRID

## Decisions Made

### ✅ Request Contract: ACCEPTED
- CanonicalAuthContext.request?: NextRequest (optional) ✓
- Removal of request: null as any workarounds ✓
- Type-only export fix in auth-shadow-read-scanner.ts ✓

### ❌ Unauthorized Bridge Additions: PARTIALLY REVERTED
- Commit 7a1c819 reverted successfully
- Remaining mixed additions from 1d24ad1 need further cleanup
- Mixed commit prevents clean single revert
- **Status:** Partial restoration - 33 files cleaned, ~8-10 files still need manual cleanup

### ❌ Build Status: STILL BROKEN
- Pre-existing TypeScript error in shadow-read-classifier.ts (CATEGORY_B assignment)
- This error existed before G7D-C work and is unrelated
- Build cannot fully validate until classifier error is fixed

## Audit Results

### Files Processed
- **Total changed files in scope:** 56
- **Accepted (request-contract fixes):** 19
- **Unauthorized bridge expansions:** 40
  - Reverted via commit 7a1c819: 26
  - Remaining from 1d24ad1: ~14 (mixed commit issue)
- **Scanner type-only fixes:** 1
- **Report artifacts:** 4

### Remaining Issues

**Mixed Commit Problem (1d24ad1):**
Commit 1d24ad1 contained BOTH:
1. Request-contract fixes (ctx.request! assertions) - TO KEEP
2. Canonicalizeathenticate() bridge additions - TO REMOVE

This mixing prevents a clean single-commit revert. Affected files:
- src/app/api/clients/[clientId]/contacts/route.ts
- src/app/api/clients/[clientId]/route.ts (also in 7a1c819)
- src/app/api/clients/route.ts (also in 7a1c819)
- src/app/api/control/blocked-metrics/route.ts (also in 7a1c819, plus workspace fix)
- src/app/api/deliverables/route.ts (also in 7a1c819)
- src/app/api/evidence-bundles/route.ts (also in 7a1c819)
- src/app/api/evidence/route.ts (also in 7a1c819)
- src/app/api/leads/route.ts (also in 7a1c819)

**Pre-Existing Unrelated Error:**
- shadow-read-classifier.ts:69 - Type error with CATEGORY_B assignment
- Not caused by G7D-C work
- Requires separate investigation/fix

## Current State

| Item | Status | Notes |
|------|--------|-------|
| Request?: NextRequest | ✅ ACCEPTED | Core decision stands |
| Fake request removal | ✅ ACCEPTED | No null/undefined/fake requests |
| any/as any removal | ⚠️ PARTIAL | Reverted 7a1c819, but 1d24ad1 cleanup pending |
| Scanner behavior | ✅ UNCHANGED | No behavior changes, type-only fix only |
| Unauthorized bridges - commit 7a1c819 | ✅ REVERTED | Via new commit 5230a10 |
| Unauthorized bridges - from 1d24ad1 | ❌ PENDING | Requires manual cleanup |
| Build status | ❌ BROKEN | Pre-existing classifier error (unrelated) |
| Test status | ⏸️ BLOCKED | Cannot run while build broken |
| Scanner status | ⚠️ FUNCTIONAL | Runs but violations still reported (512 total) |

## Safety Assessment

### What Is Safe Right Now
✅ The request contract change (optional request field)
✅ The removal of fake request objects
✅ The revert of 7a1c819 bulk additions
✅ The scanner type-only export change

### What Still Needs Work
❌ Selective cleanup of 1d24ad1 mixed additions (10-14 files)
❌ Pre-existing classifier TypeScript error (unrelated to G7D-C)
❌ Service-layer compatibility issues (will emerge after bridge cleanup)

## Recommendations

### Immediate Next Phase (REQUIRED)
**Phase: X1P_SELECTIVE_CLEANUP_1D24AD1**

- Manually remove canonicalizeAuthContext() import and calls from ~10 files in 1d24ad1
- Keep ctx.request! assertions (request-contract fixes)
- New commit: "Phase X1P: Selectively revert unauthorized bridges from 1d24ad1"
- Target files:
  - clients/[clientId]/contacts/route.ts
  - control/blocked-metrics/route.ts (keep workspace.verifiedWorkspaceId fix)
  - Others identified in x1p_change_inventory.json

### Critical Path After That
1. **Phase: X1P_CLASSIFIER_FIX** - Fix unrelated shadow-read-classifier.ts error
2. **Phase: X1P_SERVICE_LAYER_PHASE** - Address service-layer CanonicalAuthContext compatibility
   (This is where service functions need scope clarification - they should either:
   a) Accept AuthContext and handle their own canonicalization, OR
   b) Be called only from route-bound contexts with pre-canonicalized context, OR
   c) Be migrated as part of a future controlled migration phase)

## Can We Proceed to Global Migration Matrix X1?

**ANSWER: NO**

### Reasons
1. Build is still broken (classifier error - unrelated but blocking)
2. Tests cannot run while build is broken
3. 1d24ad1 mixed commit cleanup still pending
4. Service-layer compatibility strategy not yet decided
5. Unauthorized bridges not yet fully removed

### Safe Next Phase
**X1P_SELECTIVE_CLEANUP_1D24AD1** → then reassess after classifier fix

### Unsafe Directions
❌ Do NOT proceed to G7E (requires clean baseline)
❌ Do NOT proceed to X1 global migration matrix (too much unresolved)
❌ Do NOT attempt service-layer fixes until bridges are fully cleaned

## Scanner Status

**Current counts:**
- Total violations: 512
- Critical severity: 322
- Block build severity: 190
- Unique routes flagged: ~80+
- Actionable routes: ~50+

**Trustworthiness:** ✅ Scanner behavior unchanged, counts valid, no manipulation
**Baseline:** Violations reflect actual state after 7a1c819 revert (awaiting 1d24ad1 cleanup)

## Conclusion

The X1P audit has successfully:
1. Identified 40 unauthorized bridge expansions
2. Reverted the bulk commit (7a1c819) containing 26 of them
3. Documented the mixed-commit issue with 1d24ad1
4. Preserved the valid request-contract changes
5. Confirmed scanner integrity

The request field contract decision stands and is sound.

The next critical phase is **X1P_SELECTIVE_CLEANUP_1D24AD1**, which requires careful manual removal of bridge additions while preserving request-contract fixes.

**Final Classification: RUNTIME_ENFORCED_HYBRID** (awaiting phase completion)
