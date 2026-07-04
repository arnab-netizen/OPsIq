# Holdout Infrastructure Audit

**Date:** 2026-06-23  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Auditor:** Post-owner-mode completion loop

---

## 1. Runner (STATUS: OK)

- **10 holdout cases**: HOL-01-001 through HOL-10-001
- **Command**: `npx vitest run tests/owner-mode/holdout`
- **First-run pass rate**: 1/10 = 10% (sealed in `HOLDOUT_FIRST_RUN_REPORT.md`)
- **Separate from simulation runner**: YES — `TEST_WITH_DB="false"` (pure logic, Lane A); no DB access required; configuration disjoint from SIM-* tests
- **Workflow**: `.github/workflows/owner-mode-holdout.yml` triggers on push/PR touching holdout fixtures or engine/domain code

## 2. Leakage (STATUS: OK)

- **No ID overlap**: HOL-* fixture IDs are completely disjoint from SIM-* and SMB-* corpora
- **Sidecar leakage check**: 67/67 evidence items across 10 cases have `no_outcome_leakage: true`; source paths forbidden from referencing `sealed_expected_output`
- **Anti-tuning mechanism**: Composer/engine not tuned against holdout expected outputs; git history shows no subsequent changes in response to holdout results after the Phase 5 seal commit
- **Vocabulary isolation**: `no_outcome_leakage` validation covers must_identify terms and answer-key vocabulary

## 3. CI Workflow (STATUS: OK)

- **File**: `.github/workflows/owner-mode-holdout.yml` (created 2026-06-23)
- **Enforces**: fixture schema validation, sidecar validation, normalizer, leakage checks, `TEST_WITH_DB="false"`
- **Anti-tuning rule** documented in workflow comments: "Re-running scores against sealed holdout is prohibited"
- **Non-blocking typecheck** included

## 4. Reproducibility (STATUS: OK)

- **Deterministic**: Fixed namespace UUID `STABLE_NAMESPACE = "6ba7b810-9dad-11d1-80b4-00c04fd430c8"`; all timestamps hardcoded `FIXED_DATE = new Date("2026-06-23T00:00:00Z")`; no `Math.random()` or sampling in holdout harness
- **Hermetic**: No HTTP/fetch/axios/external API calls; runs pure functions (normalize → diagnose → compose → score); DB connection errors in global setup bypassed by holdout tests

## 5. ESLint (STATUS: OK)

- `npx eslint tests/owner-mode/holdout --ext .ts` exits with 0 violations
- All imports resolved; no dead code detected

---

## Summary

All 5 holdout infrastructure concerns verified passing. The holdout corpus is properly sealed, isolated from the simulation and SMB corpora, deterministic, hermetic, and protected against accidental tuning.
