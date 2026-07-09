# Phase 5B — CI reliability hardening for browser-pack flakes (FINAL REPORT)

**Date:** 2026-07-09
**Branch:** `claude/phase-5b-ci-reliability-hardening`
**Base:** main @ `f92aaec`
**Scope:** CI/workflow-only. No product code, no test code, no assertions changed.

## 1. Main verification summary
- `git checkout main` + `git reset --hard origin/main` → HEAD `f92aaec` (Phase 5C, PR #204).
- `f92aaec` confirmed in ancestry; working tree clean.
- Main-push CI run `28991234538` (CI – Build & Test) finished **green**: build-and-test ✅ (governance,
  auth-governance, tsc, prisma validate/migrate/generate, build, wrapped-handlers ratchet, maintained
  vitest suite, quarantined non-blocking), lint ✅. Required gates GREEN. Proceeded.

## 2. Branch and HEAD
- Branch: `claude/phase-5b-ci-reliability-hardening`.
- HEAD before: `f92aaec`. HEAD after commit: see EVIDENCE_LEDGER (`head_after`).

## 3. Flake inventory summary
The required lane (`ci.yml`) already fixes two flakes — heap OOM (`NODE_OPTIONS=--max-old-space-size=4096`)
and transient `npm ci` ECONNRESET (bounded retry). The nine **non-required browser simulation packs**
never received those fixes and still exhibit them. The concrete failure on PR #204 was a
`next build` heap OOM / SIGABRT in `All-120 Staff/Proof desktop + mobile (1)` while its sibling shards
passed — a textbook NON_REQUIRED_INFRA_FLAKE. Full table: `CI_FLAKE_INVENTORY.md`.

## 4. Selected hardening batch and why
The safest, most mechanical batch: port the **already-proven** required-lane fixes to the nine
identical browser packs, plus make an app-start collapse legible. Four changes per pack:

1. **Heap bump scoped to the build step** — add `env: NODE_OPTIONS: "--max-old-space-size=4096"` on the
   `Build app` step. Scoped to the build-heavy step (Part D req 4), directly fixes the observed SIGABRT.
2. **Bounded `npm ci` retry** (3 attempts, linear backoff) on both jobs — mirrors `ci.yml`.
3. **Bounded `playwright install` retry** (3 attempts) — the apt-mirror/network install is a known flake.
4. **App-start failure classification** — if the app never answers on `:3001` within 120s, print
   `::error::APP_START_FAILED …`, dump `/tmp/app.log`, and `exit 1`. Turns a build/start collapse into a
   legible, honest failure instead of a misleading downstream Playwright "missing results" error.

Why this and not more: it is the minimal batch that removes the observed red board and the two flakes the
required lane already proved fixable, with essentially zero risk of masking a real defect.

## 5. Files changed (9, CI-only)
`.github/workflows/`: `staff-proof-anti-gaming.yml`, `ugly-tail-risk-crisis.yml`, `daily-operations.yml`,
`growth-profit-scaling.yml`, `customer-vendor-market.yml`, `weekly-management-trend.yml`, `unknown-ood.yml`,
`chaos-exhaustive.yml`, `sequential-simulations.yml`. Plus this audit folder (`docs/audits/…`).
Applied by a verified script that asserted the exact substitution count per block (npm ci ×2, build ×1,
playwright ×1, start ×1) and aborted on any mismatch — all nine matched exactly.

## 6. What was deliberately NOT changed
- `ci.yml` and other **required gates** (MVP Readiness, Security Baseline, Build+Type+Prisma Verify,
  branch-protection, owner-pilot-*) — untouched; required strictness preserved.
- No `continue-on-error` added anywhere. No job made non-required (they already were). No shard removed.
- `module-*` / `b*-*` / `smoke-production-*` / deploy / migrate workflows — also build without a heap
  bump but did **not** flake in observed waves and several are production/deploy paths → out of scope
  (NEEDS_MORE_EVIDENCE). Keeping the batch minimal.
- **Zero** application, service, or test files. No assertion changed. No test skipped/deleted/quarantined.

## 7. Proof that tests are not weakened
- `git diff` touches only `.github/workflows/*` and `docs/*`. No `src/**`, no `tests/**`, no
  `*.test.ts`, no `.claude/test-quarantine.json`.
- Every playwright/vitest invocation in the packs is unchanged (same specs, same `--project`, same
  count assertions e.g. "SPA DB 120/120").
- Retries are **bounded** (3 attempts); after exhaustion the command's real exit status stands and the
  step fails. The new app-start guard **adds** a failure path (never removes one).

## 8. Validation commands (run locally)
- `python3 harden.py` → `ALL_OK` (per-block substitution counts asserted).
- YAML parse of every `.github/workflows/*.yml` via `yaml.safe_load_all` → `YAML_OK`.
- `bash -n` on each embedded snippet (npm-ci retry, playwright retry, start-app guard) → OK.
- `git diff --stat` → 9 files, `+288 / −36`, workflows only.
- No TypeScript/DB/Playwright local run: no TS/DB/product files touched, and a full browser run needs CI
  infra. Those are **deferred to CI** (reported as deferred, not PASS).

## 9. CI results
See EVIDENCE_LEDGER `ci` block (filled after the PR run). Required gates must stay green; the nine packs
should now pass their build step (no SIGABRT) or, on a genuine collapse, fail with `APP_START_FAILED`.

## 10. Rollback plan
Pure workflow diff — revert the commit (or the nine files) to restore prior YAML exactly. No migration,
no state, no product surface; rollback is instantaneous and side-effect-free.

## 11. Recommended next phase
After 5B merges and main is GREEN, choose one (owner instruction required):
- **A.** Production migration execution — only on the exact phrase "I approve running the production
  migration." (not yet given).
- **D.** Remaining quarantine reduction.
- **E.** Full owner-journey Playwright/browser proof in local/preview only.
