# Rollback & Stop Conditions — Owner Self-Use

**Date:** 2026-07-07. When any stop condition is hit, **halt the deploy and roll back** rather than pushing
a fix forward under load. A single-owner instance is easy to revert; do it.

## Stop conditions (halt immediately)

1. **PII leak or PII stored.** The manual-entry PII guard fails to block a name/phone/email (smoke S6), or
   raw PII is found in the DB or any response. Governed privacy invariant — no exceptions.
2. **Unexpected external action.** Any attempt by the app to contact a customer/staff/vendor/third party,
   move money, submit a tender, or change a contract/payroll. This must never happen; if observed, halt.
3. **Auth fails open.** An unauthenticated request reaches an owner-only surface, or a session cookie is
   issued without `Secure` in production (smoke S3).
4. **Diagnostic endpoints open without a key.** `/api/internal/*` or `/api/ops/*` respond with privileged
   data while `OPSIQ_DIAGNOSTIC_KEY` is unset (smoke S11).
5. **Secret leakage.** `DATABASE_URL`, a Stripe key, `whsec_`, or the diagnostic key appears in any
   response, client bundle, or log (smoke S9).
6. **Migration error / partial migration.** `prisma migrate deploy` errors, or `migrate status` shows a
   partial/failed state after the run.
7. **Boot instability.** The app crashes on start, or repeatedly throws fatal console errors on core pages.

## Rollback procedure

1. **Stop taking traffic** to the new version (revert the host to the previous known-good release, or take
   the instance offline if this is the first deploy).
2. **Application code:** redeploy the previous known-good commit/build. Keep the current one for diagnosis.
3. **Database:**
   - If migrations had **not** yet been applied, no DB action is needed — just revert the app.
   - If migrations **were** applied and are the cause, restore from the pre-deploy backup/snapshot taken in
     the prechecklist (§C). Prisma migrations are not auto-reversible on a real owner DB; **never** run
     `migrate reset` against it. Prefer restore-from-backup.
4. **Verify** the rolled-back state with the smoke plan (`/login`, owner login, cockpit).
5. **Record** what happened in the release notes (stop condition hit, action taken, DB state).

## After a rollback

- Reproduce the failure locally / in CI (the env-consistency and deployment tests, plus the browser specs)
  before re-attempting.
- Do **not** re-deploy until the specific stop condition is understood and covered by a test or an explicit
  documented mitigation.

## Non-stop (acceptable) conditions

- Optional feature disabled because its var is unset (Stripe billing off, Sentry off) — expected for
  owner self-use; note it, continue.
- `validate:deployment` / `deployment:preflight` reporting `WARNING` (not `BLOCKED`) for optional vars.
