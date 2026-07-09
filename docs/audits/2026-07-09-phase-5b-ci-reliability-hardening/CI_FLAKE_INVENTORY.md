# Phase 5B — CI flake inventory

**Date:** 2026-07-09
**Branch:** `claude/phase-5b-ci-reliability-hardening`
**Base:** main @ `f92aaec` (verified GREEN)

CI-only hardening of recurring non-required browser-pack flakes. No product/source/test changes.

## Method
Inspected `.github/workflows/*`, the required lane `ci.yml` (reference for the proven fixes), and the
observed failure on PR #204 (the most recent wave). Compared each browser-pack job's build/install/
start steps against the already-hardened `ci.yml` build-and-test job.

## Reference: what the required lane already does (ci.yml)
- `build-and-test` sets job-wide `NODE_OPTIONS: "--max-old-space-size=4096"` — comment: "`next build`'s
  TypeScript pass and the large test suite intermittently hit the default ~2 GB limit (FATAL: heap out
  of memory / SIGABRT). 4 GB removes that flake."
- `build-and-test` and `lint` wrap `npm ci` in a bounded 3-attempt retry (transient registry ECONNRESET).

The browser packs were **never given** either fix, so they still exhibit the flakes `ci.yml` already solved.

## Directly observed failure (PR #204)
| field | value |
|-------|-------|
| workflow | `staff-proof-anti-gaming.yml` |
| job / shard | `All-120 Staff/Proof desktop + mobile (1)` |
| symptom | `FATAL ERROR: Reached heap limit Allocation failed - JavaScript heap out of memory` → `Next.js build worker exited with code: null and signal: SIGABRT` during `npm run build` |
| required? | **non-required** (PR #204 stayed mergeable and merged with this shard red) |
| sibling shards | shard 2 ✅, `All-120 Staff/Proof DB-backed` ✅ — signature of infra OOM, not a product regression |
| product files in stack? | **no** — failure is in `next build`'s own worker, before any test/app code runs |
| root cause | `npm run build` runs with default ~2 GB Node heap; no `NODE_OPTIONS` bump |
| classification | **NON_REQUIRED_INFRA_FLAKE** |

## Inventory (browser-pack family — identical step structure)
All nine packs below share a byte-identical browser job: `npm ci` → prisma → `npm run build` →
`playwright install --with-deps chromium` → seed → start app → playwright shards. Each row is the same
defect profile as the observed failure.

| # | workflow | browser job | required? | root cause(s) | sibling shards | product in log? | current behavior | recommended hardening | risk of hiding real failure |
|---|----------|-------------|-----------|---------------|----------------|-----------------|------------------|-----------------------|------------------------------|
| 1 | staff-proof-anti-gaming.yml | All-120 Staff/Proof desktop + mobile | non-required | build OOM; no npm/pw retry; silent app-start collapse | independent per shard | no | build @ default heap; `npm ci`/`playwright install` no retry; start loop never fails | heap bump on build; bounded npm/pw retry; app-start classification | LOW — heap only adds memory; retries bounded; final failure still fails |
| 2 | ugly-tail-risk-crisis.yml | All-150 Ugly/Tail-Risk/Crisis desktop + mobile | non-required | same | same | no | same | same | LOW |
| 3 | daily-operations.yml | All-300 Daily Operations desktop + mobile | non-required | same | same | no | same | same | LOW |
| 4 | growth-profit-scaling.yml | All-150 Growth/Profit/Scaling desktop + mobile | non-required | same | same | no | same | same | LOW |
| 5 | customer-vendor-market.yml | All-100 Customer/Vendor/Market desktop + mobile | non-required | same | same | no | same | same | LOW |
| 6 | weekly-management-trend.yml | All-150 Weekly Management/Trend desktop + mobile | non-required | same | same | no | same | same | LOW |
| 7 | unknown-ood.yml | All-110 Unknown/OOD desktop + mobile | non-required | same | same | no | same | same | LOW |
| 8 | chaos-exhaustive.yml | All-180 desktop + representative mobile chaos browser | non-required | same | same | no | same | same | LOW |
| 9 | sequential-simulations.yml | Sequential Simulations desktop + mobile | non-required | same | same | no | same | same | LOW |

## Classification summary
- **SAFE_TO_HARDEN_NOW:** rows 1–9 (this batch). Same proven fixes already live in the required lane.
- **DO_NOT_TOUCH_REQUIRED_GATE:** `ci.yml` (already hardened), `mvp-readiness.yml`, Security Baseline,
  `Build + Type + Prisma Verify`, `owner-pilot-*` — left untouched; required strictness preserved.
- **PRODUCT_FAILURE_NOT_INFRA:** none observed this wave.
- **NEEDS_MORE_EVIDENCE:** the many `module-*`/`b*-*`/`smoke-production-*`/deploy/migrate workflows also
  run `npm run build` without a heap bump, but none flaked in the observed waves and several are
  deploy/production paths — deliberately **out of scope** for this minimal batch (see FINAL_REPORT §6).

## Not changed (deliberately)
- No required gate behavior changed. No `continue-on-error` added anywhere. No shard removed. No test
  skipped/deleted/quarantined. No assertion weakened. No application or test-harness source touched.
