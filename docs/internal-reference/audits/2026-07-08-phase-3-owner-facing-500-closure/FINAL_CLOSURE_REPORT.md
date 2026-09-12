# Phase 3 — Owner-Facing Latent 500 Closure Loop — FINAL CLOSURE REPORT

**Date:** 2026-07-08
**Branch:** `claude/phase-3-owner-facing-500-closure-report`
**Scope:** the three documented Phase 2 follow-ups only (getRecommendation invalid select; required diagnoseBusiness DB workspace-isolation test; production-dashboard `membership_lookup_failed` 500). No new feature work.

---

## 1. Main baseline and final HEAD
- **Baseline (Phase 2 final):** `6a0ba15` — `Phase 2: owner-journey G1-G5 closure report (#197)`.
- **Final HEAD (Phase 3 items merged):** `725998a4` — `Phase 3: fix production dashboard membership lookup (#200)`.
- History is linear on top of the baseline: `6a0ba15 → 295fa61 (#198) → bfba490 (#199) → 725998a (#200)`.
- **This closure PR** adds only this report + evidence ledger; the code-affecting HEAD is `725998a4`.

## 2. PRs merged (one defect / proof target per PR)
| Item | PR | Squash merge | Title |
|---|---|---|---|
| 1 | #198 | `295fa614` | Phase 3: fix getRecommendation invalid select |
| 2 | #199 | `bfba490e` | Phase 3: prove diagnoseBusiness DB workspace isolation |
| 3 | #200 | `725998a4` | Phase 3: fix production dashboard membership lookup |
| Closure | (this PR) | — | Phase 3: close owner-facing 500 follow-ups |

## 3. Defects fixed
1. **`getRecommendation` invalid select (Item 1) — owner-facing 500 fixed.**
   `getRecommendation` selected four columns absent from the `Recommendation` model
   (`expectedImpact`, `implementationPhase`, `executionCertaintyScore`, `scoreBreakdown`), so
   `prisma.recommendation.findUnique` threw `PrismaClientValidationError` on every call — `GET` and
   `PATCH /api/recommendations/[id]` 500'd on every request. Fixed by selecting the real column
   `estimatedImpact`. The identical defect to the Phase 2 G2 listing fix.
2. **`diagnoseBusiness` workspace isolation (Item 2) — no defect found; proven safe.**
   The full `diagnoseBusiness` transaction had never run in the required lane (its only test was the
   excluded `*.integration.test.ts`). A new required-lane real-DB test drives it end-to-end across two
   workspaces and proves it is correctly isolated (every workspace-owned create supplies `workspaceId`;
   no cross-tenant reuse/leak). Per Global Rule 10, no source fix was needed; the test is a fail-closed
   regression guard. The Phase 2 G5-speculated "further isolation gaps" do not exist on the exercised
   owner path.
3. **Production-dashboard `membership_lookup_failed` login 500 (Item 3) — owner-facing 500 fixed;
   underlying trigger reclassified as environment with proof.**
   The `Smoke - Production Dashboard` 500 is a login failure: `POST /api/auth/login` returned
   `{"classification":"membership_lookup_failed"}`. Root cause (proven with a real-DB column-drop
   reproduction → Prisma `P2022 ColumnNotFound`): the login route's `workspaceMembership.findFirst`
   used a bare select (all columns) though login only needs `workspaceId`; when the deployed DB is
   behind on migration `20260625120000_owner_mode_execution_tables` (schema drift), the missing column
   makes the query throw. Fixed by selecting only `{ workspaceId }` — resilient to drift on any
   non-core column; auth unchanged. The underlying trigger (production DB behind on that migration) is
   an **environment** condition, remediated by applying the pending migration to production — an ops
   action deliberately not performed autonomously.

   **Post-merge production confirmation (smoke on `725998a4`, run 28982236484):** the fix is validated
   end-to-end against the live production app. `POST /api/auth/login` now returns **200** ("Session
   established") where it previously returned the `membership_lookup_failed` 500 (it 500'd identically
   on `bfba490e`, `295fa614`, `6a0ba154`). The smoke then advances through `GET /` (200) and fails at
   the **next** default-select membership read — `GET /api/internal/demo-permission-proof` → 500
   (Step 2.5). This exactly confirms the diagnosis: the login 500 is fixed, and the residual is the
   same environment schema drift on another default-select `workspaceMembership.findFirst`, which the
   pending production migration remediates (see §6, §7).

## 4. Tests added (all in the required `build-and-test` lane; DB-backed; no mocks)
- `src/services/__tests__/getRecommendation-invalid-select.db.test.ts` (2) — fails pre-fix
  (`Unknown field 'expectedImpact'`), passes post-fix; asserts workspace isolation (`NotFoundError`).
