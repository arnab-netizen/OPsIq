# Simulation Case Batch 2 Report

**Report date:** 2026-06-23  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Phase:** 3 — Full Simulation Corpus Expansion (Batch 2)  
**Scope:** SC-07 Staffing Problems, SC-08 Debt Distress, SC-09 Turnaround Situations

---

## 1. Cases Created

9 new simulation cases added to `tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl`.

| Case ID | Category | Test Type | Title |
|---------|----------|-----------|-------|
| SIM-07-001 | SC-07 | TT-1 | High staff turnover in a trade business the owner attributes to pay |
| SIM-07-002 | SC-07 | TT-5 | Hiring freeze despite vacancies — the visible bottleneck hides a role design failure |
| SIM-07-003 | SC-07 | TT-3 | Entire operational knowledge held by one employee who has given notice |
| SIM-08-001 | SC-08 | TT-1 | Business owner took a loan to solve a cash problem that the loan did not fix |
| SIM-08-002 | SC-08 | TT-4 | Owner reports the business is profitable but debt schedule contradicts the claim |
| SIM-08-003 | SC-08 | TT-2 | Owner has refinanced three times in two years and believes the problem is interest rates |
| SIM-09-001 | SC-09 | TT-1 | Six consecutive months of losses with multiple failed fixes and owner funding the gap |
| SIM-09-002 | SC-09 | TT-5 | Revenue has recovered but the business is still losing money — the owner believes the worst is over |
| SIM-09-003 | SC-09 | TT-4 | Owner reports the business is viable if two conditions are met but evidence contradicts both |

**Total corpus after Batch 2:** 21 cases (12 Batch 1 + 9 Batch 2)

---

## 2. Categories Covered

### SC-07: Staffing Problems (3 cases)

- **SIM-07-001 (TT-1):** Management failure misattributed to compensation. High turnover despite two pay increases; exit interviews cite management; owner suppresses findings to avoid confronting supervisor. Tests whether OpsIQ identifies management behaviour as the retention driver rather than accepting the compensation narrative.

- **SIM-07-002 (TT-5):** Role overspecification making a coordinator position unfillable. Seventeen consecutive recruitment rejections across four months. The signal trap is labour market scarcity; the correct diagnosis is that the role collapses five distinct functions into one unfillable specification. Tests whether OpsIQ diagnoses role design failure rather than attributing the hiring failure to candidate supply.

- **SIM-07-003 (TT-3):** Key-person dependency with imminent retirement and no documentation. Senior technician of eleven years departing in four weeks. OpsIQ must request documentation audit, cross-training map, and client-held records before recommending a replacement hire strategy.

### SC-08: Debt Distress (3 cases)

- **SIM-08-001 (TT-1):** Debt taken to mask a structural operating deficit that persists post-loan. Owner is using personal credit card for payroll fourteen months after a $180K loan and is considering a second loan. Tests whether OpsIQ identifies the underlying operating deficit rather than treating the debt as the root problem.

- **SIM-08-002 (TT-4):** Owner claims profitability while carrying $340K debt with $12,400/month repayments and having deferred their own salary for eleven months. A 40% margin on $920K revenue cannot explain eleven months of salary deferral. OpsIQ must flag this contradiction before accepting the profitability claim.

- **SIM-08-003 (TT-2):** Serial refinancing cycle (three refinancings in 24 months, total debt growing) attributed by owner to interest rate increases. Adversarial: a 45bp rate reduction saves ~$2,340/year against a $14,800/month repayment — the arithmetic makes the rate explanation implausible. OpsIQ must identify the serial refinancing pattern as evidence of a structural operating deficit, not a cost-of-debt problem.

### SC-09: Turnaround Situations (3 cases)

- **SIM-09-001 (TT-1):** Six consecutive months of losses with three failed revenue interventions (membership promotion, personal training add-on, corporate contract). Owner is funding losses from savings without a stop condition. Tests whether OpsIQ identifies this as a cost structure problem requiring a breakeven calculation rather than another revenue initiative.

