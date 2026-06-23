# Simulation Case Batch 3 Report

**Report date:** 2026-06-23  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Phase:** 3 — Full Simulation Corpus Expansion (Batch 3)  
**Scope:** SC-10 Acquisition Failure, SC-11 Severe Operational Failure, SC-12 Mixed-Cause Failure

---

## 1. Cases Created

9 new simulation cases added to `tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl`.

| Case ID | Category | Test Type | Title |
|---------|----------|-----------|-------|
| SIM-10-001 | SC-10 | TT-2 | Acquisition doubles revenue with zero profit improvement — owner attributes poor returns to integration lag |
| SIM-10-002 | SC-10 | TT-4 | Acquired professional services book loses three of twelve clients within ten months of handover |
| SIM-10-003 | SC-10 | TT-5 | Revenue collapses immediately after handover despite unchanged crew and processes |
| SIM-11-001 | SC-11 | TT-2 | Aged care provider with six complaints and three regulatory incidents attributes failures to two staff members |
| SIM-11-002 | SC-11 | TT-1 | Food manufacturer with return rate tripling after headcount doubled blames a supplier change |
| SIM-12-001 | SC-12 | TT-3 | Renovation business with simultaneous revenue decline and margin compression — owner sees one problem |
| SIM-12-002 | SC-12 | TT-2 | B2B distributor with AR at 68 days and demand channel at half volume requests a credit line |
| SIM-12-003 | SC-12 | TT-5 | Mobile detailing operator fully booked six days a week with margin falling from 32% to 19% |
| SIM-12-004 | SC-12 | TT-4 | Digital marketing agency reports 52% blended margin with no service-line data for 40% of revenue |

**Total corpus after Batch 3:** 30 cases (12 Batch 1 + 9 Batch 2 + 9 Batch 3)

---

## 2. Categories Covered

### SC-10: Acquisition Failure (3 cases)

- **SIM-10-001 (TT-2):** Commercial printing acquisition — revenue grew 52% post-acquisition but profit is flat. Owner attributes underwhelming returns to integration lag and expects normalisation within 12 months. Adversarial layer: surface signals of acquisition success (revenue growth, operational integration, stable team). Expected misclassification: successful acquisition in normalisation phase requiring patience. Correct diagnosis: margin compression from acquired capacity and overhead absorbed without pricing discipline has destroyed acquisition value. OpsIQ must not accept the integration lag narrative and must identify the margin destruction mechanism.

- **SIM-10-002 (TT-4):** Accounting practice acquisition — three of twelve acquired clients departed within ten months. Owner claims successful integration and attributes client losses to clients who were "already on the way out." Conflicting data: owner's integration success claim vs three client departures (25% client loss) in ten months. OpsIQ must flag this contradiction and identify post-acquisition relationship disruption as the cause before accepting any external explanation.

- **SIM-10-003 (TT-5):** Landscaping company acquired for $420K — revenue collapsed from $780K to $540K immediately after handover despite unchanged crew, equipment, and processes. Signal trap: unchanged operational elements appear to rule out operational failure. Correct diagnosis: acquisition value was concentrated in the previous owner's client relationships, not the operational assets; value was not transferred at handover. OpsIQ must not attribute the decline to external or market causes.

### SC-11: Severe Operational Failure (2 cases)

- **SIM-11-001 (TT-2):** Aged care support provider — six client complaints and three regulatory compliance incidents in eight months. Owner has initiated performance proceedings against two staff members and expects resolution once proceedings complete. Adversarial layer: active HR proceedings create the appearance of management response and accountability. Expected misclassification: staff performance management case requiring completion of proceedings. Correct diagnosis: scheduling via WhatsApp and paper roster, no incident reporting process, and no compliance audit trail represent system and process failure that enables repeated incidents regardless of individual proceedings. OpsIQ must identify the system failure before accepting the staff performance framing.

- **SIM-11-002 (TT-1):** Food manufacturing — product return rate increased from 1.2% to 4.8% across 18 months during which headcount doubled from 8 to 16. Owner attributes quality decline to a supplier change that preceded the first complaints by two months. Tests whether OpsIQ identifies process documentation failure during rapid headcount growth as the root cause rather than accepting the supplier attribution. No supplier change can explain a return rate that continues rising 14 months after the change occurred while other variables (headcount, production volume) also changed simultaneously.

### SC-12: Mixed-Cause Failure (4 cases)

