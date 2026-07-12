# Repeated Defect Root Causes
**Date:** 2026-07-12  
**Purpose:** Determine WHY each defect class recurs, not just WHAT the defect is.

---

## Root Cause 1: Branch Never Merged (Structural — Affects All DC Classes)

**Evidence:**
- 48 commits on `claude/phase-6f-governance-findings-5gkiec`, 0 behind `origin/main`
- `git diff --stat origin/main HEAD | tail -1`: 170 files changed, 14,621 insertions, 3,803 deletions
- Every DC-01 through DC-18 closure, every route migration, every audit pattern fix lives on this branch

**Why defects recur:** Any new branch cut from `origin/main` inherits all defects in their pre-A7.7 state. The work is done; it simply hasn't landed.

**Mechanism:** Large long-running feature branches accumulate security work that becomes stale relative to main if the merge is delayed. Each new week without merge is a week where the "fixed" system is only fixed in isolation.

**Fix:** Merge to main. Every other root cause is secondary until this one is resolved.

---

## Root Cause 2: Prevention Gates Not Enforced in CI

**Evidence:**
- `grep -rn "governance:scan:a77" .github/workflows/` → **0 results**
- CI runs only `governance:scan:strict` and `governance:scan:auth`
- `npm run governance:scan:a77` defined in package.json but not in any workflow

**Why defects recur:** Even when a defect class is "closed" with a gate, the gate only prevents recurrence if it runs on every commit. A gate that requires local discipline (manually run before pushing) will eventually be forgotten. The 18-gate suite is currently local-discipline-only.

**Mechanism:** Security closures are implemented as local scripts. The enforcement gap between "script exists" and "script runs on every push" is where regression enters.

**Fix:** Wire `npm run governance:scan:a77` into `.github/workflows/ci.yml` as a blocking required check. Without this, every DC-01 through DC-18 gate can be bypassed.

---

## Root Cause 3: Unsafe Implementations Left Callable After "Closure"

**Evidence:**
- `src/services/workspace/context.ts` still exports `requireWorkspaceContext` (session-based, no DB lookup) despite DC-02 claiming closure of all callers.
- `src/services/workspace/activation-context.ts` has its OWN `requireWorkspaceContext` (DB-backed, different semantics).
- `src/lib/service-auth.ts` has yet another `requireWorkspaceContext` (string validation, unrelated).
- Three functions with the same name, different semantics, in three different files.

**Why defects recur:** "Closing callers" is insufficient if the unsafe implementation remains importable. A new developer who imports from `@/services/workspace/context` gets the session-based resolver. The DC-02 gate prevents NEW callers but doesn't prevent the export from existing.

**Mechanism:** Deletion-averse closure style — instead of deleting unsafe implementations, they are "orphaned." Orphans are still callable. Over time, new callers rediscover orphaned functions because they appear in IDE auto-complete.

**Fix:** Delete `src/services/workspace/context.ts` entirely. The `activation-context.ts` version (DB-backed) is the correct alternative. The `service-auth.ts` version (string validation) is unrelated and should be renamed to avoid confusion (e.g., `requireWorkspaceId`).

---

## Root Cause 4: auth-governance-scanner.ts is Stale — Detects Wrong Canonical Pattern

**Evidence:**
- `scripts/auth-governance-scanner.ts` line 33: `message: 'withRequestContext is forbidden. Use withEnforcementFull.'`
- A7.7 replaced `withEnforcementFull` with `withCanonicalEnforcement` as the canonical standard
- The CI-wired scanner (`governance:scan:auth`) recommends the wrong replacement

**Why defects recur:** CI provides false assurance. The auth scanner catches `withRequestContext` but tells the developer to use `withEnforcementFull` — which A7.7 identifies as a non-canonical wrapper (DC-03). A developer following CI guidance would introduce a DC-03 violation.

**Mechanism:** Scanner was correct at the time it was written (Phase 6B era) but was never updated when the canonical pattern changed in A7.7. Security tooling that is stale is worse than no tooling because it actively misleads.

**Fix:** Update `auth-governance-scanner.ts`:
- Change remediation message from "Use withEnforcementFull" to "Use withCanonicalEnforcement"
- Add detection of `withEnforcementFull` in route files (currently not detected)
- Add detection of `enforceWorkspaceScoping` used as primary auth (without `withCanonicalEnforcement`)

---

## Root Cause 5: "Full Repository Denominator" Never Established Before Claiming Closure

