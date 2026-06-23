# Simulation Case Batch 4 Report

**Report date:** 2026-06-23  
**Branch:** claude/cool-ptolemy-dxrpm7  
**Phase:** 3 — Full Simulation Corpus Expansion (Batch 4)  
**Scope:** SC-01, SC-02, SC-03, SC-04, SC-05, SC-06 — filling category minimums to reach 38 total cases

---

## 1. Cases Created

8 new simulation cases appended to `tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl`.

| Case ID | Category | Test Type | Title |
|---------|----------|-----------|-------|
| SIM-13-001 | SC-01 | TT-3 | Cleaning business cannot make payroll despite steady revenue — owner blames slow-paying clients |
| SIM-13-002 | SC-01 | TT-4 | Retail gift shop owner reports healthy margins but cannot pay suppliers in two weeks |
| SIM-13-003 | SC-02 | TT-5 | Painting contractor grows revenue 44% over two years while net profit falls 62% |
| SIM-13-004 | SC-02 | TT-2 | Digital training company grows 80% on a single government contract with 1.8% net margin |
| SIM-13-005 | SC-03 | TT-4 | Plumbing business blended margin claim contradicts service-line descriptions and revenue proportions |
| SIM-13-006 | SC-04 | TT-2 | Property manager loses 23% of managed properties in 12 months while attributing losses to investment market conditions |
| SIM-13-007 | SC-05 | TT-3 | Wedding photographer triples ad spend as enquiries rise but bookings stay flat for 14 months |
| SIM-13-008 | SC-06 | TT-5 | Signage business revenue capped for three years with owner working 60 hours per week — owner believes they are the bottleneck |

**Total corpus after Batch 4: 38 cases** (12 Batch 1 + 9 Batch 2 + 9 Batch 3 + 8 Batch 4)

**Program minimum reached: 38 cases ✓**

---

## 2. SC-13 Category — Schema Status

The Phase 3 Batch 4 instruction authorised use of category `SC-13 Cross-Category Stress Tests` if the schema supports it.

**Finding:** `simulationFixtureSchema.ts` defines `SIMULATION_CATEGORIES` as `["SC-01", "SC-02", "SC-03", "SC-04", "SC-05", "SC-06", "SC-07", "SC-08", "SC-09", "SC-10", "SC-11", "SC-12"]` only. SC-13 is not a valid category. The validator throws on any unrecognised category value.

**Decision:** SC-13 not used. All 8 Batch 4 cases use the closest existing categories from SC-01 through SC-06, selected to fill the remaining program minimum deficits. This is documented here per the instruction requirement.

---

## 3. Category Deficit Resolution

Batch 4 was designed to fill exact category minimum deficits. After Batch 3 (30 cases), the following categories were below program minimum:

| Category | Cases After Batch 3 | Program Min | Deficit | Batch 4 Added | Result |
|----------|---------------------|-------------|---------|---------------|--------|
| SC-01 Cash Crisis | 2 | 4 | 2 | 2 | 4 ✓ |
| SC-02 Growth Without Profit | 2 | 4 | 2 | 2 | 4 ✓ |
| SC-03 Declining Margins | 2 | 3 | 1 | 1 | 3 ✓ |
| SC-04 Customer Churn | 2 | 3 | 1 | 1 | 3 ✓ |
| SC-05 Marketing Failure | 2 | 3 | 1 | 1 | 3 ✓ |
| SC-06 Operational Bottlenecks | 2 | 3 | 1 | 1 | 3 ✓ |
| SC-07 through SC-12 | Already at or above minimum | — | 0 | 0 | — |

All 12 categories now meet their program minimum case counts.

---

## 4. Categories Covered

### SC-01: Cash Crisis (2 new cases)

- **SIM-13-001 (TT-3):** Cleaning business unable to meet payroll despite reporting steady monthly revenue of $52K. Billing is done via Word PDF invoices with no AR system — the owner tracks outstanding invoices from memory. Deliberately withheld: AR aging schedule, actual cash received from bank statements, average payment lag. OpsIQ must request these three data sets before diagnosing whether the payroll crisis is a timing problem or a structural collection failure.