- **SIM-12-001 (TT-3):** Building and renovation business — revenue has declined from $2.9M to $2.2M over two years while gross margin has compressed from 28% to 18% over the same period. These are two independent failures occurring simultaneously. Missing data: project-level margin data, input cost change data, consultation volume data. OpsIQ must request these three data sets before diagnosing — the revenue decline and margin compression have separate causes that require separate data to diagnose correctly.

- **SIM-12-002 (TT-2):** B2B office supplies distributor — AR is running at 68 days against 30-day payment terms, and the primary demand channel (trade show calendar) is operating at half lead volume. Owner has requested a credit facility to resolve cash pressure. Adversarial layer: AR collection lag and a credit facility appear to be a straightforward working capital problem with a financing solution. Expected misclassification: working capital stress case requiring a credit line plus AR collection improvement. Correct diagnosis: two independent structural failures — AR collection breakdown producing a cash conversion deficit, and demand channel failure producing a pipeline problem — neither of which is resolved by external financing. OpsIQ must not recommend a credit line as the primary intervention.

- **SIM-12-003 (TT-5):** Mobile auto detailing — owner is fully booked three weeks in advance working six days per week, while gross margin has declined from 32% to 19% over 14 months. Signal trap: three-week advance booking with the owner working six days a week signals a textbook owner capacity ceiling — hiring an operator appears both necessary and sufficient. Correct diagnosis: two independent failures — owner capacity ceiling (real) and customer mix shift toward lower-margin fleet contracts reducing average margin (independent cause). OpsIQ must not treat hiring as solving both problems, and must not treat materials cost inflation as the primary margin driver without evidence.

- **SIM-12-004 (TT-4):** Digital marketing agency — owner reports 52% blended gross margin on $2.1M revenue. SEO retainer service ($840K, 40% of revenue) has not had a price review in three years. One specialist manages 38 of 40 retainer clients. Conflicting data: 52% blended margin reported but no service-line margin data available for the 40% of revenue delivered at a three-year-old price point. OpsIQ must flag this contradiction — a blended margin reported without service-line data for 40% of revenue cannot be validated and may conceal a loss-making service line. OpsIQ must also identify key-person dependency as a separate independent risk.

---

## 3. Test Types Covered

| Test Type | Batch 3 Count | Cases |
|-----------|--------------|-------|
| TT-1 Blind Outcome | 1 | SIM-11-002 |
| TT-2 Adversarial | 3 | SIM-10-001, SIM-11-001, SIM-12-002 |
| TT-3 Missing-Data | 1 | SIM-12-001 |
| TT-4 Conflicting-Data | 2 | SIM-10-002, SIM-12-004 |
| TT-5 Misleading-Signal | 2 | SIM-10-003, SIM-12-003 |
| **Total** | **9** | |

**Batch 3 required mix (from Phase 3 Batch 3 instruction):** ≥3 TT-2, ≥1 TT-1, ≥1 TT-3, ≥2 TT-4, ≥2 TT-5.

**Compliance check:** 3 TT-2 ✓ (≥3), 1 TT-1 ✓ (≥1), 1 TT-3 ✓ (≥1), 2 TT-4 ✓ (≥2), 2 TT-5 ✓ (≥2). All requirements met.

**Batch 2 TT-2 shortfall correction confirmed:** Batch 2 produced 1 TT-2 case against a requirement of ≥2. Batch 3 was required to include ≥3 TT-2 cases. Batch 3 delivers exactly 3 TT-2 cases (SIM-10-001, SIM-11-001, SIM-12-002). The program-level TT-2 count is now 6 (Batch 1: 2 + Batch 2: 1 + Batch 3: 3), exceeding the program minimum of 4.

**Cumulative corpus test type distribution (30 cases):**

| Test Type | Batch 1 | Batch 2 | Batch 3 | Total | Program Min |
|-----------|---------|---------|---------|-------|-------------|
| TT-1 | 6 | 3 | 1 | 10 | 23 (program total) |
| TT-2 | 2 | 1 | 3 | 6 | 4 (program total) ✓ |
| TT-3 | 2 | 1 | 1 | 4 | 10 (program total) |
| TT-4 | 2 | 2 | 2 | 6 | 2 (program total) ✓ |
| TT-5 | 2 | 2 | 2 | 6 | 9 (program total) |

---

## 4. Leakage Validation Result

**Result: PASS — 30/30 cases pass leakage check.**

Automated leakage check (`checkLeakage()` in `simulationFixtureSchema.ts`) confirms no `must_identify` or `bad_recommendations_to_flag` phrase from any `sealed_expected_output` appears verbatim in any `input_packet` field for all 9 new cases.

