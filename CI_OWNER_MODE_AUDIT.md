# CI Owner Mode Audit

**Date:** 2026-06-23  
**Branch:** claude/cool-ptolemy-dxrpm7

---

## Workflows added

### `.github/workflows/owner-real-world-simulation.yml`

- **Trigger**: Push or PR touching simulation fixtures, engine, composer, or scoring contracts
- **Steps**: typecheck (non-blocking, informational), full simulation suite (`npm run test:owner-real-world-simulation`)
- **Gate**: Fails if any simulation case regression below PASS_THRESHOLD
- **Environment**: `TEST_WITH_DB="false"` for pure-logic speed; Lane A (no DB writes)

### `.github/workflows/owner-mode-holdout.yml`

- **Trigger**: Push or PR touching holdout fixtures, engine, domain code
- **Steps**: typecheck, fixture schema validation, sidecar validation, full holdout runner
- **Gate**: Enforces fixture integrity; holdout scores reported but not gated (sealed first-run state documented in `HOLDOUT_FIRST_RUN_REPORT.md`)
- **Anti-tuning rule**: Documented in workflow comments — re-running against sealed holdout to tune engine is prohibited
- **Environment**: `TEST_WITH_DB="false"`

## Pre-existing CI (not touched)

- Standard Next.js build/lint/type-check workflows remain unchanged
- No modifications to existing CI configuration

## Coverage

| Test suite | CI workflow | Gate |
|------------|-------------|------|
| `test:owner-real-world-simulation` (337 tests) | `owner-real-world-simulation.yml` | Hard fail on regression |
| `test:owner-real-world-smb` (455 tests) | Included in simulation workflow scope | Hard fail on regression |
| Holdout (10 cases) | `owner-mode-holdout.yml` | Schema/leakage/integrity gates |
