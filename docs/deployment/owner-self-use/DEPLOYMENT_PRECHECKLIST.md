# Deployment Prechecklist — Owner Self-Use

**Date:** 2026-07-07. Run top to bottom before every owner self-use deploy. Every item is checkable with a
command in the repo; none require pasting a secret anywhere but your host's secret manager.

## A. Environment contract
- [ ] `NODE_ENV=production` set in the deploy environment.
- [ ] `DATABASE_URL` points at the **owner's own** Postgres (not a test DB, not default `postgres:postgres` creds).
- [ ] `NEXT_PUBLIC_APP_URL` equals the exact HTTPS origin, set **before build**.
- [ ] No CI/test-only var is set in production: `TEST_WITH_DB`, `TEST_DATABASE_URL`, `DATABASE_URL_TEST`, `SKIP_ENV_VALIDATION`, `RUN_LIVE_AI`, `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` all unset.
- [ ] Optional services intentionally decided (Sentry / Stripe / `OPSIQ_DIAGNOSTIC_KEY`): unset ⇒ that feature is simply off (acceptable for self-use).
- [ ] `npm run deployment:preflight` → not `BLOCKED`.
- [ ] `npm run validate:deployment` → not `BLOCKED`.
- [ ] `npx vitest run src/__tests__/deployment` → all green (env contract + consistency guard).

## B. Code / build integrity
- [ ] On the intended commit; `git status` clean (or intentional).
- [ ] `npm ci` completes; `package-lock.json` committed.
- [ ] `npx tsc --noEmit` clean.
- [ ] `npm run build` succeeds with the production `NEXT_PUBLIC_APP_URL`.
- [ ] `npx prisma validate` passes.

## C. Database
- [ ] Target DB reachable from the deploy environment.
- [ ] `npx prisma migrate status` reviewed — pending migrations understood.
- [ ] Backup/snapshot taken (or the DB is empty/new) before `migrate deploy`.
- [ ] Migrations applied via `migrate deploy` (or the manual production gate) — never `migrate reset`, never seed into a real owner DB.

## D. Security / privacy posture
- [ ] No secrets committed; `.env`/`.env.local` are git-ignored and absent from the repo.
- [ ] `NODE_ENV=production` so cookies are `Secure`.
- [ ] `LOG_LEVEL` is `info`/`warn` (not `debug`) in production.
- [ ] `OPSIQ_DIAGNOSTIC_KEY` unset (diagnostic/ops endpoints stay fail-closed) unless the owner deliberately needs them.
- [ ] Manual-entry PII guard verified in smoke (a PII note is blocked client + server).

## E. Sign-off
- [ ] Smoke plan ready to run immediately post-deploy.
- [ ] Rollback + stop conditions read and understood.
- [ ] Release notes template ready to fill in.

> If any A–D box cannot be checked, **do not deploy**. Fix or explicitly document the exception in the
> release notes first.
