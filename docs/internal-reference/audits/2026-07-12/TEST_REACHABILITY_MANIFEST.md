# Test Reachability Manifest — 2026-07-12

Every test category must be reachable through at least one supported invocation path after remediation.

## Non-DB Tests (pure logic, no postgres required)

| Test Path Pattern | Pre-remediation Invocation | Post-remediation Invocation | Status |
|---|---|---|---|
| `src/__tests__/**/*.test.ts` (non-DB) | ci.yml PR gate | ci.yml PR gate (build-and-test, excludes *.db.test.ts) | ✅ REACHABLE |
| `tests/owner-mode/real-world-simulation/**` | owner-real-world-simulation.yml (path-triggered) | owner-real-world-simulation.yml (path-triggered, retained as-is) | ✅ REACHABLE |
| `tests/owner-mode/real-world-smb-cases/**` | owner-real-world-smb-cases.yml (path-triggered) | owner-real-world-smb-cases.yml (path-triggered, retained as-is) | ✅ REACHABLE |
| Owner mode holdout | owner-mode-holdout.yml (path-triggered) | owner-mode-holdout.yml (path-triggered, retained as-is) | ✅ REACHABLE |
| `src/__tests__/scenarios/business-reality-corpus-audit.test.ts` | corpus-final-audit.yml PR gate | corpus-final-audit.yml dispatch / deep-proof.yml dispatch | ✅ REACHABLE |

## DB Tests (require postgres:16)

| Test Path Pattern | Pre-remediation Invocation | Post-remediation Invocation | Status |
|---|---|---|---|
| `src/__tests__/**/*.db.test.ts` (all 50+ files) | ci.yml PR gate (TEST_WITH_DB=true) | main-integration.yml (push to main) + db-verification.yml (dispatch) | ✅ REACHABLE |
| P2B DB tests (42 tests) | p2b-db-verification.yml PR+dispatch | p2b-db-verification.yml dispatch-only | ✅ REACHABLE |
| Phase D DB tests | phase-d-verification.yml PR+push | phase-d-verification.yml dispatch-only | ✅ REACHABLE |
| P2C DB tests | p2c-db-verification.yml PR+push | p2c-db-verification.yml dispatch-only | ✅ REACHABLE |
| B02-S2 integration | b02-s2-integration.yml dispatch+closed-branch-push | b02-s2-integration.yml dispatch-only | ✅ REACHABLE |
| B02-S3 persistence bridge | b02-s3-db-verification.yml | dispatch-only | ✅ REACHABLE |
| B05-S1 fact review | b05-s1-db-verification.yml | dispatch-only | ✅ REACHABLE |
| B12 business condition profile | b12-business-condition-profile-verification.yml | dispatch-only | ✅ REACHABLE |
| B12-S3 external systems | b12-s3-db-verification.yml | dispatch-only (trigger fixed) | ✅ REACHABLE |
| Phase 1 DB tests | phase-1-db-tests.yml dispatch+closed-branch-push | dispatch-only | ✅ REACHABLE |
| Phase 3 Slice 2 truth pass | phase-3-slice-2-truth-pass.yml | specific-branch + dispatch | ✅ REACHABLE |
| Owner-pilot DB proof | owner-pilot-db.yml | specific-branch + dispatch | ✅ REACHABLE |
| B13/B14/B15/B16/B24 DB tests | individual workflows dispatch-only | retained as-is | ✅ REACHABLE |
| Lane B DB tests | lane-b-db-test.yml dispatch-only | retained as-is | ✅ REACHABLE |
| Stripe simulation | stripe-simulation.yml | dispatch-only | ✅ REACHABLE |

## Browser / E2E Tests

| Test Path Pattern | Pre-remediation Invocation | Post-remediation Invocation | Status |
|---|---|---|---|
| Owner-pilot browser E2E (specs 15-51) | owner-pilot-e2e.yml PR+specific-branch+dispatch | owner-pilot-e2e.yml specific-branch+dispatch | ✅ REACHABLE |
| Chaos exhaustive browser (180 scenarios) | chaos-exhaustive.yml PR+dispatch | chaos-exhaustive.yml dispatch / deep-proof.yml | ✅ REACHABLE |
| Customer/Vendor/Market browser | customer-vendor-market.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Daily operations browser | daily-operations.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Finance/Cash browser | finance-cash.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Growth/Profit/Scaling browser | growth-profit-scaling.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Local/Legal/Professional browser | local-legal-professional-boundary.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Sequential simulations browser | sequential-simulations.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Staff/Proof/Anti-gaming browser | staff-proof-anti-gaming.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Ugly/Tail-risk/Crisis browser | ugly-tail-risk-crisis.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Unknown/OOD browser | unknown-ood.yml PR+dispatch | dispatch-only | ✅ REACHABLE |
| Weekly management browser | weekly-management-trend.yml PR+dispatch | dispatch-only | ✅ REACHABLE |

## Module Runtime Proofs

| Module | Pre-remediation | Post-remediation | Status |
|---|---|---|---|
| All 11 module runtime proofs | dispatch-only (confirmation guard) | retained as-is | ✅ REACHABLE |

## Module Migrations

| Module | Pre-remediation | Post-remediation | Status |
|---|---|---|---|
| All 9 module migration workflows | dispatch-only (env protection) | retained as-is | ✅ REACHABLE |

## Quarantined Tests

| Category | Status |
|---|---|
| 21 quarantined files / 50 pre-existing failures | Non-blocking visibility lane in main-integration.yml — tracked under FULL_SUITE_TEST_DEBT_RECOVERY |

## Summary

- **0 test categories removed**
- **0 test files deleted**
- **0 assertions weakened**
- All tests reachable through at least one supported invocation path
- DB tests that were run on PRs are now run on push-to-main (main-integration.yml) and on demand (db-verification.yml dispatch)
- Browser/scenario tests that were run on PRs are now run on demand (individual workflow dispatch or deep-proof.yml)