- **SIM-13-002 (TT-4):** Retail gift shop reporting 35% gross margin cannot pay a $28K supplier invoice. Conflicting data: the owner states annual revenue of $480K and annual COGS of approximately $240K — which implies a gross margin of 50%, not 35%. The three-way inconsistency (revenue, COGS, margin) means one figure must be wrong. OpsIQ must flag this contradiction and request reconciled financial statements before accepting any profitability or cash-position claim.

### SC-02: Growth Without Profit (2 new cases)

- **SIM-13-003 (TT-5):** Painting contractor has grown revenue from $620K to $890K (44%) over two years while net profit fell from $74,400 to $28,000 (62% decline). Signal trap: revenue growth of 44% in a trades business strongly signals a successful growth phase. Correct diagnosis: subcontractor cost inflation has not been passed through to client pricing, compressing gross margin per job — the business is losing more money on each job as volume grows, not approaching a profitable scale threshold.

- **SIM-13-004 (TT-2):** Digital training company grew 80% in 18 months to $685K revenue, but 45% of that revenue comes from a single government agency contract ($310K). Net margin is 1.8%. Adversarial layer: single large government client driving all growth creates the appearance of validated enterprise market entry. Expected misclassification: successful enterprise market entry in capability-investment phase. Correct diagnosis: concentrated fragility — the cost base was restructured to service the enterprise client and cannot be sustained if the contract (renewing in 8 months) is not renewed.

### SC-03: Declining Margins (1 new case)

- **SIM-13-005 (TT-4):** Plumbing business reports blended gross margin of 38% on $1.1M revenue. When describing specific jobs, the owner states commercial installations earn approximately 18% margin and represent 70% of revenue, and residential service calls earn approximately 60% margin. The arithmetic: 70% × 18% + 30% × 60% = 30.6% blended, not 38%. OpsIQ must flag this contradiction and request service-line financial statements before accepting either the blended margin figure or the materials cost attribution.

### SC-04: Customer Churn (1 new case)

- **SIM-13-006 (TT-2):** Property management business lost 14 of 62 managed properties in 12 months (23% annual attrition) while winning 18 new properties (net +4). Owner attributes all departures to landlords selling investment properties due to market conditions and is increasing advertising spend. Adversarial layer: net growth of 4 properties and a plausible market explanation create the appearance of a growing business with external attrition. Expected misclassification: normal market-driven attrition being offset by active acquisition. Correct diagnosis: 23% annual churn in property management is a retention failure signal requiring systematic departure analysis before any market explanation is accepted.

### SC-05: Marketing Failure (1 new case)

- **SIM-13-007 (TT-3):** Wedding photographer has tripled advertising spend to $2,400/month. Website traffic has doubled; enquiries are up 40%. Bookings have been flat at 28/year for 14 months. Owner responds to enquiries informally with no documented follow-up process and no conversion tracking. Deliberately withheld: enquiry-to-booking conversion rate, enquiry response time and follow-up process, competitor pricing. OpsIQ must request these before diagnosing whether the failure is advertising reach, audience match, or conversion process — the diagnosis cannot be made without conversion data.

### SC-06: Operational Bottlenecks (1 new case)

- **SIM-13-008 (TT-5):** Commercial signage business has been flat at $380K for three years. Owner works 60+ hours/week and approves every quote, client call, and design. The owner is also the only person who understands the production scheduling system. The production facility runs near full capacity three days/week and sits idle waiting for materials two days/week. Signal trap: owner working 60+ hours with approval authority over everything is the textbook presentation of an owner capacity ceiling — the obvious intervention is to hire a sales/account manager and delegate approvals. Correct diagnosis: the production scheduling and materials procurement cycle is the actual throughput constraint — hiring resolves owner time but cannot increase production throughput beyond the materials-limited rate.

---

## 5. Test Types Covered

| Test Type | Batch 4 Count | Cases |
|-----------|--------------|-------|
| TT-1 Blind Outcome | 0 | — |
| TT-2 Adversarial | 2 | SIM-13-004, SIM-13-006 |
| TT-3 Missing-Data | 2 | SIM-13-001, SIM-13-007 |
| TT-4 Conflicting-Data | 2 | SIM-13-002, SIM-13-005 |
| TT-5 Misleading-Signal | 2 | SIM-13-003, SIM-13-008 |
| **Total** | **8** | |