Validator run: `npx tsx -e "parseAndValidateSimulationFixtures(...)"` — all 30 fixtures pass.

---

## 5. Schema Validation Result

**Result: PASS — 30/30 cases pass schema validation.**

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

Gate verification: `npm run test:owner-real-world-simulation` — 257/257 tests pass, same count as Batch 2. No regression.

---

## 7. Gate Results

| Gate | Result |
|------|--------|
| Schema + leakage validation (30 cases) | 30/30 PASS |
| `npm run test:owner-real-world-simulation` (257 tests) | 257/257 PASS |
| `npx tsc --noEmit` | CLEAN |
| Unsafe recommendations | 0 (author-only phase — no engine run) |
| Bad recommendations | 0 (author-only phase — no engine run) |
| Batch 1 regression lock | UNCHANGED |
| Engine modified | NO |
| Scoring thresholds modified | NO |
| Existing fixtures modified | NO |

**Note:** Bad/unsafe recommendation counts are declared 0 because this is an AUTHOR-ONLY phase — no engine execution was performed. Classification of Batch 3 cases (PASS, SIM_ENGINE_GAP, SIM_INPUT_MODEL_GAP, etc.) is deferred to Phase 4 (full simulation execution and validation).

---

## 8. Batch 2 TT-2 Shortfall — Correction Confirmation

The Batch 2 report (§8 Limitations) declared that Batch 2 produced only 1 TT-2 case (SIM-08-003) against the required ≥2. The Batch 3 instruction mandated ≥3 TT-2 cases to correct this shortfall.

**Correction verified:**
- Batch 3 TT-2 cases: SIM-10-001, SIM-11-001, SIM-12-002 — 3 cases ✓
- Each is a genuinely adversarial construction with a distinct misclassification trap, not a padded or weak case
- Program-level TT-2 total: 6 (exceeds program minimum of 4) ✓

---

## 9. Limitations

**Author independence:** Cases are authored by the simulation program authoring process. The `author_read_benchmark_fixtures: false` and `author_read_composer_source: false` declarations are set per fixture. No SIM-01-001 through SIM-09-003 fixture content was consulted during Batch 3 authoring.

**Engine execution:** No engine execution was performed in this phase. Batch 3 cases have not been run against the OpsIQ diagnosis engine. Classification of these cases (PASS, SIM_ENGINE_GAP, SIM_INPUT_MODEL_GAP, etc.) is deferred to Phase 4 (full simulation execution and validation).

**Program minimums not yet met:** TT-1 (10 of 23 required), TT-3 (4 of 10 required), and TT-5 (6 of 9 required) remain below program minimums. These gaps are expected at this stage — Phase 4 cannot run until the program minimum totals are met across all batches. Additional batches for SC-01 through SC-06 (Batch 4 per Batch 2 report §9) are required before Phase 4.

---

## 10. Next Batch Recommendation

**Batch 4 should cover:** Additional cases for SC-01 through SC-06 to approach program minimums. The program requires 38 total cases; the corpus currently has 30. Eight additional cases in Batch 4 would bring the corpus to 38.

**Priority test types for Batch 4:** TT-1 (need 13 more), TT-3 (need 6 more), TT-5 (need 3 more). TT-2 and TT-4 are at or above program minimums.

**Corpus progress after Batch 3:**

| Categories complete | Cases | Program minimum |
|--------------------|-------|----------------|
| SC-01, SC-02, SC-03, SC-04, SC-05, SC-06 | 12 (Batch 1) | — |
| SC-07, SC-08, SC-09 | 9 (Batch 2) | — |
| SC-10, SC-11, SC-12 | 9 (Batch 3) | — |
| Additional cases (Batch 4) | 0 (not yet authored) | 8+ |
| **Total** | **30** | **38** |

---

## 11. Files Changed

| File | Change | Authorization |
|------|--------|---------------|
| `tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl` | Appended 9 new JSONL lines (lines 22–30) | Phase 3 corpus expansion authorization |
| `tests/owner-mode/real-world-simulation/SIMULATION_CASE_BATCH_3_REPORT.md` | Created (this report) | Required report gate |

**Files NOT changed:** diagnosis-engine.ts, simulationScoringContract.ts, smbOutputComposer.ts, simulationFixtureSchema.ts, any Batch 1 or Batch 2 fixture line, any sidecar, any SMB benchmark, any regression lock test, any scoring threshold.
