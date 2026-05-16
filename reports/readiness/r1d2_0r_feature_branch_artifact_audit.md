# R1-D2-0R: Feature Branch Artifact Audit

**Date:** 2026-05-16  
**Phase:** R1-D2-0R (Feature Branch Diff Analysis)

---

## A. Branch Diff Summary

**Branches Compared:**
- Base: main (6479d8e - R1-D Closeout)
- Head: origin/claude/readiness-entry-audit-chIhF (1596e25 - R1-D2-0 Closeout)

**Total Files Different:** 94 files  
**Total Lines Changed:** ~2500 insertions, ~16000 deletions

---

## B. Diff Classification

### File Category Breakdown

| Category | Count | Nature | Classification |
|----------|-------|--------|-----------------|
| **Report Files (deleted old)** | ~40 files | R0, R1-0, R1-A, R1-B, R1-C reports | REPORT_ONLY |
| **Report Files (added new)** | 9 files | R1-D2-0 analysis + closeout reports | REPORT_ONLY |
| **Source Route Files** | 15 files | src/app/api/*/route.ts | SOURCE_ROUTE_CHANGE |
| **Scanner Artifact** | 1 file | shadow_read_violations.json | SCANNER_OUTPUT_ARTIFACT |
| **Service Files** | 0 files | src/services/* | NONE |
| **Auth Infrastructure** | 0 files | src/lib/auth-guard.ts, wrapper.ts | NONE |

---

## C. Report-Only Files (Safe to Merge)

### Newly Added R1-D2-0 Reports
✓ SAFE - These are analysis and planning documents

| File | Type | Size | Status |
|------|------|------|--------|
| r1d2_0_baseline_confirmation.md | Analysis | 86 lines | NEW |
| r1d2_0_deferred_clients_handler_audit.json | Analysis | 83 lines | NEW |
| r1d2_0_remaining_lane_classification.json | Analysis | 212 lines | NEW |
| r1d2_0_closeout_branch_reconciliation.md | Closeout | TBD | NEW |
| r1d2_0_closeout_main_baseline.md | Closeout | TBD | NEW |
| r1d2_0_next_phase_options.md | Closeout | TBD | NEW |
| r1d2_0_next_phase_decision.md | Closeout | TBD | NEW |
| r1d2_0_readiness_impact_update.md | Closeout | TBD | NEW |
| r1d2_0r_* (new reconciliation reports) | Closeout | TBD | NEW (THIS PHASE) |

### Deleted Old Reports
✓ SAFE - These are old artifacts being cleaned up

| Category | Count | Details |
|----------|-------|---------|
| R0 phase reports | 8 files | Readiness entry audit artifacts |
| R1-0 phase reports | 6 files | Governance planning artifacts |
| R1-A phase reports | 14 files | First batch artifacts (including fix reports) |
| R1-B phase reports | 7 files | Second batch artifacts |
| R1-C phase reports | 9 files | Third batch artifacts |
| R1-D phase reports | ~16 files | Fourth batch artifacts (older versions) |

**Total Deleted:** ~60 report files

---

## D. Scanner Output Artifact

**File:** shadow_read_violations.json  
**Classification:** SCANNER_OUTPUT_ARTIFACT

**Status on Feature Branch:**
- Updated at: 2026-05-16 21:01:25 UTC
- Shows: 360 total, 227 critical, 133 block-build
- This is the CURRENT artifact (from ongoing investigation)

**Status on Main:**
- Updated at: 2026-05-16 20:28:53 UTC
- Shows: 350 total, 219 critical, 131 block-build
- This is the R1-D CLOSURE artifact

**Assessment:** ⚠ Artifact is out of date between branches

---

## E. Source Code Route Changes (CRITICAL FINDINGS)

### Feature Branch Route Status

All 15 route files show LEGACY patterns (withEnforcementFull):

**Example: src/app/api/notifications/[id]/route.ts**

Feature Branch Code:
```typescript
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";

export const GET = withEnforcementFull(async (
  request: NextRequest,
  ctx,
  params
) => {
  await withAuth();
  // legacy pattern
})
```

### Main Route Status

All 15 route files show MODERN patterns (withCanonicalEnforcement):

**Same Route on Main:**
```typescript
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(async (
  ctx: CanonicalAuthContext,
  params: Record<string, string>
) => {
  // modern pattern
})
```

### Routes with Source Differences

| Route File | Main State | Feature Branch State | Difference |
|---|---|---|---|
| notifications/[id]/route.ts | Modern | Legacy | ✗ STALE |
| clients/[clientId]/route.ts | Modern (partial) | Legacy (older) | ✗ STALE |
| entitlement/quota/route.ts | Modern | Legacy | ✗ STALE |
| governance/alerts/route.ts | Modern | Legacy | ✗ STALE |
| growth/revenue-streams/route.ts | Modern | Legacy | ✗ STALE |
| observability/summary/route.ts | Modern | Legacy | ✗ STALE |
| operator/my-day/route.ts | Modern | Legacy | ✗ STALE |
| operator/myday/route.ts | Modern | Legacy | ✗ STALE |
| operator/queue/route.ts | Modern | Legacy | ✗ STALE |
| operator/route.ts | Modern | Legacy | ✗ STALE |
| owner/config/route.ts | Modern | Legacy | ✗ STALE |
| owner/dashboard/route.ts | Modern | Legacy | ✗ STALE |
| clients/[clientId]/contacts/[contactId]/route.ts | Legacy (intentional deferral) | Legacy (older version) | ✗ STALE |
| billing/upgrade/route.ts | Modern | Legacy | ✗ STALE |
| recommendations/[recommendationId]/route.ts | Modern | Legacy | ✗ STALE |

**Total Route Files with Source Differences:** 15 files  
**All Showing Same Pattern:** Feature branch STALE, Main MODERN

---

## F. Classification Summary

### Definitive Classifications

| Diff Type | File Count | Assessment | Merge Safety |
|-----------|-----------|------------|--------------|
| **REPORT_ONLY** | 69 files | R0-R1-D reports, all old or new analysis | ✓ SAFE |
| **SCANNER_OUTPUT_ARTIFACT** | 1 file | Divergence, but not source code | ⚠ CAUTION |
| **SOURCE_ROUTE_CHANGE** | 15 files | Feature branch HAS STALE routes (R1-A/B/C/D missing) | ✗ UNSAFE |
| **SERVICE_CHANGE** | 0 files | No service modifications | ✓ OK |
| **SCANNER_SOURCE_CHANGE** | 0 files | Scanner code not modified | ✓ OK |

---

## G. Root Cause: Why Are Routes Stale on Feature Branch?

### Timeline Reconstruction

**Scenario:** Feature branch diverged from main during development

1. **Initial State:** Both branches had legacy routes (withEnforcementFull)
2. **Main Development:** Routes were modernized in sequence (R1-A/B/C/D)
3. **Feature Branch:** Continued with older baseline, R1-D2-0 reports added on top
4. **Result:** Feature branch has new reports but stale source code

### Branching Hypothesis

- Feature branch created at some point with R1-A/B/C work
- Main was updated with R1-A/B/C/D implementation
- Feature branch diverged and added R1-D2-0 reports without merging R1-D
- Feature branch became: New reports + Old code = STALE state

---

## H. Merge Safety Assessment

### Can Feature Branch Be Merged Safely?

**Answer: NO - NOT AS IS**

**Reason:** Source code would revert to legacy patterns

**If we merged feature branch to main:**
1. Main's modern routes would be replaced with feature branch's legacy routes
2. All R1-D modernization would be undone
3. Scanner would increase violations back to ~390

**Required Before Merge:**
1. Feature branch needs to rebase/merge with main
2. This brings in the R1-D source changes
3. Reports stay on top
4. Then merge to main would include both source + reports

---

## I. Final Decision on Feature Branch

### Classification: SOURCE_DIFF_FOUND_STOP

**Status:** ✗ DO NOT MERGE FEATURE BRANCH AS IS

**Reason:** Branch contains outdated route source code

**What Should Happen:**
1. Feature branch should be rebased on main (to get R1-D source)
2. R1-D2-0 reports remain
3. Then feature branch becomes current and ready for R1-D2-A
4. Then reports can be copied to main

---

**Status: ✗ FEATURE BRANCH IS STALE - REBASE REQUIRED BEFORE MERGE**