**Batch 4 required mix:** ≥2 TT-2, ≥2 TT-3, ≥2 TT-4, ≥2 TT-5. All requirements met ✓.

**Note on TT-1:** Batch 4 contains 0 TT-1 cases. The instruction did not require any TT-1 for Batch 4. The program-level TT-1 deficit (10 of 23 required) remains open for future batches beyond the minimum 38-case corpus.

**Cumulative corpus test type distribution (38 cases):**

| Test Type | B1 | B2 | B3 | B4 | Total | Program Min |
|-----------|----|----|----|----|-------|-------------|
| TT-1 | 6 | 3 | 1 | 0 | 10 | 23 (program total) |
| TT-2 | 2 | 1 | 3 | 2 | 8 | 4 ✓ |
| TT-3 | 2 | 1 | 1 | 2 | 6 | 10 (program total) |
| TT-4 | 2 | 2 | 2 | 2 | 8 | 2 ✓ |
| TT-5 | 2 | 2 | 2 | 2 | 8 | 9 (program total) |

---

## 6. Corpus Minimum Reached — Confirmation

**Corpus total after Batch 4: 38 cases ✓**

This meets the program minimum of 38 cases required before Phase 4 (full simulation execution and validation) can begin.

| Metric | Requirement | Status |
|--------|-------------|--------|
| Total corpus | ≥ 38 cases | 38 ✓ |
| SC-01 | ≥ 4 cases | 4 ✓ |
| SC-02 | ≥ 4 cases | 4 ✓ |
| SC-03 | ≥ 3 cases | 3 ✓ |
| SC-04 | ≥ 3 cases | 3 ✓ |
| SC-05 | ≥ 3 cases | 3 ✓ |
| SC-06 | ≥ 3 cases | 3 ✓ |
| SC-07 | ≥ 3 cases | 3 ✓ |
| SC-08 | ≥ 3 cases | 3 ✓ |
| SC-09 | ≥ 3 cases | 3 ✓ |
| SC-10 | ≥ 3 cases | 3 ✓ |
| SC-11 | ≥ 2 cases | 2 ✓ |
| SC-12 | ≥ 4 cases | 4 ✓ |

---

## 7. Leakage Validation Result

**Result: PASS — 38/38 cases pass leakage check.**

Automated leakage check (`checkLeakage()` in `simulationFixtureSchema.ts`) confirms no `must_identify` or `bad_recommendations_to_flag` phrase from any `sealed_expected_output` appears verbatim in any `input_packet` field for all 8 new cases.

Validator run: `npx tsx -e "parseAndValidateSimulationFixtures(...)"` — all 38 fixtures pass.

---

## 8. Schema Validation Result

**Result: PASS — 38/38 cases pass schema validation.**

All 8 new cases validated by `validateSimulationFixture()`:
- `case_id` matches `/^SIM-\d{2}-\d{3}$/` ✓
- `category` is a valid SIMULATION_CATEGORY (SC-01 through SC-06) ✓
- `test_type` is a valid SIMULATION_TEST_TYPE ✓
- `input_packet.symptoms` has ≥3 items ✓
- `input_packet.misleading_signals` has ≥2 items ✓
- `input_packet.missing_inputs_opsiq_should_request` has 3–6 items (all have 5) ✓
- `sealed_expected_output.secondary_causes` has 2–4 items (all have 3) ✓
- `sealed_expected_output.bad_recommendations_to_flag` has 4–6 items (all have 5) ✓
- `scoring_rubric.must_identify` has 4–8 items (all have 4) ✓
- `scoring_rubric.must_not_claim` has 2–4 items (all have 3) ✓
- `scoring_rubric.ideal_depth` has 2–4 items (all have 2) ✓
- TT-2 cases have `adversarial` field with all required sub-fields ✓
- TT-3 cases have `deliberate_data_gaps` with all required sub-fields ✓
- TT-4 cases have `data_conflicts` with all required sub-fields ✓
- TT-5 cases have `signal_trap_analysis` with all required sub-fields ✓
- `leakage_controls.author_read_benchmark_fixtures: false` ✓
- `leakage_controls.author_read_composer_source: false` ✓
- `holdout_meta.intervention_mode` valid enum value ✓

---

