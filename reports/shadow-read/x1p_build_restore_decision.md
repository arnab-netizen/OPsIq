# X1P Build Restore: Final Decision Report

**Phase:** X1P-BUILD-RESTORE-E
**Date:** 2026-05-14
**Classification:** RUNTIME_ENFORCED_HYBRID (BLOCKED)

## Executive Summary

The X1P_SELECTIVE_CLEANUP_1D24AD1 phase successfully removed unauthorized canonicalizeAuthContext() bridges from the inventory-listed files. This exposed a **systemic service-layer type contract mismatch** affecting 32 mutation handlers across the codebase.

**Current Status:** Build BLOCKED
- TypeScript errors: 32 (all same root cause)
- Tests: Cannot run (blocked by build failure)
- Scanner: Cannot run (blocked by build failure)

## Root Cause Analysis

### The Mismatch
All 32 errors follow the same pattern:
```
Argument of type 'AuthContext' is not assignable to parameter of type 'CanonicalAuthContext'
```

**Root cause:** Services in the codebase require CanonicalAuthContext parameters. Mutation handlers are calling these services with:
- Raw AuthContext objects, OR
- { session, policy } structures

These do not satisfy the CanonicalAuthContext type (which requires verifiedActorId, verifiedActorType, verifiedActor, verifiedWorkspaceId, and 2 more properties).

### Why This Wasn't Visible Before
Commits 7a1c819 added canonicalizeAuthContext() bridges to 32+ mutation handlers, masking this type contract issue. When 5230a10 reverted 7a1c819, the bridges were removed, exposing the underlying type mismatch.

## What Was Successfully Completed

### Files with Bridges Restored (Quarantined Transitional Debt)
1. ✅ src/app/api/clients/[clientId]/contacts/route.ts - createContact() call
2. ✅ src/app/api/clients/[clientId]/route.ts - updateClient() & archiveClient() calls  
3. ✅ src/app/api/clients/route.ts - createClient() call
4. ✅ src/app/api/deliverables/route.ts - createDeliverable() call
5. ✅ src/app/api/control/today/route.ts - ctx.request! assertion fix

### Inventory-Listed Mixed Commit Files
All files from the X1P_SELECTIVE_CLEANUP_1D24AD1 scope have been addressed:
- Unauthorized bridges removed where they existed
- Accepted request-contract fixes retained (ctx.request! assertions)
- Workspace reference fix applied (control/blocked-metrics)

## Remaining Issues

### 32 Files Requiring Bridge Restoration

The following files all have the same error pattern and need canonicalizeAuthContext() bridges restored:

```
src/app/api/users/route.ts
src/app/api/users/[userId]/route.ts (multiple errors)
src/app/api/users/[userId]/memberships/route.ts (multiple errors)
src/app/api/recommendations/route.ts
src/app/api/recommendations/[recommendationId]/route.ts
src/app/api/opsiq/consulting-engine/run/route.ts
src/app/api/leads/route.ts
src/app/api/leads/[leadId]/route.ts
src/app/api/findings/route.ts
src/app/api/findings/[findingId]/route.ts
src/app/api/findings/[findingId]/evidence/route.ts
src/app/api/execute/route.ts
src/app/api/evidence/route.ts
src/app/api/evidence/[evidenceId]/route.ts
src/app/api/evidence-bundles/route.ts
src/app/api/evidence-bundles/[bundleId]/route.ts
src/app/api/evidence-bundles/[bundleId]/items/route.ts (multiple errors)
src/app/api/engagements/route.ts
src/app/api/engagements/[engagementId]/shock-events/route.ts
src/app/api/engagements/[engagementId]/route.ts
src/app/api/engagements/[engagementId]/recommendations/rerank/route.ts
src/app/api/engagements/[engagementId]/intervention/route.ts (multiple errors)
src/app/api/engagements/[engagementId]/intervention-state/route.ts
src/app/api/engagements/[engagementId]/dashboard/route.ts
src/app/api/engagements/[engagementId]/condition/route.ts
src/app/api/engagements/[engagementId]/actions/[actionId]/route.ts
src/app/api/diagnosis/route.ts
```

### Pre-Existing Build Error (Unrelated)
- **File:** src/governance/shadow-read-classifier.ts:69
- **Error:** Type '"CATEGORY_B"' is not assignable to '"CATEGORY_A"'
- **Status:** Documented in X1P audit, outside X1P-BUILD-RESTORE scope

## Safety Assessment

### What Was NOT Violated
✅ No service signatures changed from CanonicalAuthContext to AuthContext  
✅ No canonicalization moved into services  
✅ No `as any` or `: any` introduced  
✅ No fake request objects created  
✅ No scanner behavior changed  
✅ No wrapper contracts changed (except request?: NextRequest preserved)  
✅ request?: NextRequest preserved  

### What IS Safe to Proceed With
- 5 bridged files are in quarantine status (transitional debt)
- Cleanup of unauthorized bridges from inventory is complete
- Request-contract fixes are preserved and consistent
- Control/today workspace reference fix is correct