**Evidence:**
- Phase 6H claimed 14 `logAuditEvent` route callers as complete inventory — this was later superseded by the Batch 14 migration which found 19 production sites.
- Phase 6I deferred run/route.ts complexity to a later phase — the deferred item became a Batch 11 migration.
- DC-02 closure was documented in Batch 12; however, a new caller check in this reconciliation reveals `activation-context.ts` exports a different function with the same name that was not part of the DC-02 investigation.

**Why defects recur:** Each phase defines its OWN denominator (what it searched for, in what scope) rather than establishing a repository-wide denominator first. When Phase N closes "all known callers," it means "all callers I found." Phase N+1 finds more.

**Mechanism:** Incremental discovery without exhaustive pre-audit. Each closure is accurate for its scope; the scope itself is narrow.

**Fix per PERMANENT_CLOSURE_STANDARD.md:** Before declaring a defect class closed, document the full-codebase denominator using a verifiable search command. The denominator is the count of ALL instances before the fix. Closure means the count is zero, not "the count I know about is zero."

---

## Root Cause 6: Fail-Open vs Fail-Closed Audit Boundary Not Enforced by a Gate

**Evidence:**
- Phase 6H fixed 2 routes (decisions/intake, operator POST) to fail-closed audit.
- A7.7-Batch15 fixed evaluate/route.ts as "final known instance" of fail-open post-mutation audit.
- NO gate exists that systematically detects `.catch()` on `emitAuditEvent` in write-path handlers.
- The distinction (read paths may `.catch()`, write paths must not) is documented in comments and audit docs but not machine-enforced.

**Why defects recur:** Any new route with a governed write mutation can silently introduce `.catch()` on the post-mutation audit call. There's no lint rule, no gate, no TypeScript enforcement. The pattern is enforced by convention only.

**Mechanism:** Security patterns that are comment-enforced (not code-enforced) decay as the team grows and convention knowledge is lost.

**Fix:** Add DC-19 gate: scan write-path handlers (POST, PUT, PATCH, DELETE route files) for `emitAuditEvent(...).catch(` patterns. The gate should flag any `.catch()` on `emitAuditEvent` in files that contain `db.*` write operations (create, update, updateMany, delete).

---

## Root Cause 7: Dead Code Accumulation Without Detection

**Evidence:**
- A7.7-Batch17 removed `import { resolveServerRole }` from override/route.ts — the import was present for an unknown number of commits before discovery.
- A7.7-Batch17 removed `import { getSession }` from entity/route.ts — similarly undiscovered.
- TypeScript `tsconfig.json` does not enable `noUnusedLocals` or `noUnusedParameters`.

**Why defects recur:** TypeScript default settings do not flag unused imports. Dead imports that expand the auth surface (e.g., `getSession` imported but never called) are invisible to the normal build pipeline.

**Mechanism:** Missing `noUnusedLocals` in tsconfig.

**Fix:** Enable `noUnusedLocals: true` and `noUnusedParameters: true` in `tsconfig.json`. This would have caught both dead imports in Batch 17 at compile time rather than requiring manual audit.

---

## Summary Table

| Root Cause | Defect Classes Affected | Fix Category |
|-----------|------------------------|--------------|
| RC-1: Branch not merged | All 18 DC + all F/G classes | MERGE TO MAIN |
| RC-2: Gates not in CI | DC-01 through DC-18 (except DC-12) | CI WIRING |
| RC-3: Unsafe implementations left callable | DC-02, duplicate-resolver pattern | DELETE ORPHANS |
| RC-4: Stale auth scanner | DC-03, all auth wrapper classes | SCANNER UPDATE |
| RC-5: Incomplete denominator before closure | F1-F4, logAuditEvent migration | AUDIT PROTOCOL |
| RC-6: No gate for fail-open/fail-closed boundary | G-AUDIT-FAIL-OPEN | NEW GATE DC-19 |
| RC-7: Dead code not detected by build pipeline | G-DEAD-IMPORT | TSCONFIG FIX |

**The highest-leverage fixes (by coverage):**
1. RC-1: Merge branch → fixes all 26 defect classes simultaneously
2. RC-2: Wire `governance:scan:a77` into CI → prevents all DC-class regressions post-merge
3. RC-4: Update `auth-governance-scanner.ts` → fixes stale CI guidance
4. RC-3: Delete `context.ts` → eliminates one importable orphan
5. RC-6: Add DC-19 gate → closes the last un-gated recurrence mechanism
6. RC-7: Enable `noUnusedLocals` → closes dead-import discovery gap
