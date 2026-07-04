# OPSIQ FINAL READINESS BLOCKER — CLOSURE REPORT

Branch `claude/full-repo-jarvis-db-blocker-closure`. Both final-readiness blockers closed and CI-proven.

## Summary

| Blocker | Result | Proof (GitHub Actions) |
|---|---|---|
| **GAP-E2E-01** — Playwright owner browser flow | ✅ GREEN | `owner-e2e.yml` run **28340198887** (commit 4931475) — conclusion success |
| **GAP-CI-FLAKE-01** — full maintained DB suite | ✅ GREEN | `ci.yml` run **28341095191** (commit 432e4bd) — blocking step "Run maintained test suite (quarantine excluded)" success (3 prior failures → 0) |

Both fixes touch real backend behavior and test correctness — no assertions weakened, no quarantine
added, no UI fakery, server enforcement intact.

## B. GAP-E2E-01 — owner browser flow (owner-e2e.yml GREEN)

The lane boots the built app against a seeded PostgreSQL, logs in as a real OWNER over a real browser,
and asserts the server-rendered owner control center. Three concrete defects were found and fixed:

1. **Health gate false-negative** — `curl -sf` failed on any non-2xx; replaced with a connectivity check
   (any HTTP code = up) so Playwright actually runs.
2. **Login path** — the helper navigated to `/auth/login` (a 404); the real route is `/login`. Fixed the
   helper + workflow health path. Login then succeeded in CI (`USER_LOOKUP_OK`, `PASSWORD_COMPARE_OK
   {valid:true}`, `SESSION SUCCESS`).
3. **RBAC + data (root cause of the render failure)** — after login the owner APIs returned
   `403 Missing capabilities: owner:view`. Capabilities derive from a workspace-scoped `UserRoleAssignment`
   (`src/services/auth.ts:getPolicyContext`), NOT the membership string — exactly as production signup
   grants `ROLES.ADMIN_OR_PORTFOLIO_MANAGER` (which carries OWNER_VIEW/OWNER_MANAGE). The seed created only
   a membership. Also, the control-center panel only renders with `hasData && profile`, which needs ≥1
   domain diagnosis — the archetype seeds operational data but no diagnosis. Fix (`scripts/seed-e2e-owner.ts`):
   upsert the workspace-scoped role assignment AND run a finance snapshot + diagnosis on the archetype
   business. The control center then renders from real backend data with the owner-action / handled-by-OpsIQ
   summary, and the browser assertions pass.

Server enforcement stayed active throughout (the 403s were the gate working); the fix grants the owner the
real capability rather than bypassing the check.

## A. GAP-CI-FLAKE-01 — full maintained DB suite (ci.yml GREEN)

The full blocking lane (`npx vitest run --maxWorkers 1`, quarantine-excluded) had two distinct failure
populations, both fixed:

### A1 — 9 owner-module verification-teardown regressions
`owner-{cashflow,finance,home,marketing,operations,sales,sop,strategy}/services.db.test.ts` and
`owner-finance/persistence.db.test.ts`. Each verification test tore down with a bare
`db.ownerBusiness.delete()`. The `20260628210000_governed_verification_restrict` migration set the 7
verification tables' `business_id`/`action_id` FKs to `ON DELETE RESTRICT` (14 FKs), so deleting a business
that has a verification is (correctly) blocked → `PrismaClientKnownRequestError`. This is the intended
governance guard (a verification must not be silently destroyed by deleting its parent), so the teardown —
not the guard — was wrong. Added `src/__tests__/test-helpers/owner-business-teardown.ts`, which deletes the
business's verification rows first (deliberate governed cleanup) then the business (other children still
cascade), and routed all 9 files through it. `canonical_events` is never touched.

### A2 — 3 owner-budget cash-obligation failures (deterministic)
`services/owner-budget/{action-link.service,budget.service,dynamic-budget-hostile-audit}.db.test.ts`. All
three record a 420000 committed statutory-payroll obligation (`dueInDays: 5`, over the 50000 owner-approval
threshold) and assert the budget mode flips GROW → EMERGENCY with cash-protection actions. The GAP-BUDGET-02
approval barrier persists the over-threshold spend as `pending_owner_approval`, and the obligation queries
counted only `committed/approved/requested` — so the payroll was dropped from cash-risk, free cash looked
positive, and the mode stayed GROW. That understates imminent cash danger (the system would keep
recommending growth while payroll is about to bounce) — an unsafe violation of the mandatory adaptive rule.
Fix (`src/services/owner-budget/budget.service.ts`): a dated obligation awaiting approval is still a real
future cash outflow. Introduced `CASH_OBLIGATION_STATES = [committed, approved, requested,
pending_owner_approval]` and applied it to both obligation queries (forecast + reassessment). The approval
barrier still governs *payment*; the liability now correctly counts for *risk*. `voided`/`blocked`/`disputed`
remain excluded. Only these 3 tests record a dated over-threshold spend, so no other mode assertion
regresses; 158 pure budget/domain tests still pass and the plan composer already maps EMERGENCY →
decisionType BLOCK + "Protect cash: freeze…" action.

## Commits
- `4931475` — DB verification-teardown helper + e2e owner RBAC/data seed.
- `432e4bd` — count pending-approval dated obligations in budget cash-risk.

## Classification
**READY_FOR_BEHAVIORAL_VALIDATION** — both final-readiness blockers are green in GitHub Actions:
`owner-e2e.yml` (28340198887) and the full maintained `ci.yml` blocking suite (28341095191). All
BLOCKER/CRITICAL/HIGH code & schema gaps from this lineage remain CI-proven closed, the cascade audit is
complete, no assertion was weakened and no new quarantine was added. Behavioral validation may begin.
