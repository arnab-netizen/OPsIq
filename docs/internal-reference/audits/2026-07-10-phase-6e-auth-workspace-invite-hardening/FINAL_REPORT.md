# Phase 6E — Final Report: harden auth / workspace / invite controls

**Date:** 2026-07-10 · **Branch:** `claude/phase-6e-auth-workspace-invite-hardening` · **Base / HEAD-before:** `c7d80404`

## 1. Phase 6D final main verification
Main `c7d80404` verified **GREEN** on all three required workflows before this phase: `CI - Build & Test`
(incl. the 10 `[db]` approval tests on postgres:16), `CI/CD Foundations`, `MVP Readiness Gate`
(**Security Baseline HONEST_GREEN**). → **Phase 6D CLOSED — GREEN.**

## 2. Target 1 — invite privilege escalation (CONFIRMED_HIGH → FIXED)
- **Defect:** `POST /api/onboarding/invite` gated invites with
  `!userRole || (userRole.role !== "admin" && userRole.isActive === false)` — an **active non-admin**
  (role≠admin true, isActive===false false → whole condition false) was **not denied**, so any active
  submitter/approver/viewer could invite members and assign roles (incl. `admin`). Denial also threw a raw
  `Error` (→500).
- **Fix:** centralized `assertCanInviteMembers(membership)` in `src/services/auth/workspace-invite-policy.ts`
  (active `admin` only; governed `ForbiddenError`/403; fail-closed on missing/inactive/non-admin). Route uses
  it, narrows the membership select to `{ role, isActive }`, and returns `NotFoundError` for an unknown
  workspace (was raw `Error`). Removed an unused `getSession` import + `InviteInput` type.
- **Tests:** `src/__tests__/services/auth/workspace-invite-policy.test.ts` — 7 pure-policy + 4 `[db]` (real
  membership lookup + guard). **Fail-before proven:** restoring the old boolean fails 5 tests (active
  non-admin admitted); the fix passes all.

## 3. Target 2 — workspace-enforcement bare-select drift risk (CONFIRMED_MEDIUM → FIXED)
- **Defect:** `enforceWorkspaceScoping` used bare/default `findUnique` reads on `workspace` and
  `workspaceMembership` (all columns), which 500 under production schema drift (P2022) on a critical
  enforcement path.
- **Fix:** narrowed selects to the consumed fields only — `workspace { isActive }` and
  `workspaceMembership { role, isActive }` (`src/middleware/workspace-enforcement.ts`). Drift-safe and
  behavior-preserving (mirrors the Phase 5C `getPolicyContext` hardening).
- **Tests:** `src/__tests__/middleware/workspace-enforcement.db.test.ts` — 4 pure-policy + 5 `[db]` exercising
  the **real** `enforceWorkspaceScoping` against real Postgres (only `getSession` stubbed): active admin/viewer
  allowed with role; inactive membership, non-member, and inactive workspace all denied; invalid workspace-id
  format → `ForbiddenError`.

## 4. Target 3 — diagnosis body.workspaceId / withAuth scoping (SUSPECTED_MEDIUM → FALSE_POSITIVE)
- **Trace result:** `withAuth({ capability: DIAGNOSIS_READ })` binds to the `"system"` policy context (default
  arg), not to `body.workspaceId`. The three diagnostic engines (root-cause/maturity/bottleneck) are **pure
  compute** — `.create`/`.update`/`.upsert`/`emitAuditEvent` count = **0** in each; `body.workspaceId` is only
  echoed into the response. No DB read scoped by it, no persist, no audit; the only route persistence is the
  idempotency cache keyed by the caller's authContext.
- **Classification:** **FALSE_POSITIVE** for cross-workspace escalation — the field is inert. No code change.
- **Residual (CONFIRMED_LOW, not fixed):** the field is accepted but unvalidated; latent footgun if a future
  change persists/reads by it. Folded into the `withAuth` migration plan.

## 5. Target 4 — withAuth("system") legacy migration plan (PLAN ONLY)
~68 `withAuth(` call sites; **0** pass an explicit workspace (all default to `"system"`). Documented risk
classes (single-guard / double-wrapped / inert-passthrough), a safe migration pattern
(`withCanonicalEnforcement` or explicit workspace arg), and a phased plan in `WITHAUTH_MIGRATION_PLAN.md`.
**No call site migrated in this PR** (out of scope; high blast radius).

## 6. Source fixes / files changed
- `src/services/auth/workspace-invite-policy.ts` (new — centralized guard)
- `src/app/api/onboarding/invite/route.ts` (use guard, narrow select, governed errors, drop unused imports)
- `src/middleware/workspace-enforcement.ts` (narrow selects)
- `src/__tests__/services/auth/workspace-invite-policy.test.ts` (new — 11 tests)
- `src/__tests__/middleware/workspace-enforcement.db.test.ts` (new — 9 tests)
- `docs/audits/2026-07-10-phase-6e-auth-workspace-invite-hardening/{AUTH_WORKSPACE_INVENTORY.md, WITHAUTH_MIGRATION_PLAN.md, FINAL_REPORT.md, EVIDENCE_LEDGER.json}`

## 7. Commands run (local)
`tsc --noEmit` (0) · `TEST_WITH_DB=true vitest <both files>` (20 passed) · no-DB (11 passed / 9 skipped) ·
**fail-before** (revert invite guard → 5 fail) · regression (`auth-guard` + `owner-onboarding` +
`services/auth/__tests__`) 33 passed · `governance:scan:strict` 0 new · `governance:scan:auth` pass ·
`prisma validate` valid · `lint:ratchet` PASS (0 changed-file errors).

## 8. Pass/fail/deferred
PASS locally. CI pending on the PR. Target 3 = FALSE_POSITIVE (documented). Target 4 = deferred plan.

## 9. Rollback plan
Single-commit `git revert` restores prior behavior; no schema/migration/data change. The new guard module is
additive; reverting the route/middleware edits is clean.

## 10. Updated phase queue
- **Phase 6F:** agent-reported governance verification.
- **Phase 6G:** lane-integrity (incl. `mvp-readiness-check.sh` next-build OOM/output-swallow hardening).
- **`withAuth` migration** (from Target 4 plan): dedicated future phase — classify 68 sites, migrate
  single-guard first. Includes the diagnosis body.workspaceId hygiene note.
- Remaining placebo waves: hostile-auth, governed wrappers, dashboard/recommendation/action route clusters,
  execution-certainty, constraint-checks, escalation/review-cycles, operator queue.
- Production migration: only with the exact owner phrase.

## 11. Next recommended phase
The **`withAuth` "system" migration** (highest residual auth risk, scoped per the plan) — or **Phase 6F**
(agent-reported governance verification) if the owner prefers to keep the migration as its own track.

## Safety
No production migration · no production DB touched · no secrets · no schema change · no auth loosening
(fail-closed throughout) · no test weakening/skips/placebos. Explicit approval phrase **not** received.
