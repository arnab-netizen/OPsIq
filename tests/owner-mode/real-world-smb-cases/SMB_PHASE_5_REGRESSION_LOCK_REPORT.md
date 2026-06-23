# SMB Phase 5 Regression Lock Report

## Task

`SMB_PHASE_5_REGRESSION_LOCK`

Lock the current honest SMB benchmark state. No code tuning. No scoring changes. No fixture changes. No new sub-mechanisms.

---

## Locked Supported Cases

9 supported cases (pass-rate denominator):

| Case | Archetype | Sub-mechanism | Locked Score | RCA.passed | BRA.passed |
|---|---|---|---|---|---|
| SMB-001 | WORKING_CAPITAL_STRESS | WC_CASH_CONVERSION_CYCLE | 0.86 | true | true |
| SMB-002 | INVENTORY_FORECASTING_MISMATCH | WC_INVENTORY_CASH_TRAP | 0.93 | true | true |
| SMB-003 | UNIT_ECONOMICS_FAILURE | UE_FIXED_COST_BREAKEVEN | 0.84 | true | true |
| SMB-004 | MARGIN_EROSION | null | 0.73 | true | true |
| SMB-006 | UNIT_ECONOMICS_FAILURE | UE_PREMATURE_EXPANSION | 0.80 | true | true |
| SMB-007 | OPERATIONAL_BOTTLENECK | OWNER_CAPACITY_CEILING | 0.86 | true | true |
| SMB-008 | WORKING_CAPITAL_STRESS | WC_BILLED_NOT_COLLECTED_GAP | 0.88 | true | true |
| SMB-010 | MARGIN_EROSION | MARGIN_COMMODITY_PASS_THROUGH | 0.86 | true | true |
| SMB-012 | UNIT_ECONOMICS_FAILURE | UE_PAID_ACQUISITION | 0.89 | true | true |

## Locked Unsupported Cases

3 unsupported cases (excluded from pass-rate denominator):

| Case | Status |
|---|---|
| SMB-005 | SCOPE GAP — archetype not modelled |
| SMB-009 | SCOPE GAP — archetype not modelled |
| SMB-011 | SCOPE GAP — archetype not modelled |

## Per-Case Score Floors

Floors set at locked score − 0.05 tolerance:

| Case | Locked Score | Floor |
|---|---|---|
| SMB-001 | 0.86 | 0.81 |
| SMB-002 | 0.93 | 0.88 |
| SMB-003 | 0.84 | 0.79 |
| SMB-004 | 0.73 | 0.68 |
| SMB-006 | 0.80 | 0.75 |
| SMB-007 | 0.86 | 0.81 |
| SMB-008 | 0.88 | 0.83 |
| SMB-010 | 0.86 | 0.81 |
| SMB-012 | 0.89 | 0.84 |

## Average Score Floor

Locked average: **0.8500**  
Floor: **0.80** (locked − 0.05)

## Pass Count Lock

**9/9** supported cases pass (totalScore ≥ 0.70 AND rca.passed AND bra.passed)

## Bad Recommendation Lock

**0 violations** across all 9 supported cases. BRA.passed = true for every case.

## Leakage Guard Lock

All multi-token must_identify phrases (≥2 meaningful tokens after normalization) from all 12 fixtures confirmed absent as double-quoted string literals in `smbOutputComposer.ts`. Single-token terms (DSO, CAC, etc.) exempt as they may appear as canonical metric label keys.

---

## Lock Groups

| Group | Description | Tests |
|---|---|---|
| L1 | Supported/unsupported set stability (fixture count, set membership, denominator isolation) | 4 |
| L2 | Per-case totalScore ≥ floor | 9 |
| L3 | Per-case ROOT_CAUSE_ALIGNMENT.passed = true | 9 |
| L4 | Per-case BAD_RECOMMENDATION_AVOIDANCE.passed = true | 9 |
| L5 | Zero bad recommendation violations (aggregate) | 1 |
| L6 | Supported pass count = 9/9 | 1 |
| L7 | Average totalScore ≥ 0.80 | 1 |
| L8 | Unsupported cases return scope-gap / abstention | 3 |
| L9 | Leakage guard — no must_identify literals in composer source | 63 |
| **Total** | | **100** |

---

## Commands Run

```
npm run test:owner-real-world-smb
  Test Files: 14 passed (14)
  Tests: 455 passed (455)
```

Score probe run separately to capture exact per-case baselines before writing floors.

## Files Changed

- `tests/owner-mode/real-world-smb-cases/smbRegressionLock.test.ts` — new file, 100 tests (9 lock groups)
- `tests/owner-mode/real-world-smb-cases/SMB_PHASE_5_REGRESSION_LOCK_REPORT.md` — this file

## Files NOT Modified

All production files, fixtures, sidecars, scoring contract, engine, and existing test files unchanged.

---

## Decision

Regression lock is in place. The honest benchmark state (9/9 supported pass, avg 0.85, 0 bad recs) is now defended by 100 permanent assertions across 9 lock groups. Any regression in composer output, sub-mechanism detection, or leakage will cause one or more lock tests to fail before it reaches main.

## Next Exact Prompt

Accept current state as complete. The SMB Owner Mode test-layer composer has reached:
- 9/9 supported cases pass
- Average score 0.85
- Zero bad recommendations  
- Zero leakage (all guards green)
- Permanent regression lock in place

OR: `SMB_PHASE_6_UNSUPPORTED_COVERAGE` — implement engine archetypes for SMB-005, SMB-009, SMB-011 to extend the modelled set from 9 to 12 cases.
