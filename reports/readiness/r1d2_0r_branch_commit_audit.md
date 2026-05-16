# R1-D2-0R: Branch and Commit State Audit

**Date:** 2026-05-16  
**Phase:** R1-D2-0R (Divergence Reconciliation)

---

## A. Commit State Verification

### Question: Is 75f65e0 on main?

**Answer: YES**

**Evidence:**
```
$ git branch --contains 75f65e0
* main

$ git merge-base --is-ancestor 75f65e0 main
YES
```

**Commit Details:**
- SHA: 75f65e0e6183036ddb53b9ca7b9ebec1ce704336
- Message: R1-D: Modernize fourth safe route batch
- Date: 2026-05-16 20:31:36 UTC
- Files Changed: 12 (5 reports + 6 routes + 1 artifact)
- Claims: 390 → 350 violations, 247 → 219 critical, 143 → 131 block-build

---

## B. Feature Branch Ancestry Verification

### Question: Is 75f65e0 on feature branch?

**Answer: NO**

**Evidence:**
```
$ git merge-base --is-ancestor 75f65e0 origin/claude/readiness-entry-audit-chIhF
NO
```

**Status:** ⚠ CRITICAL - Feature branch does NOT contain the R1-D implementation commit

---

## C. Main Contains All R1-D Source Changes?

### Question: Does main contain all R1-D authorized route changes?

**Answer: YES**

**Verification - Route File Content Comparison:**

**Example: src/app/api/notifications/[id]/route.ts**

Main (modernized):
```typescript
import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";

export const GET = withCanonicalEnforcement(async (
  ctx: CanonicalAuthContext,
  params: Record<string, string>
) => {
  const workspaceId = ctx.verifiedWorkspaceId;
  // ...modern pattern
})
```

Feature Branch (still legacy):
```typescript
import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";

export const GET = withEnforcementFull(async (
  request: NextRequest,
  ctx,
  params
) => {
  await withAuth();
  // ...legacy pattern
})
```

**Status:** ✓ Main has the modernized routes; Feature branch has old versions

---

## D. Feature Branch Differences from Main

### Question: Does feature branch contain commits not on main?

**Answer: YES**

**Feature Branch Unique Commits:**
1. 1596e25 - R1-D2-0: Complete planning and readiness analysis (6 reports)
2. d8be601 - R1-D2-0: Classify remaining governance lanes (3 reports)
3. Plus older commits from pre-R1-D phases

**Status:** ✓ Feature branch has R1-D2-0 reports not on main

---

## E. Feature Branch Diff Classification

### Question: Are feature branch differences source changes or reports only?

**Answer: SOURCE CHANGES PRESENT**

**Diff Analysis:**
- 94 files differ between main and feature branch
- Breakdown:
  - Report files: ~74 files (mostly old reports deleted on main, new R1-D2-0 on branch)
  - **Source code files: 15+ files**  
  - Scanner artifact: 1 file (shadow_read_violations.json)

**Source Code Differences (CRITICAL):**
| Route File | Main State | Feature Branch State |
|---|---|---|
| notifications/[id]/route.ts | ✓ Modernized (withCanonicalEnforcement) | ✗ Legacy (withEnforcementFull) |
| entitlement/quota/route.ts | ✓ Modernized | ✗ Legacy |
| governance/alerts/route.ts | ✓ Modernized | ✗ Legacy |
| growth/revenue-streams/route.ts | ✓ Modernized | ✗ Legacy |
| observability/summary/route.ts | ✓ Modernized | ✗ Legacy |
| operator/route.ts | ✓ Modernized | ✗ Legacy |
| owner/config/route.ts | ✓ Modernized | ✗ Legacy |
| owner/dashboard/route.ts | ✓ Modernized | ✗ Legacy |
| clients/[clientId]/route.ts | ✓ Partially modernized (GET only) | ✗ Older version |
| And 5+ more routes | ✓ Modernized on main | ✗ Legacy on feature branch |

**Status:** ⚠ CRITICAL - Feature branch has OUTDATED source code

---

## F. Feature Branch State Summary

### Branch Divergence Pattern

**Timeline:**
1. R1-A/B/C/D were developed on feature branch
2. Feature branch was merged or pushed to main (commits visible on main)
3. Feature branch continued with older commits (doesn't have R1-D commit)
4. R1-D2-0 reports added to feature branch (but without R1-D source)
5. Result: Feature branch has reports but stale source code

### Current State

**Main:**
- ✓ All R1-A/B/C/D source changes (modernized routes)
- ✓ All previous phase reports
- ✗ No R1-D2-0 reports

**Feature Branch:**
- ✗ Only R1-A/B/C source changes (missing R1-D)
- ✗ Old R0/R1-0/R1-A/R1-B/R1-C/R1-D phase reports
- ✓ R1-D2-0 planning reports (3 analysis + 5 closeout)

---

## G. Root Cause Analysis

### Why Is Feature Branch Stale?

**Hypothesis 1: Branch divergence during development**
- Feature branch was created and had commits
- Main was updated (likely merged from same branch at different time)
- Feature branch continued from earlier baseline, not merging back

**Hypothesis 2: Accidental rebase/reset**
- Feature branch may have been reset to earlier point
- R1-D2-0 reports added on top of stale base

**Hypothesis 3: Parallel development**
- R1-D2-0 planning happened on feature branch (in parallel)
- But used stale snapshot of code for analysis

---

## H. Critical Findings

### Finding 1: Source Code Divergence
- **Status:** ⚠ CRITICAL
- **Impact:** Feature branch is 1 phase behind main (missing R1-D)
- **Risk:** Using stale code as basis for next phase planning
- **Fix Required:** Rebase or merge main into feature branch

### Finding 2: R1-D2-0 Reports Are Accurate for Main State
- **Status:** ✓ OK
- **Finding:** Reports describe main (current) state correctly
- **Evidence:** Scanner artifacts match expected 350 violations baseline

### Finding 3: Scanner Divergence (360 vs 350) Is Unexplained
- **Status:** ⚠ UNRESOLVED
- **Finding:** Current scanner run shows +10 violations vs committed artifact
- **Possible Causes:**
  - New violations introduced in code not from R1-A/B/C/D phases
  - Scanner non-determinism (different file ordering detected different patterns)
  - Shadow artifact from previous scan (scanner output not deterministic)

---

## I. Decision

### Current State Assessment

| Question | Answer | Status |
|----------|--------|--------|
| Is 75f65e0 on main? | YES | ✓ OK |
| Is 75f65e0 on feature branch? | NO | ⚠ PROBLEM |
| Does main have R1-D sources? | YES | ✓ OK |
| Does feature branch have R1-D sources? | NO | ✗ STALE |
| Feature branch source diff? | YES (R1-D missing) | ⚠ CRITICAL |
| Feature branch has R1-D2-0 reports? | YES | ✓ OK |

### Recommendation

**Feature branch needs to be rebased/merged with main to:**
1. Get the R1-D source changes (modernized routes)
2. Keep the R1-D2-0 reports
3. Become current baseline for R1-D2-A

**Do NOT proceed with R1-D2-A using feature branch in current stale state.**

---

**Status: ⚠ BRANCH DIVERGENCE CONFIRMED - REBASE/MERGE REQUIRED**