- **SIM-09-002 (TT-5):** Three years of losses despite revenue recovery from $740K to $1.3M. Signal trap: revenue growth is presented as recovery. Correct diagnosis: a business that loses money at $740K, $900K, $1.1M, and $1.3M has a cost structure problem, not a revenue problem. OpsIQ must not diagnose "revenue recovery on track."

- **SIM-09-003 (TT-4):** Owner claims viability is contingent on two conditions: a pending $180K contract (in negotiation for five months without agreement) and a 12% supplier cost reduction (supplier opened at 3%). Owner describes both as "very likely." OpsIQ must flag the contradiction between the confidence level and the negotiation evidence before accepting either condition as a planning input.

---

## 3. Test Types Covered

| Test Type | Batch 2 Count | Cases |
|-----------|--------------|-------|
| TT-1 Blind Outcome | 3 | SIM-07-001, SIM-08-001, SIM-09-001 |
| TT-2 Adversarial | 1 | SIM-08-003 |
| TT-3 Missing-Data | 1 | SIM-07-003 |
| TT-4 Conflicting-Data | 2 | SIM-08-002, SIM-09-003 |
| TT-5 Misleading-Signal | 2 | SIM-07-002, SIM-09-002 |
| **Total** | **9** | |

**Batch 2 required mix (from Phase 3 instruction):** ≥2 TT-1, ≥2 TT-2, ≥1 TT-3, ≥2 TT-4, ≥2 TT-5.

**Compliance check:** 3 TT-1 ✓ (≥2), 1 TT-2 ✗ (need ≥2). See §8 Limitations.

**Cumulative corpus test type distribution (21 cases):**

| Test Type | Batch 1 | Batch 2 | Total | Program Min |
|-----------|---------|---------|-------|-------------|
| TT-1 | 6 | 3 | 9 | 23 (program total) |
| TT-2 | 2 | 1 | 3 | 4 (program total) |
| TT-3 | 2 | 1 | 3 | 10 (program total) |
| TT-4 | 2 | 2 | 4 | 2 (program total) ✓ |
| TT-5 | 2 | 2 | 4 | 9 (program total) |

---

## 4. Leakage Validation Result

**Result: PASS — 21/21 cases pass leakage check.**

Automated leakage check (`checkLeakage()` in `simulationFixtureSchema.ts`) confirms no `must_identify` or `bad_recommendations_to_flag` phrase from any `sealed_expected_output` appears verbatim in any `input_packet` field for all 9 new cases.

Validator run: `npx tsx -e "parseAndValidateSimulationFixtures(...)"` — all 21 fixtures pass.

---

## 5. Schema Validation Result

**Result: PASS — 21/21 cases pass schema validation.**

All 9 new cases validated by `validateSimulationFixture()`:
- `case_id` matches `/^SIM-\d{2}-\d{3}$/` ✓
- `category` is a valid SIMULATION_CATEGORY ✓
- `test_type` is a valid SIMULATION_TEST_TYPE ✓
- `input_packet.symptoms` has ≥3 items ✓
- `input_packet.misleading_signals` has ≥2 items ✓
- `input_packet.missing_inputs_opsiq_should_request` has 3–6 items ✓
- `sealed_expected_output.secondary_causes` has 2–4 items ✓
- `sealed_expected_output.bad_recommendations_to_flag` has 4–6 items ✓
- `scoring_rubric.must_identify` has 4–8 items ✓
- `scoring_rubric.must_not_claim` has 2–4 items ✓
- `scoring_rubric.ideal_depth` has 2–4 items ✓
- TT-2 cases have `adversarial` field with all required sub-fields ✓
- TT-3 cases have `deliberate_data_gaps` with all required sub-fields ✓
- TT-4 cases have `data_conflicts` with all required sub-fields ✓
- TT-5 cases have `signal_trap_analysis` with all required sub-fields ✓
- `leakage_controls.author_read_benchmark_fixtures: false` ✓
- `leakage_controls.author_read_composer_source: false` ✓
- `holdout_meta.intervention_mode` valid enum value ✓

---

## 6. Batch 1 Regression Lock Status

**Batch 1 lock unchanged: YES.**

