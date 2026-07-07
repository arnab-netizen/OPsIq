# Runtime Environment Schema — Owner Self-Use

**Date:** 2026-07-07 · **Scope:** single-owner self-use deployment of OpsIQ.
**Machine-readable source:** [`REQUIRED_ENV_VARS.json`](./REQUIRED_ENV_VARS.json) (the env-consistency
test enforces this doc, that manifest, `.env.example`, and the two preflight scripts stay reconciled).

This schema documents the **real** environment contract, derived by inspecting code usage — not by
copying an aspirational list. Where an older module *declares* a variable but nothing on the boot/request
path reads it, that variable is called out explicitly as **phantom/unused** so it is never treated as a
blocker.

> This document lists variable **names** and behavior only. It contains **no secret values**. Never commit
> real secrets — supply them through your host's environment/secret manager.

---

## 1. Required to boot and serve (production)

| Variable | Value / format | Why it is required | Read where |
|---|---|---|---|
| `NODE_ENV` | `development` \| `staging` \| `production` | Governs production cookie `Secure`/`SameSite` and security branches. Unset ⇒ defaults to development (unsafe for a real host). | runtime |
| `DATABASE_URL` | `postgresql://USER:PASS@HOST:PORT/DB?schema=public` (pooled endpoint on Neon) | Prisma runtime connection to the governed data store. | runtime + build |
| `NEXT_PUBLIC_APP_URL` | `https://your-owner-host.example.com` | Public origin used to build absolute links across owner/dashboard pages. `NEXT_PUBLIC_*` is inlined at **build** time, so it must be set before `npm run build`. | build + runtime |

Legacy alias: `NEXT_PUBLIC_API_URL` is accepted by `validate-deployment.ts` only. Set the canonical
`NEXT_PUBLIC_APP_URL`.

## 2. Migration-only (Prisma CLI / CI gate)

| Variable | Value / format | Notes |
|---|---|---|
| `MIGRATION_DATABASE_URL` | **direct** (non-pooler) `postgresql` URL | Used only by `prisma migrate deploy` (advisory locks/DDL need a direct endpoint). Falls back to `DATABASE_URL` when unset — fine for local/single-endpoint Postgres. The production migration gate (`.github/workflows/migrate-production.yml`) is **manual-only** and uses the `PRODUCTION_DATABASE_URL` secret. |

## 3. Optional (feature-gated; absence disables a feature, never blocks boot)

| Variable | Effect when unset |
|---|---|
| `STRIPE_SECRET_KEY` (canonical) / `STRIPE_API_KEY` (legacy alias) | Billing disabled; client is lazy, so import/boot never fails. |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhooks rejected/disabled. |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | No client-side Stripe. |
| `OPSIQ_DIAGNOSTIC_KEY` | Internal diagnostic/ops endpoints stay **fail-closed** (locked). Not needed for the owner journey. |
| `SENTRY_DSN` | No Sentry error tracking. |
| `LOG_LEVEL` (`debug`\|`info`\|`warn`\|`error`) | Defaults to `info`. Production should be `info`/`warn`; `debug` in production is flagged by `validate-deployment`. |
| `NEXT_PUBLIC_APP_NAME` | Defaults to `OpsIQ`. |
| `SESSION_EXPIRY_HOURS` | Defaults to `24`. |
| `PORT` | Defaults to `3000`. |

## 4. CI / test-only — MUST NOT be set in production

`TEST_WITH_DB`, `TEST_DATABASE_URL`, `DATABASE_URL_TEST`, `SKIP_ENV_VALIDATION`, `RUN_LIVE_AI`,
`LOGIN_RATE_LIMIT_MAX_ATTEMPTS`.

These enable test lanes, skip validation, or raise CI-only ceilings. `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` is
clamped `>=` the production default (10) so it can never weaken production, but it should still be left
unset on a real host. Owner self-use runs **no external LLM**, so `RUN_LIVE_AI` stays unset.

## 5. Phantom / unused — declared in dead modules, NOT wired into boot

Do **not** add these to a production environment expecting them to matter; nothing on the boot/request path
reads them.

| Variable | Declared in | Reality |
|---|---|---|
| `JWT_SECRET`, `ENCRYPTION_KEY` | `src/runtime/config/config-validator.ts` | That validator is imported **only by a test** — it is not called from `src/instrumentation.ts`, `middleware.ts`, or any route. |
| `AUTH_SECRET`, `AUTH_URL` | `src/lib/config.ts` (`getConfig`) | `getConfig()`/`isProduction()`/… are used nowhere in runtime. Auth is a DB-backed session cookie (bcrypt, no NextAuth, no signing secret). `AUTH_SECRET` is optional/forward-compat; `AUTH_URL` is set in CI e2e only. |
| `NEXTAUTH_SECRET`, `NEXTAUTH_URL` | login-diagnostic presence report / historical | NextAuth is not used. |

## 6. Boot path (what actually runs)

`src/instrumentation.ts#register()` → `initObservability()` (fail-open) → `ensureStartupComplete()`
(startup orchestrator; **no hard env gate** — it fails open and lets requests fail gracefully) → AI ledger
persistence sink. Prisma reads `DATABASE_URL`. There is no `requireValidStartup()`-style hard env gate on
the real path, which is why the *documented* required set is intentionally minimal and enforced through the
preflight scripts + this schema rather than a throw-on-boot.