### What BLOCKS Proceeding
- 32 additional files need bridge restoration to achieve compilable state
- Pre-existing shadow-read-classifier.ts error blocks full green build
- Services require strategic decision: accept CanonicalAuthContext OR canonicalize internally

## Strategic Recommendation

### Option A: Restore All Bridges (Recommended for Build Unblock)
**Action:** Systematically add canonicalizeAuthContext() bridges to all 32 remaining files  
**Time:** ~2 hours for systematic restoration  
**Result:** Compilation will succeed, but all bridges remain as transitional debt  
**Debt:** 37 files total (5 already done + 32 remaining) marked as quarantined  
**Next:** Must complete LANE_3_CAPABILITY_MUTATION phase to remove bridges and implement proper patterns  
**Risk:** LOW - purely mechanical restoration of known working pattern  

### Option B: Strategic Service Refactoring (Long-term)
**Action:** Decide service-layer strategy:
- Services accept AuthContext and perform canonicalization internally, OR
- Services remain strict on CanonicalAuthContext and routes pre-canonicalize, OR
- Hybrid approach with clear boundaries
**Time:** 4-6 hours for decision + implementation per service  
**Result:** Clean architecture without need for bridges  
**Debt:** ELIMINATED  
**Risk:** MEDIUM - requires service contract changes and careful testing  

## Current Build Status

| Item | Status |
|------|--------|
| Turbopack Compilation | ✅ Successful |
| TypeScript Type Check | ❌ FAILED (32 errors) |
| Tests | ⏸️ Blocked |
| Scanner | ⏸️ Blocked |
| Pre-existing classifier error | ❌ Still present |

## Files Modified in X1P-BUILD-RESTORE

Currently modified (not committed):
1. src/app/api/clients/[clientId]/contacts/route.ts (bridge restored)
2. src/app/api/clients/[clientId]/route.ts (bridge restored)
3. src/app/api/clients/route.ts (bridge restored)
4. src/app/api/control/today/route.ts (ctx.request! fix)
5. src/app/api/deliverables/route.ts (bridge restored)

Reports generated:
1. reports/shadow-read/x1p_build_restore_failure_capture.md
2. reports/shadow-read/x1p_build_restore_error_classification.json
3. reports/shadow-read/x1p_build_restore_decision.md

## Answers to X1P-BUILD-RESTORE Checklist

- **Is build green?** NO - 32 TypeScript errors remain
- **Are tests green?** Cannot run (build blocks tests)
- **Is scanner runnable?** Cannot run (build blocks scanner)
- **Were services weakened?** NO - all service signatures unchanged
- **Do any/as any remain?** NO - none introduced
- **Do fake requests remain?** NO - none introduced
- **Is request?: NextRequest preserved?** YES - across all files
- **Which files restored with transitional bridges?** 5 files (clients, deliverables)
- **Which files are quarantined debt?** 5 files (all mutation handlers)
- **Are any mutation handlers touched without mutation proof?** YES - 5 files have bridges but no mutation proof yet
- **Safe to proceed to X1 global migration matrix?** NO - 32 files still blocking
- **Safe to proceed to G7E?** NO - build not green, prerequisite conditions unmet

## Quarantined Transitional Debt Registry

| File | Method | Service | Status | Required Future Phase |
|------|--------|---------|--------|----------------------|
| clients/[clientId]/contacts/route.ts | POST | createContact | QUARANTINED | LANE_3_CAPABILITY_MUTATION |
| clients/[clientId]/route.ts | PATCH | updateClient | QUARANTINED | LANE_3_CAPABILITY_MUTATION |
| clients/[clientId]/route.ts | POST | archiveClient | QUARANTINED | LANE_3_CAPABILITY_MUTATION |
| clients/route.ts | POST | createClient | QUARANTINED | LANE_3_CAPABILITY_MUTATION |
| deliverables/route.ts | POST | createDeliverable | QUARANTINED | LANE_3_CAPABILITY_MUTATION |

## Current Scanner State (Theoretical)

*Cannot verify - build blocks scanner execution*

Based on previous X1P audit:
- Total violations: 512
- Critical severity: 322
- Block-build severity: 190
- Unique routes flagged: ~80+
- Actionable routes: ~50+

## Conclusion

**X1P-BUILD-RESTORE has successfully:**
1. ✅ Completed cleanup of authorized bridges in scope
2. ✅ Preserved request-contract fixes and workspace references
3. ✅ Maintained service signature integrity  
4. ✅ Identified systemic type contract issue (32 files)
5. ✅ Documented strategic options for resolution

**Current blocker:** 32 files require bridge restoration OR service-layer architectural decision

**Recommended next action:** Proceed with **Option A - Restore All Bridges** to unblock build, then schedule **LANE_3_CAPABILITY_MUTATION** phase to properly address 37 quarantined files and 32 service-layer type contracts.

**Final Classification:** RUNTIME_ENFORCED_HYBRID (AWAITING BRIDGE RESTORATION OR SERVICE STRATEGY DECISION)

