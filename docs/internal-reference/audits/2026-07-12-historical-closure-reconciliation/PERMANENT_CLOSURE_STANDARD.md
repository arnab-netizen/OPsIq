# Permanent Closure Standard
**Date:** 2026-07-12  
**Purpose:** Define the minimum bar for declaring a defect class permanently closed. Every future closure claim must satisfy this standard.

---

## The Permanent Closure Requirement

A defect class is permanently closed when ALL of the following are true:

### Requirement 1: Full Repository Denominator Known

Before fixing, the full count of instances across the entire repository must be established using a verifiable, reproducible search command.

**Required documentation:**
```
Denominator: <N> instances found
Search command: grep -rn "<pattern>" src/ --include="*.ts" | grep -v test
Output: [paste or count]
```

A closure claim that says "all known instances removed" without a denominator count is UNVERIFIED.

### Requirement 2: All Instances in Denominator Are Fixed

The fix must cover every instance in the denominator, not just the ones that were immediately visible.

**Required documentation:**
```
Instances fixed: <N> (same as denominator or with explanation for any remainder)
Remainder: <0 or documented acceptable exceptions>
```

### Requirement 3: Unsafe Implementation Deleted or Made Inaccessible

If the defect is caused by a callable unsafe implementation (e.g., `logAuditEvent`, session-based `requireWorkspaceContext`), the implementation must be:
- Deleted entirely, OR
- Made inaccessible (unexported, file removed), OR
- Replaced with a safer canonical implementation

**"Closure by orphaning" (removing callers while leaving the unsafe export callable) does NOT satisfy this requirement.** An orphan can be rediscovered via IDE auto-complete.

### Requirement 4: Prevention Gate Exists and Covers the Denominator

A machine-executable gate must exist that:
- Detects any new instance of the defect pattern
- Can be run as `npm run <gate-name>` in CI
- Is documented in `scripts/a77-prevention-gates.ts` or an equivalent CI gate file

**A gate that cannot be run in CI does not satisfy this requirement.**

### Requirement 5: Gate Is Wired Into CI as Required Check

The prevention gate must be wired into `.github/workflows/ci.yml` (or equivalent) with `continue-on-error: false`.

**A gate that requires local discipline (`npm run gate` before push) does not satisfy this requirement.** Local discipline decays.

### Requirement 6: Fix Is Merged to Main

The fix must exist on `origin/main`, not just on a feature branch.

**A branch-only fix is classified `CLOSED_ON_BRANCH_PENDING_MERGE`, not `CLOSED`.** Until merged, the fix is not real from the perspective of the production codebase.

### Requirement 7: CI Is Green on Main After Merge

After merging, CI must pass on main with the prevention gate included. This proves:
- The fix works in the CI DB environment
- The gate doesn't break the build
- No regression from the merge

**DB-dependent tests must be verified on the CI postgres service, not just locally with mocks.**

---

## Closure Classification System

| Classification | Meaning |
|---------------|---------|
| `PERMANENTLY_CLOSED` | All 7 requirements satisfied |
| `CLOSED_ON_BRANCH_PENDING_MERGE` | Requirements 1–5 satisfied; branch not yet merged (Req 6) |
| `GATE_ONLY` | Prevention gate exists; unsafe implementations removed; but gate not in CI (Req 5 missing) |
| `INSTANCES_REMOVED_NO_GATE` | Denominator known, instances fixed; no prevention gate (Req 4 missing) |
| `UNVERIFIED_CLOSURE` | Closure claimed without documented denominator (Req 1 missing) |
| `ORPHAN_CLOSED` | Callers removed but unsafe implementation still callable (Req 3 missing) |

---

## Standard Example: DC-06 logAuditEvent Migration

**Denominator:** 19 production callers (documented in Batch 14 execution state)  
**Search command:** `grep -rn "logAuditEvent" src/ --include="*.ts" --exclude-dir="__tests__"`  
**Instances fixed:** 19 (all migrated to `emitAuditEvent`)  
**Unsafe implementation deleted:** YES — `src/services/audit/audit-log.ts` deleted in Batch 14  
**Prevention gate:** DC-06 in `governance:scan:a77`  
**Gate in CI:** **NO** — `governance:scan:a77` not in ci.yml  
**Fix on main:** **NO** — BRANCH_ONLY  
**CI green on main:** **NO** — not yet merged  

**Current classification: `CLOSED_ON_BRANCH_PENDING_MERGE`**  
Required actions to reach `PERMANENTLY_CLOSED`: wire gate into CI, merge branch, verify CI green.

---

## Standard Example: DC-12 WorkspaceAction Union

**Denominator:** All `hasPermission()` calls (count established by TypeScript type system)  
**Search command:** TypeScript compilation with `WorkspaceAction` union type  
**Instances fixed:** 4 (A7.6 Batch commit `c67fa206`)  
**Unsafe implementation deleted:** N/A — pattern prevented by type system  
**Prevention gate:** TypeScript strict compilation (`npx tsc --noEmit`)  
**Gate in CI:** **YES** — tsc runs in CI  
**Fix on main:** **NO** — A7.6 commit is BRANCH_ONLY  
**CI green on main:** **NO** — branch not merged  

**Current classification: `CLOSED_ON_BRANCH_PENDING_MERGE`** (requirements 1–5 via TypeScript; 6–7 pending merge)

---

## Applying This Standard Retrospectively

Using this standard, the current status of all 18 DC classes + 8 F/G classes is:

| Class | Requirements Met | Classification |
|-------|-----------------|----------------|
| DC-01 | 1,2,3,4; NOT 5,6,7 | `GATE_ONLY` (gate exists, not in CI, not merged) |
| DC-02 | 1,2; NOT 3 (context.ts callable); NOT 5,6,7 | `ORPHAN_CLOSED` |
| DC-03 | 1,2,3,4; NOT 5,6,7 | `GATE_ONLY` |
| DC-04 through DC-11 | 4 (gate); NOT 1,2,3,5,6,7 (gate-only, no instances fixed) | `GATE_ONLY` |
| DC-12 | 1,2,3,4,5 (via tsc); NOT 6,7 | `CLOSED_ON_BRANCH_PENDING_MERGE` |
| DC-13 through DC-18 | 4 (gate); NOT 5,6,7 | `GATE_ONLY` |
| DC-06 | 1,2,3,4; NOT 5,6,7 | `GATE_ONLY` |
| DC-14 | 1,2,3,4; NOT 5,6,7 | `GATE_ONLY` |
| F1–F4 | 1,2,3 (per Phase 6F); NOT 4,5; 6=YES (on main) | `INSTANCES_REMOVED_NO_GATE` |
| G-AUDIT-FAIL-OPEN | 1,2; NOT 3,4,5,6 | `INSTANCES_REMOVED_NO_GATE` |
| G-SCAN-A77-NOT-IN-CI | 0/7 | `OPEN` |

**0 of 26 defect classes satisfy all 7 requirements for `PERMANENTLY_CLOSED` as of 2026-07-12.**

---

## Path to First `PERMANENTLY_CLOSED` Classifications

**Fastest path for DC-06 (logAuditEvent migration):**
1. Wire `governance:scan:a77` into ci.yml → satisfies Req 5
2. Merge branch → satisfies Req 6
3. Verify CI green on main → satisfies Req 7
4. **Result:** DC-06 = `PERMANENTLY_CLOSED`

The same merge satisfies Reqs 5–7 for all other DC classes simultaneously.

**Outstanding gap after merge:** DC-02 remains `ORPHAN_CLOSED` until `context.ts` is deleted.
