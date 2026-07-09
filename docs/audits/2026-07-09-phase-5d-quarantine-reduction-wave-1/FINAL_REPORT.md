# Phase 5D — Quarantine reduction Wave 1 (FINAL REPORT)

**Date:** 2026-07-09
**Branch:** `claude/phase-5d-quarantine-reduction-wave-1`
**Base:** main @ `f953b32`

## 1. Phase 5B main verification result
**GREEN.** Main-push run `29004832206` (`f953b32`) completed: **build-and-test (20.x) success** (governance,
auth-governance, tsc, prisma validate/migrate/generate, build, wrapped-handlers ratchet, maintained vitest
suite, quarantined non-blocking) and **lint (20.x) success**. HEAD `f953b32` in ancestry, working tree clean.
Phase 5B is **CLOSED — GREEN**.

## 2. Branch and HEAD
- Branch: `claude/phase-5d-quarantine-reduction-wave-1`
- HEAD before: `f953b32` → HEAD after reactivation commit: `073d472` (docs commit adds to it).

## 3. Starting quarantine count
- `src/__ignored_tests__/**`: **88 files** (the dark backlog — target of this wave).
- `.claude/test-quarantine.json`: 21 files / 50 tests (separate visible non-blocking track; untouched).

## 4. Full inventory summary
See `QUARANTINE_INVENTORY.md`. The 88 ignored files: 67 unit/service, 12 integration, 6 UI, 1 placeholder.
Two reactivation gotchas govern all waves: (a) tsc excludes `**/__tests__/**` and `**/__ignored_tests__/**`,
so a file's tsc scope depends on its target dir; (b) eslint scans everything, and the `lint:ratchet`
changed-file gate fails on any lint **error** in a moved file — so each reactivated file must be error-clean.

## 5. Selected cluster and why
**Owner-facing auth / RBAC authorization guardrails.** Smallest meaningful cluster hitting selection
priorities #2 (auth/workspace) and #4 (reduce auth/isolation risk); non-DB (required-lane safe); non-trivial
(52 assertions); and — critically — **passes unmodified against current source**, proving it was
over-quarantined rather than genuinely failing. Rejected alternatives (documented in inventory §2): the
workspace-isolation static scanner (flags 4 current source patterns → too broad) and `service-auth.test.ts`
(stale `AuthContext` contract + doc-stub assertions).

## 6. Tests reactivated
- `src/lib/auth-guard.test.ts` — **18 tests**: `getActorHierarchyLevel`, `canDo`, `requireAuth`,
  `requireAuthForCapability`, `requireAuthInternal`, `getServerAuthContext`.
- `src/app/api/__tests__/rbac-enforcement.test.ts` — **34 tests**: role→capability mapping, deny-by-default,
  engagement-scoped role behavior.
- Total **52 tests** now run in the active/required lane. `__ignored_tests__`: **88 → 86**.

## 7. Tests left quarantined and why
The other 86 ignored files remain for later waves (12 integration need rename+fixtures; 6 UI need the browser
lane; remaining unit/service pending per-file probing; some reference stale APIs). The 21
`test-quarantine.json` files stay in their visible non-blocking track. Nothing was deleted, skipped, or newly
quarantined.

## 8. Stale fixtures/assertions updated
Type-only hygiene, **no assertion weakened**, intent preserved:
- `auth-guard.test.ts`: import `PolicyContext` from `@/policies/capability-check` (its real module —
  `./auth-guard` does not export it; this was a latent error hidden while the file was tsc-excluded); type the
  `makeSession()` helper as `SessionInfo` and drop 8 unnecessary `as any` casts; remove an unused `AuthContext`
  import.
- `rbac-enforcement.test.ts`: replace the non-existent `ROLES.CONSULTANT` (runtime `undefined`) with
  `ROLES.EXPERIENCED_CONSULTANT` per the file's own comment, and drop the accompanying `as any`; give a mock a
  precise structural type instead of `any`. The affected assertion checks only `roles[0].scopeId`, unchanged.

## 9. Product defects found/fixed
None. No product/source file changed. The stale references were confined to the test files.

## 10. Files changed
- `src/lib/auth-guard.test.ts` (moved from `src/__ignored_tests__/lib/`, edited)
- `src/app/api/__tests__/rbac-enforcement.test.ts` (moved from `src/__ignored_tests__/app/api/__tests__/`, edited)
- `docs/audits/2026-07-09-phase-5d-quarantine-reduction-wave-1/` (this report, inventory, ledger)

## 11. Commands run
- `npx vitest run src/lib/auth-guard.test.ts src/app/api/__tests__/rbac-enforcement.test.ts` → **52 passed**
- `npx tsc --noEmit` → **clean** (after fixing the exposed `PolicyContext` import)
- `npx eslint <both files>` → **0 errors** (7 pre-existing warnings, non-blocking)
- `node scripts/lint-ratchet.mjs` (committed diff) → **PASS**, changed files 2, changed-file lint errors 0,
  global errors 2094→2084, warnings 1255→1254 (debt decreased)
- `npm run governance:scan:strict` → 0 new; `npm run governance:scan:auth` → all routes comply

## 12. Pass/fail/deferred status
- Reactivated tests: **PASS (52/52)** locally, run in the required lane.
- tsc / lint:ratchet / governance: **PASS** locally.
- Full maintained suite + all required CI gates: **deferred to CI** on the PR.
- DB lane / Playwright: **not applicable** (cluster is non-DB, non-browser).

## 13. Remaining risks
Low. Both files are pure unit tests with mocked `@/services/auth`; no DB, no external service, no product code.
Residual risk is only that the full CI suite surfaces an interaction the local single-file run did not — covered
by the PR CI gate before merge.

## 14. Rollback plan
Revert the commit(s) — the two test files move back to `__ignored_tests__` and the docs are removed. No product
surface, no migration, no state; rollback is immediate.

## 15. Next recommended wave
Wave 2 — reactivate a cluster of non-DB service unit tests (`services/**/__tests__/*.test.ts`) that pass against
current source, same probe-then-move discipline. Alternatively: owner-approved production migration (only on the
exact phrase), or Phase 5E local/preview owner-journey Playwright proof.