- `src/services/__tests__/diagnoseBusiness-db-workspace-isolation.db.test.ts` (2) — drives the real
  `diagnoseBusiness` twice across two workspaces; proves persistence + isolation + no cross-tenant leak.
- `src/app/api/auth/__tests__/login-membership-lookup.db.test.ts` (5) — 401 for unknown user / wrong
  password; login never `membership_lookup_failed` (with and without membership); real column-drop
  reproduction (old bare select throws `P2022`, fixed narrow select resolves, real login route no
  longer `membership_lookup_failed`).

## 5. Required CI status
All required gates were GREEN on each item PR before merge and re-verified on `main` after each merge:
`build-and-test` (governance scans, `tsc`, Prisma validate/migrate/generate, `next build`, wrapped-handlers
ratchet, maintained vitest suite), `lint` + lint ratchet, `Build + Type + Prisma Verify`,
`MVP Readiness Validation`, `Security Baseline Check`, `branch-protection` / `Enforce Branch Protection`,
`Phase 3 Slice 2 Gates`, and the DB-backed simulation lanes. Main `build-and-test` verified green after
#198 (`295fa614`) and #199 (`bfba490e`); after #200 (`725998a4`) it is verified as part of this closure.

## 6. Remaining owner-facing 500 risks
- **None known in the three targeted call paths.** getRecommendation and the recommendations listing
  both select only real columns; diagnoseBusiness is proven workspace-isolated; the owner-facing login
  route is drift-resilient and regression-guarded.
- **Same-class latent risk (not owner-facing today, documented):** other membership reads on the demo
  dashboard path still use default selects (`getPolicyContext` in `src/services/auth.ts`; the internal
  `demo-permission-proof` / `demo-engagement-proof` diagnostic endpoints). They are fragile to the same
  deploy drift. They were intentionally NOT changed in Item 3 (minimal scope; not chasing an environment
  problem through code). The correct remediation is the pending production migration; an optional code
  follow-up is to narrow those selects to needed columns for defence-in-depth.

## 7. Remaining non-required smoke risk
- **`Smoke - Production Dashboard` (non-required, main-push only).** The login-step `membership_lookup_failed`
  is fixed in code and **confirmed fixed in production** (login now 200 on `725998a4`, up from 500). The
  smoke now fails one step later, at `demo-permission-proof` (500) — the next default-select membership
  read hitting the same drift. The smoke turns fully green only once the production database is brought up
  to date on migration `20260625120000_owner_mode_execution_tables`. Until then it correctly reports a
  **true** environment problem (not a false 500). This smoke remains separately classified (non-required)
  and does not gate merges.

## 8. Rollback plan
- Each item is an isolated squash commit on `main`; revert individually with
  `git revert <sha>` (`725998a4` → `bfba490e` → `295fa614`) with no interdependencies.
- Item 1 revert re-introduces the getRecommendation 500 (not recommended). Item 2 revert only removes a
  test (safe). Item 3 revert re-introduces the login default-select fragility (not recommended); it does
  not touch the environment.
- No schema migrations were added by Phase 3, so no DB rollback is required.

## 9. Recommended next phase
1. **Environment remediation (highest priority, ops):** apply migration
   `20260625120000_owner_mode_execution_tables` to the production database (e.g. the `migrate-production`
   workflow), then confirm `Smoke - Production Dashboard` goes green end-to-end.
2. **Optional defence-in-depth (code):** narrow the remaining membership-read selects
   (`getPolicyContext`, the demo diagnostic endpoints) to the columns they actually use, so the demo
   dashboard path is resilient to deploy/migration drift.
3. Only after the above, resume the deferred backlog per new owner instruction (billing, Product Hunt,
   SaaS launch, Local Mode, connectors, Claude skills, finance dedup, UI redesign) — none started in
   Phase 3.

---

### Response-format summary (per prompt)
1. **Phase 3 classification:** closed — 2 owner-facing 500s fixed (Items 1, 3), 1 coverage gap closed with a proven-safe result (Item 2); Item 3's environmental residual reclassified with proof.
2. **Final main HEAD:** `725998a4` (code); this closure PR adds docs only.
3. **Item 1 status:** merged (#198, `295fa614`) — getRecommendation 500 fixed + regression test.
4. **Item 2 status:** merged (#199, `bfba490e`) — diagnoseBusiness DB workspace isolation proven; no fix needed (Rule 10).
5. **Item 3 status:** merged (#200, `725998a4`) — login `membership_lookup_failed` fixed; environment root cause reclassified with proof.
6. **Closure PR status:** this PR.
7. **Remaining risks:** production DB migration drift (environment) keeps the non-required production-dashboard smoke red until the migration is applied; same-class default-select membership reads on the demo path remain as an optional code follow-up.
8. **Recommended next phase:** apply the pending production migration, then optional select-hardening; resume deferred backlog only on new owner instruction.
