# Owner Self-Use Deploy Runbook

**Date:** 2026-07-07 · **Audience:** the single business owner (or their operator) deploying OpsIQ for
their **own** use. This is **not** a public-SaaS launch. No billing, no multi-tenant onboarding, no live
external integrations are required or enabled by following this runbook.

This runbook makes the owner self-use deployment **repeatable, explicit, and checkable**. It does not
deploy anything automatically and it never asks you to paste a secret into the repo.

Companion docs: [`RUNTIME_ENVIRONMENT_SCHEMA.md`](./RUNTIME_ENVIRONMENT_SCHEMA.md) ·
[`REQUIRED_ENV_VARS.json`](./REQUIRED_ENV_VARS.json) ·
[`DEPLOYMENT_PRECHECKLIST.md`](./DEPLOYMENT_PRECHECKLIST.md) ·
[`DEPLOYMENT_SMOKE_TEST_PLAN.md`](./DEPLOYMENT_SMOKE_TEST_PLAN.md) ·
[`ROLLBACK_AND_STOP_CONDITIONS.md`](./ROLLBACK_AND_STOP_CONDITIONS.md).

---

## 0. What you are deploying

A single-owner instance of OpsIQ: signup/login, the owner cockpit, the dedicated manual-entry form
(PASS 45), diagnosis, and the governed decision/evidence/approval surfaces. Everything runs against **one
Postgres database** you control. OpsIQ takes **no external action** on anyone's behalf.

## 1. Provision the three required inputs

You need exactly three things set in your host environment (see the schema for details):

1. `DATABASE_URL` — a PostgreSQL 16 database you own (Neon pooled URL, or your own Postgres). Keep the
   value in your host's secret manager, never in the repo.
2. `NODE_ENV=production`.
3. `NEXT_PUBLIC_APP_URL` — the exact HTTPS origin the app will be served from. Set this **before build**
   (it is inlined at build time).

Optional add-ons (Sentry, Stripe, diagnostic key) can be added later; none are needed to boot and serve.

## 2. Preflight (local or CI, before any deploy)

```bash
npm ci
npm run deployment:preflight     # env presence + node/package/prisma checks (prints [SET]/[NOT SET], never values)
npm run validate:deployment      # build artifacts, tsc, prisma validate, docs, security config
npx vitest run src/__tests__/deployment   # env-contract + consistency guards
```

Resolve every **BLOCKED** item before continuing. `WARNING` items (e.g. optional Stripe not set) are
acceptable for owner self-use. Work through [`DEPLOYMENT_PRECHECKLIST.md`](./DEPLOYMENT_PRECHECKLIST.md).

## 3. Build

```bash
# NEXT_PUBLIC_APP_URL and NODE_ENV must be present in the build environment.
npm run build
```

## 4. Apply database migrations (explicit, never automatic)

Migrations are a **separate, deliberate** step. Never let a deploy auto-migrate silently.

```bash
# Local / self-hosted: DATABASE_URL (or MIGRATION_DATABASE_URL for a direct endpoint) must point at the target DB.
npx prisma migrate status        # inspect first
npx prisma migrate deploy        # apply pending migrations only — never `migrate reset`, never seed
```

For a hosted production DB, use the manual-only gate `.github/workflows/migrate-production.yml`
(`workflow_dispatch`, `environment: production`, `PRODUCTION_DATABASE_URL` secret). It runs
`migrate status` + `migrate deploy` and is forbidden from seeding or resetting.

## 5. Start / serve

```bash
PORT=3000 npm run start          # or your host's start command; ensure NODE_ENV=production
```

## 6. Post-deploy smoke test

Run the smoke plan in [`DEPLOYMENT_SMOKE_TEST_PLAN.md`](./DEPLOYMENT_SMOKE_TEST_PLAN.md): `/login` reachable,
owner can log in, cockpit renders, the manual-entry form saves a redacted note and blocks PII, no fatal
console errors, no secret leakage in responses. Scripted smoke helpers already exist:
`npm run deployment:smoke` and `npm run smoke:prod`.

## 7. Record the release

Fill in [`OWNER_SELF_USE_RELEASE_NOTES_TEMPLATE.md`](./OWNER_SELF_USE_RELEASE_NOTES_TEMPLATE.md) with the
commit SHA, migration state, and smoke result so the deployment is reproducible.

## 8. If something is wrong

Follow [`ROLLBACK_AND_STOP_CONDITIONS.md`](./ROLLBACK_AND_STOP_CONDITIONS.md). Stop conditions include any
PII leak, any unexpected external-action attempt, auth failing open, or migration errors — halt and roll
back rather than pushing forward.

---

### Hard boundaries (unchanged by this runbook)

- No automatic deploy, no auto-migrate, no secret printed or committed.
- No public SaaS, billing, live integrations, LLM/NLP, or autonomous external action is enabled here.
- OpsIQ contacts no customers/staff/vendors and moves no money.
