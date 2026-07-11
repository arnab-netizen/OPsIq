# Phase R0 — CI Lane Truthfulness

**Date:** 2026-07-10 (updated 2026-07-11 after Part E whole-repo audit)
**Invariant:** INV-7 — CI_LANE_TRUTHFULNESS
**Finding:** 5 CONFIRMED_MEDIUM violations found in workflow files (previously under-reported as 0)

---

## Verified Test Counts

All Phase R0 test files verified against actual jest output before commit.

| Test file | Expected | Passed | Failed | Skipped |
|---|---|---|---|---|
| `budget-spend-idempotency-r0.test.ts` | — | ✓ | 0 | 0 |
| `finance-snapshot-audit-transaction-r0.test.ts` | — | ✓ | 0 | 0 |
| `do-not-repeat-phantom-field-r0.test.ts` | — | ✓ | 0 | 0 |
| `hostile-auth-tests.test.ts` (converted) | — | ✓ | 0 | 0 |

Total: 4 suites, **49 tests, 49 passed** (verified via jest run)

---

## Prior Phase Test Counts (Reference)

| Phase | Test file | Count | Status |
|---|---|---|---|
| 6J | `diagnosis-workspace-tenant-isolation-6j.test.ts` | 22 | 22/22 PASS |

---

## CI Classification Policy

For this repository, CI lanes report as:

- `HONEST_GREEN` — all tests pass, no fake assertions in changed files, typecheck PASS, lint PASS
- `DEGRADED_GREEN` — all tests pass but some fake assertions remain (acceptable when explicitly tracked)
- `RED` — test failures present

**Phase R0 target:** HONEST_GREEN on all new test files.
**Phase R0 classification for hostile-auth conversion:** DEGRADED_GREEN — 22/25 tests use
Phase R1 deferred placeholder assertions (not fake — they assert the deferred string, not `true`).

---

## Part E Whole-Repo Audit Findings (2026-07-11)

*Source: no-idle root-cause audit agent run during Phase R0 enforcement.*

| ID | File | Location | Pattern | Classification |
|---|---|---|---|---|
| D9-01a | `.github/workflows/ci.yml` | line 191 | `continue-on-error: true` on "Run linter" | CONFIRMED_MEDIUM — full lint run non-blocking; ratchet only blocks net-new debt; existing failures invisible |
| D9-01b | `.github/workflows/phase-3-slice-2-truth-pass.yml` | line 109 | `npx eslint ... \|\| true` on Gate 5 | CONFIRMED_MEDIUM — eslint failures on `event-emitter.ts` and `recommendation.ts` unconditionally swallowed |
| D9-01c | `.github/workflows/owner-real-world-smb-cases.yml` | line 35 | `npx tsc --noEmit ... \|\| true` | CONFIRMED_MEDIUM — TypeScript errors never fail CI for this workflow |
| D9-01d | `.github/workflows/owner-real-world-simulation.yml` | line 35 | `npx tsc --noEmit ... \|\| true` | CONFIRMED_MEDIUM — same pattern |
| D9-01e | `.github/workflows/owner-mode-holdout.yml` | line 35 | `npx tsc --noEmit ... \|\| true` | CONFIRMED_MEDIUM — same pattern |
| — | `.github/workflows/ci.yml` | line 143 | `continue-on-error: true` on quarantined tests | FALSE_POSITIVE — intentional visibility lane per inline comment |
| — | `.github/workflows/deploy-staging.yml` | lines 101, 110 | `continue-on-error: true` on stubs | FALSE_POSITIVE — integration/smoke steps are stubs with echo; not hiding real test results |
| — | `.github/workflows/mvp-readiness.yml` | line 107 | `continue-on-error: true` on TODO counter | FALSE_POSITIVE — advisory metric, no enforcement intent |

**Disposition:** D9-01 (a–e) grouped as finding D9-01, DEFERRED_R1. Fix requires removing `|| true` suppressions and replacing with correct non-blocking patterns (advisory steps with `continue-on-error: true` at the step level are acceptable; swallowing compiler/linter output with `|| true` is not).

Note: `resolve-failed-migration.yml:314` (`npx vitest run ... || true`) was also flagged. Classified DEFERRED_R1 alongside D9-01.

---

## False Positive History

| Phase | Claim | Verdict |
|---|---|---|
| D5-01 (6J) | Phase 6I tests were fake assertions | FALSE_POSITIVE — tests verified real at commit 716440227059b41673b7798da8d38a18b258f36d |
| D10-01 (6J) | Capability matrix overclaims | FALSE_POSITIVE — matrix accurately reflects implemented routes |
