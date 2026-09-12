# FINAL — Deploy Manifest + Runtime Environment Readiness (PASS 46)

**Date:** 2026-07-07 · **Branch:** `claude/deploy-manifest-runtime-env-readiness`
**Base main:** `94ba7c5c` (contains PASS 45 #177)
**Classification:** `DEPLOY_RUNTIME_READINESS_ACCEPTED`

## Objective
Narrow restriction **R2** (owner self-use deployment not repeatable/explicit/checkable) by documenting and
validating the **real** runtime environment contract and adding a lightweight, CI-enforced env-consistency
guard — **without** deploying automatically, exposing any secret, or adding billing / public-SaaS work.

## What was delivered

### A. Deployment pack — `docs/deployment/owner-self-use/`
`OWNER_SELF_USE_DEPLOY_RUNBOOK.md`, `RUNTIME_ENVIRONMENT_SCHEMA.md`, `REQUIRED_ENV_VARS.json` (canonical
machine-readable manifest), `DEPLOYMENT_PRECHECKLIST.md`, `DEPLOYMENT_SMOKE_TEST_PLAN.md`,
`ROLLBACK_AND_STOP_CONDITIONS.md`, `OWNER_SELF_USE_RELEASE_NOTES_TEMPLATE.md`.

### B. Audit artifacts — `docs/audits/2026-07-07-deploy-manifest-runtime-env-readiness/`
This report + `ENV_VAR_MATRIX.json`, `DEPLOYMENT_RISK_MATRIX.json`, `SMOKE_TEST_MATRIX.json`,
`EVIDENCE_LEDGER.json`, `DEFERRED_BROAD_GAPS.md`.

### C. Env-consistency guard — `src/__tests__/deployment/owner-self-use-env-contract-consistency.test.ts`
12 assertions, no DB, no env values. Fails CI if the manifest, `.env.example`, `deployment-preflight.mjs`,
and `validate-deployment.ts` ever drift, if a CI/test-only var is declared production-required, if a phantom
var is re-added as required, or if a real secret value appears in the manifest.

## The real env contract (verified by code inspection, not assumption)

| Class | Vars |
|---|---|
| **Required (prod boot & serve)** | `NODE_ENV`, `DATABASE_URL`, `NEXT_PUBLIC_APP_URL` |
| **Migration-only** | `MIGRATION_DATABASE_URL` (direct URL; falls back to `DATABASE_URL`) |
| **Optional (feature-gated)** | Stripe (`STRIPE_SECRET_KEY`/legacy `STRIPE_API_KEY`, `STRIPE_WEBHOOK_SECRET`, publishable), `OPSIQ_DIAGNOSTIC_KEY` (fail-closed), `SENTRY_DSN`, `LOG_LEVEL`, `NEXT_PUBLIC_APP_NAME`, `SESSION_EXPIRY_HOURS`, `PORT` |
| **CI/test-only (never prod)** | `TEST_WITH_DB`, `TEST_DATABASE_URL`, `DATABASE_URL_TEST`, `SKIP_ENV_VALIDATION`, `RUN_LIVE_AI`, `LOGIN_RATE_LIMIT_MAX_ATTEMPTS` |
| **Phantom/unused (NOT wired to boot)** | `JWT_SECRET`, `ENCRYPTION_KEY` (`config-validator.ts`, test-only import), `AUTH_SECRET`, `AUTH_URL` (`lib/config.ts` `getConfig`, used nowhere), `NEXTAUTH_SECRET`, `NEXTAUTH_URL` |

**Key finding:** two modules *declare* env requirements that nothing on the boot/request path reads —
`config-validator.ts` (`JWT_SECRET`/`ENCRYPTION_KEY`; imported only by a test) and `getConfig()` in
`lib/config.ts` (`AUTH_SECRET`/`AUTH_URL`; imported nowhere in runtime). Auth is a DB-backed session cookie
(bcrypt, no NextAuth, no signing secret), so these are documented as **phantom** and the consistency test
prevents them from ever being treated as required. The required set is therefore the minimal, honest
`NODE_ENV` / `DATABASE_URL` / `NEXT_PUBLIC_APP_URL` — already consistent across `.env.example`, both
preflight scripts, and now the manifest.

## Gates (local, this branch)
- `npx prisma validate` — **PASS**
- `npx tsc --noEmit` — **PASS**
- `npx vitest run src/__tests__/deployment` — **55/55** (new consistency test 12/12; existing
  bootable-production-env-contract still green)
- `npm run governance:scan:strict` — **31 frozen / 0 new**
- `npm run lint:ratchet` — **LINT_RATCHET_PASS (0 new; 0 changed-file lint errors)**
- `npm run build` — **PASS** (Next.js 16 production build compiled successfully; full route table generated). CI "Build + Type + Prisma Verify" re-runs it as the authoritative PR gate.

## Safety posture (all held)
- **No automatic deployment, no auto-migration.** Migration is an explicit, separate step; production
  migration remains the manual-only `workflow_dispatch` gate (never seed/reset — already test-enforced).
- **No secret exposed.** Preflight prints `[SET]`/`[NOT SET]`; docs and manifest are names-only; the
  consistency test secret-scans the manifest for credentialed URLs / `sk_` / `whsec_`.
- **No new env vars invented** — every documented var has a real code reference.
- **No billing, public SaaS, live integrations, LLM/NLP, or external action** added or enabled.

## R2 status
**NARROWED.** Owner self-use deployment is now **repeatable** (runbook), **explicit** (prechecklist + manual
migration gate + release-notes template), and **checkable** (`deployment:preflight` + `validate:deployment`
+ the env-consistency test). Residual: the real boot path has no hard throw-on-missing-required-var gate —
caught pre-deploy by the preflight/precheck instead, and deferred (documented in `DEFERRED_BROAD_GAPS.md`).

## Classification justification
Real env contract documented and machine-readable; required set minimal and honest; phantom/CI-only vars
explicitly separated and test-guarded from the production-required set; deployment is repeatable + explicit
+ checkable with existing tooling plus one consistency guard; no auto-deploy, no secret exposure, no
billing/public-SaaS/external-action scope added; all local gates green. One documented residual (no hard
boot gate) with a pre-deploy mitigation. → **`DEPLOY_RUNTIME_READINESS_ACCEPTED`**.