## 9. Batch 1 Regression Lock Status

**Batch 1 lock unchanged: YES.**

- `simulationBatch1RegressionLock.test.ts` — not modified
- Batch 1 fixtures (lines 1–12 of `simulation_cases.jsonl`) — not modified
- Scoring thresholds — not modified
- Regression lock floors — not modified

Gate verification: `npm run test:owner-real-world-simulation` — 257/257 tests pass, same count as prior batches. No regression.

---

## 10. Gate Results

| Gate | Result |
|------|--------|
| Schema + leakage validation (38 cases) | 38/38 PASS |
| `npm run test:owner-real-world-simulation` (257 tests) | 257/257 PASS |
| `npx tsc --noEmit` | CLEAN |
| Unsafe recommendations | 0 (author-only phase — no engine run) |
| Bad recommendations | 0 (author-only phase — no engine run) |
| Batch 1 regression lock | UNCHANGED |
| Engine modified | NO |
| Scoring thresholds modified | NO |
| Existing fixtures modified | NO |

---

## 11. Limitations

**TT-1 program deficit:** The program requires 23 TT-1 cases across the full corpus. The current 38-case corpus has 10 TT-1 cases. This deficit (13 cases) is not resolved by Batch 4. The Batch 4 instruction did not require TT-1 cases — it required ≥2 of TT-2, TT-3, TT-4, TT-5 only. The TT-1 and TT-3 and TT-5 program minimums are program-level targets for the 60-case target corpus, not requirements for the 38-case minimum corpus. Phase 4 can proceed with 38 cases; additional batches would be required to reach the 60-case target.

**TT-3 program deficit:** Program requires 10 TT-3 cases; current corpus has 6. Not blocking Phase 4.

**TT-5 program deficit:** Program requires 9 TT-5 cases; current corpus has 8. One additional TT-5 case would meet the minimum. Not blocking Phase 4 at the 38-case minimum corpus level.

**Engine execution:** No engine execution was performed in this phase. All 38 cases remain unrun against the OpsIQ diagnosis engine. Phase 4 will be the first execution phase.

**SC-13 not added:** As noted in §2, the schema does not support SC-13. The instruction's fallback path was followed — closest existing categories used and documented here.

---

## 12. Next Phase Recommendation

**Phase 4 can now begin.** The 38-case minimum corpus is complete. All 12 categories meet their program minimum case counts. All 38 cases pass schema and leakage validation.

**Phase 4 scope:** Full simulation execution and validation — run all 38 cases against the OpsIQ diagnosis engine, capture first-run scores, classify each case (PASS, SIM_ENGINE_GAP, SIM_INPUT_MODEL_GAP, SIM_SCORING_LIMITATION, SIM_HONEST_CEILING, SIM_TRAP_TAKEN, SIM_CONFABULATION, SIM_CONFLICT_IGNORED), produce the FULL_SIMULATION_VALIDATION_REPORT.md.

**Program minimum status before Phase 4:**

| Corpus metric | Status |
|---------------|--------|
| Total cases | 38 ✓ (minimum met) |
| All categories at minimum | Yes ✓ |
| TT-2 program minimum (4) | 8 ✓ |
| TT-4 program minimum (2) | 8 ✓ |
| TT-1 program minimum (23) | 10 (open — non-blocking for Phase 4) |
| TT-3 program minimum (10) | 6 (open — non-blocking for Phase 4) |
| TT-5 program minimum (9) | 8 (open — 1 short; non-blocking for Phase 4) |
| Batch 1 regression lock | SEALED |
| Unsafe recommendations | 0 |
| Bad recommendations | 0 |

---

## 13. Files Changed

| File | Change | Authorization |
|------|--------|---------------|
| `tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl` | Appended 8 new JSONL lines (lines 31–38) | Phase 3 corpus expansion authorization |
| `tests/owner-mode/real-world-simulation/SIMULATION_CASE_BATCH_4_REPORT.md` | Created (this report) | Required report gate |

**Files NOT changed:** diagnosis-engine.ts, simulationScoringContract.ts, smbOutputComposer.ts, simulationFixtureSchema.ts, any Batch 1/2/3 fixture line, any sidecar, any SMB benchmark, any regression lock test, any scoring threshold.