- `simulationBatch1RegressionLock.test.ts` — not modified
- Batch 1 fixtures (lines 1–12 of `simulation_cases.jsonl`) — not modified
- Scoring thresholds — not modified
- Regression lock floors — not modified

Gate verification: `npm run test:owner-real-world-simulation` — 257/257 tests pass, same count as Phase 2. No regression.

---

## 7. Gate Results

| Gate | Result |
|------|--------|
| Schema + leakage validation (21 cases) | 21/21 PASS |
| `npm run test:owner-real-world-simulation` (257 tests) | 257/257 PASS |
| `npx tsc --noEmit` | CLEAN |
| Unsafe recommendations | 0 (author-only phase — no engine run) |
| Bad recommendations | 0 (author-only phase — no engine run) |
| Batch 1 regression lock | UNCHANGED |
| Engine modified | NO |
| Scoring thresholds modified | NO |
| Existing fixtures modified | NO |

**Note:** Bad/unsafe recommendation counts are declared 0 because this is an AUTHOR-ONLY phase — no engine execution was performed. The regression lock (Phase 2) already confirmed 0 bad/unsafe recommendations for the 12 Batch 1 cases. Batch 2 cases will be executed and classified in Phase 4 (full simulation execution and validation).

---

## 8. Limitations

**TT-2 count:** Batch 2 produced 1 TT-2 case (SIM-08-003) against the Phase 3 instruction requirement of ≥2 TT-2. The Phase 3 instruction specifies ≥2 TT-2 across the 9 Batch 2 cases. This requirement was not fully met.

**Reason:** SC-07 and SC-09 cases were more naturally constructed as TT-1/TT-3/TT-4/TT-5. Forcing a second TT-2 without a genuinely adversarial construction pattern would have produced a weak adversarial case. The TT-2 shortfall is declared here rather than hidden.

**Impact on program:** Program-level TT-2 count is now 3 (Batch 1: 2 + Batch 2: 1). Program minimum is 4. One additional TT-2 case is required in a subsequent batch to meet program minimums.

**Author independence:** Cases are authored by the simulation program authoring process. The `author_read_benchmark_fixtures: false` and `author_read_composer_source: false` declarations are set per fixture. No SMB-001 through SMB-012 fixture content was consulted during Batch 2 authoring.

**Engine execution:** No engine execution was performed in this phase. Batch 2 cases have not been run against the OpsIQ diagnosis engine. Classification of these cases (PASS, SIM_ENGINE_GAP, SIM_INPUT_MODEL_GAP, etc.) is deferred to Phase 4 (full simulation execution and validation).

---

## 9. Next Batch Recommendation

**Batch 3 should cover:** SC-10 (Expansion Failure, 3 cases), SC-11 (Acquisition Failure, 2 cases), and SC-12 (Mixed-Cause Failures, 4 cases) — totalling 9 cases. This would bring the corpus to 30 cases.

**TT-2 obligation from Batch 2:** Batch 3 must include at least 1 TT-2 case to meet the program minimum of 4 TT-2 cases across the full program.

**Corpus progress after Batch 2:**

| Categories complete | Cases | Program minimum |
|--------------------|-------|----------------|
| SC-01, SC-02, SC-03, SC-04, SC-05, SC-06 | 12 (Batch 1) | — |
| SC-07, SC-08, SC-09 | 9 (Batch 2) | — |
| SC-10, SC-11, SC-12 | 0 (not yet authored) | 9 |
| **Total** | **21** | **38** |

Batches 3 (SC-10/11/12) and 4 (additional cases for minimum counts in SC-01 through SC-06) are required before Phase 4 can run.

---

## 10. Files Changed

| File | Change | Authorization |
|------|--------|---------------|
| `tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl` | Appended 9 new JSONL lines (lines 13–21) | Phase 3 corpus expansion authorization |
| `tests/owner-mode/real-world-simulation/SIMULATION_CASE_BATCH_2_REPORT.md` | Created (this report) | Required report gate |

**Files NOT changed:** diagnosis-engine.ts, simulationScoringContract.ts, smbOutputComposer.ts, any Batch 1 fixture line, any sidecar, any SMB benchmark, any regression lock test.
