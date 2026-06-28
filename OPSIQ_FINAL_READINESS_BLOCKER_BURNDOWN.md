# OPSIQ FINAL READINESS BLOCKER BURNDOWN

Branch `claude/full-repo-jarvis-db-blocker-closure`. Two blockers to green.

## B. GAP-E2E-01 — owner browser flow
- **Resolved so far:**
  - Health gate `curl -sf` false-negative → connectivity-based check (any HTTP code = up).
  - Login path: helper navigated to `/auth/login` (404); real route is `/login` → fixed helper + health path.
    Login now SUCCEEDS in CI (run 28339846431 app log: `USER_LOOKUP_OK`, `PASSWORD_COMPARE_OK {valid:true}`,
    `SESSION_CREATE_OK`, `[LOGIN] SUCCESS`).
- **Current root cause (run 28339846431 app log):** after login the owner APIs deny with
  `403 Missing capabilities: owner:view` (`/api/owner/businesses`, `/api/owner/command-center`,
  `/api/owner/control-center`). The seed created the workspace membership (role "owner") but NOT a
  workspace-scoped `UserRoleAssignment`. Capabilities derive from `UserRoleAssignment` rows
  (`getPolicyContext` in src/services/auth.ts), NOT the membership string — exactly as production signup
  does (src/app/api/auth/signup/route.ts grants `ROLES.ADMIN_OR_PORTFOLIO_MANAGER`, which carries
  `OWNER_VIEW`/`OWNER_MANAGE`). Without it every `/api/owner/*` call is correctly 403.
- **Second requirement:** the control-center panel (`[data-testid="owner-control-center"]`) only renders
  when `hasData && profile` (business-condition needs ≥1 domain diagnosis cycle). The archetype seeds
  operational data but no diagnosis → `hasData=false`. Seed now also runs a finance snapshot + diagnosis
  on the archetype business.
- **Fix (this pass):** `scripts/seed-e2e-owner.ts` now (a) upserts the workspace-scoped
  `UserRoleAssignment` (admin_or_portfolio_manager) and (b) runs `createFinancialSnapshot` +
  `runFinanceDiagnosis` so the command center reports data and the panel renders.
- **Status:** FIX_PUSHED — awaiting owner-e2e run.
- **Run IDs:** 28338771459 (health-gate), 28339662050 (login path), 28339846431 (login OK → 403 owner:view), `<new>`.

## A. GAP-CI-FLAKE-01 — full DB suite
- **Exact failing tests captured (flake-diagnose run 28339662068, FLAKEDIAG markers):** in the maintained
  blocking lane (quarantine-excluded) the real failures are 9 owner-module DB tests —
  `owner-{cashflow,finance,home,marketing,operations,sales,sop,strategy}/services.db.test.ts` and
  `owner-finance/persistence.db.test.ts`. (`rp1-phase3-...` and `first-value.test.ts` also showed in the
  raw diagnostic but are already in `.claude/test-quarantine.json`, so they are NOT in the blocking lane.)
- **Root cause:** every failing case records a governed verification, then tears down with a bare
  `db.ownerBusiness.delete()`. The `20260628210000_governed_verification_restrict` migration set the 7
  verification tables' `business_id`/`action_id` FKs to `ON DELETE RESTRICT` (14 FKs) — so deleting the
  business while a verification exists is (correctly) blocked → `PrismaClientKnownRequestError`. This is a
  self-inflicted regression of the teardown, not an order-dependent flake; the RESTRICT guard is the
  intended governance behavior (a verification must not be silently destroyed by deleting its parent).
- **Fix (this pass):** new `src/__tests__/test-helpers/owner-business-teardown.ts` deletes the business's
  verification rows (all 7 modules) first, then the business (other children still cascade). All 9 files
  now call `teardownOwnerBusiness(businessId)` instead of the bare delete. No assertion weakened, no
  quarantine added, `canonical_events` never touched.
- **Status:** FIX_PUSHED — awaiting ci.yml blocking-lane green.
- **Run IDs:** 28339662068 (diagnostic with exact list), `<new ci.yml>`.

## Attempted fixes log
1. e2e health-check `-f` removal — pushed.
2. flake-diagnose retargeted to DB-relevant files with fast failure capture — pushed; yielded exact list.
3. e2e login path `/auth/login`→`/login` — pushed; login now succeeds.
4. e2e seed: add workspace-scoped UserRoleAssignment (owner:view) + finance diagnosis — this pass.
5. DB: governed `teardownOwnerBusiness` helper (delete verifications before business) in 9 files — this pass.
