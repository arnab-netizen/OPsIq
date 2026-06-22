# Simulation Batch 1 Execution Report

## Task

Execute `REAL_WORLD_SIMULATION_BATCH_1_EXECUTION` for 12 simulation fixture cases authored in `tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl`. Determine whether a real OpsIQ engine path exists, score all 12 cases, and produce this report.

---

## Execution Path Verdict

| Dimension | Result |
|---|---|
| Real OpsIQ engine used | **NO** |
| Mock/scaffold only | **YES** |

### Why the real engine cannot be used

The OpsIQ deterministic engine path exists and is fully operational for SMB benchmark cases. The adapter is `tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts`, which calls:

1. `normalizeFixtureToEvidence(fixture: SmbFixture)` — converts `SmbFixture.scenario.{business, symptoms, facts_known_to_owner}` into `EvidenceItem[]`
2. `diagnoseRootCause(evidenceItems, businessDescription)` — runs the deterministic diagnosis engine
3. `composeOwnerOutput(...)` — reads from a per-case evidence-hint sidecar file in `evidence-hints/{case_id}.evidence-hints.json`
4. `serializeComposerOutput(...)` — renders the final text string

Simulation fixtures use a **different schema** (`input_packet.business_description` / `input_packet.symptoms` / `input_packet.facts_known_to_owner`) rather than `scenario.business` / `scenario.symptoms`. No adapter exists to bridge `SimulationFixture.input_packet` → `SmbFixture.scenario`. Additionally, no evidence-hint sidecar files exist for any of the 12 `SIM-*` case IDs — they are required by the composer for every case. Without both the schema adapter and 12 sidecar files, the engine returns no output.

---

## Blocker Detail

**Exact files/functions missing:**

| Blocker | File needed | What must be built |
|---|---|---|
| Schema adapter | `tests/owner-mode/real-world-simulation/normalizeSimulationFixtureToSmbFixture.ts` | Maps `SimulationFixture.input_packet` fields to `SmbFixture.scenario` fields so `normalizeFixtureToEvidence` can be called |
| Evidence-hint sidecars (×12) | `tests/owner-mode/real-world-smb-cases/evidence-hints/SIM-{nn}-{nnn}.evidence-hints.json` | One sidecar per simulation case; requires the same sidecar authoring process used for SMB-001 through SMB-012 |
| Simulation-to-engine adapter | `tests/owner-mode/real-world-simulation/runSimulationCaseAgainstOpsiq.ts` | Wraps the schema adapter + existing engine + existing composer; parallel to `runCaseAgainstOpsiq.ts` for SmbFixture |

Until these three items exist, all simulation outputs are necessarily mock-constructed and no real engine validation evidence can be claimed.

---

## Cases Executed

| case_id | category | test_type | title | output_source |
|---|---|---|---|---|
| SIM-01-001 | SC-01 | TT-1 | IT Managed Services Provider — Recurring Cash Shortfall Despite Growth | MOCK_STRONG |
| SIM-01-002 | SC-01 | TT-5 | Electrical Subcontractor — Cash Stress Blamed on Single Late Client | MOCK_MEDIUM |
| SIM-02-001 | SC-02 | TT-2 | Yoga Studio Chain — Growth Without Profit Disguised as Marketing Problem | MOCK_MEDIUM |
| SIM-02-002 | SC-02 | TT-1 | E-Commerce Fashion Retailer — Rising Revenue, Falling Surplus | MOCK_STRONG |
| SIM-03-001 | SC-03 | TT-3 | Specialty Food Importer — Margin Decline With No Visibility by Product | MOCK_WEAK |
| SIM-03-002 | SC-03 | TT-1 | Café and Catering Operation — Food Cost Inflation Not Passed Through | MOCK_STRONG |
| SIM-04-001 | SC-04 | TT-4 | SaaS Accounting Tool — Subscriber Churn Understated by Owner | MOCK_MEDIUM |
| SIM-04-002 | SC-04 | TT-1 | Residential Cleaning Business — Repeat Client Loss Attributed to Pricing | MOCK_STRONG |
| SIM-05-001 | SC-05 | TT-2 | Personal Injury Law Firm — Lead Volume Problem or Lead Quality Problem | MOCK_WEAK |
| SIM-05-002 | SC-05 | TT-5 | Gym and Personal Training Studio — Member Attrition Diagnosed as Marketing Reach Problem | MOCK_MEDIUM |
| SIM-06-001 | SC-06 | TT-3 | Custom Furniture Maker — Capacity Bottleneck Not Yet Located | MOCK_WEAK |
| SIM-06-002 | SC-06 | TT-4 | Commercial Cleaning Business — Scheduling Inefficiency Misdiagnosed as Headcount Shortage | MOCK_STRONG |

Output quality distribution: 5 MOCK_STRONG, 4 MOCK_MEDIUM, 3 MOCK_WEAK.

---

## Per-Case Score Table

| case_id | totalScore | passed | rootCause.score | BRA.passed | EVD.passed | MIR.score |
|---|---|---|---|---|---|---|
| SIM-01-001 | 0.89 | true | 1.0 | true | true | 0.67 |
| SIM-01-002 | 0.75 | true | 1.0 | true | true | 0.00 |
| SIM-02-001 | 0.70 | true | 0.6 | true | true | 0.00 |
| SIM-02-002 | 0.76 | true | 1.0 | true | true | 0.00 |
| SIM-03-001 | 0.08 | **false** | 0.0 | **false** | **false** | 0.00 |
| SIM-03-002 | 0.75 | true | 1.0 | true | true | 0.00 |
| SIM-04-001 | 0.79 | true | 1.0 | true | true | 0.00 |
| SIM-04-002 | 0.92 | true | 1.0 | true | true | 0.67 |
| SIM-05-001 | 0.05 | **false** | 0.0 | **false** | **false** | 0.00 |
| SIM-05-002 | 0.64 | **false** | 0.6 | true | true | 0.00 |
| SIM-06-001 | 0.08 | **false** | 0.0 | **false** | **false** | 0.00 |
| SIM-06-002 | 0.73 | true | 0.6 | true | true | 0.00 |

---

## Failure Classification Table

| case_id | failure_class | reason |
|---|---|---|
| SIM-03-001 | SIM_ENGINE_GAP | MOCK_WEAK output recommended four flagged bad recommendations (salesperson, online sales channel, overseas suppliers, promotional activity) and made zero root-cause term matches; evidenceDiscipline failed. Demonstrates what a pattern-match system without archetype understanding would produce. |
| SIM-05-001 | SIM_TRAP_TAKEN | MOCK_WEAK output recommended all four adversarial bad recommendations (CRM system, intake manager, more advertising, more channels) — exactly the expected TT-2 misclassification. Adversarial resistance check: FAILED. |
| SIM-05-002 | SIM_SCORING_LIMITATION | MOCK_MEDIUM output hit 3/5 must_identify terms (0.60, at threshold) and correctly resisted the trap. totalScore 0.64 is below the 0.70 pass threshold due to weak MIR coverage and prioritization. Human review would likely confirm the diagnosis is directionally correct. |
| SIM-06-001 | SIM_ENGINE_GAP | MOCK_WEAK output recommended hiring craftspeople and expanding the workshop (two flagged bad recs). Zero root-cause term matches. Demonstrates a hiring-first heuristic that fails the constraint-location test. |

---

## Unsafe Recommendations

Bad recommendations that appeared in mock outputs (intentional weak outputs demonstrating what a failing system would produce):

**SIM-03-001 (MOCK_WEAK — deliberate):**
- "hire a dedicated salesperson to grow total revenue"
- "invest in building an online sales channel"
- "expand by adding new overseas suppliers to the range"
- "increase general promotional activity to raise overall brand awareness"

**SIM-05-001 (MOCK_WEAK — deliberate, adversarial trap taken):**
- "implement a CRM system to improve tracking and follow-up of incoming enquiries"
- "hire a dedicated intake manager to handle lead follow-up more consistently"
- "increase the digital advertising budget to generate a higher total volume of enquiries"
- "add more advertising channels to diversify lead sources"

**SIM-06-001 (MOCK_WEAK — deliberate):**
- "invest in a larger workshop facility to accommodate more simultaneous orders"
- "reduce the number of furniture designs offered to simplify the production process"

All bad recommendation violations came from intentionally weak mock outputs. The 8 passing cases produced zero bad recommendation violations.

---

## Conflict Detection Failures

TT-4 cases: SIM-04-001, SIM-06-002

| case_id | conflict stated | output flagged conflict |
|---|---|---|
| SIM-04-001 | Owner states 5% annual churn; math implies ~72% annualised | YES — output explicitly identified the discrepancy between stated and implied departure rate |
| SIM-06-002 | Owner states 70% utilisation; simultaneously declining contracts due to staff shortage | YES — output flagged the direct conflict between utilisation claim and operational experience |

Both TT-4 cases: conflict detection PASSED (2/2, 100%).

---

## Misleading Signal Failures

TT-5 cases: SIM-01-002, SIM-05-002

| case_id | primary_trap | output took trap | trap_resistance |
|---|---|---|---|
| SIM-01-002 | "the large client who delayed payment 14 months ago is still the cause of the current cash shortage" | YES — output mentioned the historical client event in context | **FAILED** |
| SIM-05-002 | "marketing campaigns are not reaching a large enough audience to generate membership growth" | NO — output correctly identified attrition as the mechanism, not reach | PASSED |

TT-5 resistance rate: 1/2 (50%). The SIM-01-002 trap failure is a phrase-match false-positive: the MOCK_MEDIUM output's intent was to dismiss the misattribution ("The owner's attribution of all current stress to the client who delayed payment 14 months ago is not supported..."), but the scorer detected the trap phrase within that rebuttal text. This is a SIM_SCORING_LIMITATION for the trap check rather than a genuine trap failure.

---

## Summary Stats

| Metric | Value |
|---|---|
| totalCases | 12 |
| passedCases | 8 |
| failedCases | 4 |
| passRate | 67% (8/12) |
| badRecommendationViolations | 3 cases (all deliberate MOCK_WEAK outputs) |
| TT-4 conflict detection rate | 2/2 (100%) |
| TT-5 trap resistance rate | 1/2 (50%) — SIM-01-002 is a phrase-match false-positive |
| TT-2 adversarial resistance (SIM-02-001) | PASSED |
| TT-2 adversarial resistance (SIM-05-001) | FAILED (deliberate MOCK_WEAK) |

Failure class breakdown: PASS: 8, SIM_ENGINE_GAP: 2, SIM_TRAP_TAKEN: 1, SIM_SCORING_LIMITATION: 1.

---

## Whether Batch 1 Gives Real Validation Evidence

**NO — mock only. Real engine execution is pending.**

The 8 passing cases passed because mock outputs were hand-crafted to contain the correct vocabulary. The 4 failures were produced by deliberately weak mock outputs. Neither result reflects what the OpsIQ deterministic engine would actually produce when given these `input_packet` payloads.

Batch 1 scoring in this run:
- Validates the scoring contract is correct (confirmed)
- Validates the fixture schema is correct (confirmed by schema tests)
- Validates the harness loads and scores 12 cases (confirmed)
- Does NOT validate whether the OpsIQ engine produces correct diagnoses for these scenarios

---

## Exact Next Implementation Blocker

**Build the simulation-to-engine adapter and 12 evidence-hint sidecar files.**

The next prompt must:

1. Create `tests/owner-mode/real-world-simulation/normalizeSimulationFixtureToSmbFixture.ts` — maps `SimulationFixture.input_packet.{business_description, symptoms, facts_known_to_owner, misleading_signals, missing_inputs_opsiq_should_request}` to the `SmbFixture.scenario` shape required by `normalizeFixtureToEvidence`.

2. Create `tests/owner-mode/real-world-simulation/runSimulationCaseAgainstOpsiq.ts` — calls the schema adapter, then `normalizeFixtureToEvidence`, then `diagnoseRootCause`, then `composeOwnerOutput` with a simulation sidecar, then `serializeComposerOutput`; returns a real engine text string.

3. Author evidence-hint sidecar files for each of the 12 SIM-* cases (following the same format as `tests/owner-mode/real-world-smb-cases/evidence-hints/*.evidence-hints.json`). Each sidecar maps the simulation case `input_packet` facts to canonical evidence key vocabulary. The leakage contamination gate must be applied: sidecar `evidence_items` must not contain `must_identify` phrases from `sealed_expected_output.scoring_rubric`.

4. Update `runBatch1Scoring.ts` to call `runSimulationCaseAgainstOpsiq(fixture)` instead of returning a mock string, then re-run scoring to produce the first real engine validation result.

---

## Test Results

`npm run test:owner-real-world-simulation` result:

```
Test Files  4 passed (4)
     Tests  68 passed (68)
  Start at  11:36:13
  Duration  281.85s
```

All 68 tests pass. The scaffold-era NOT_READY sentinel failures documented in `SIMULATION_CASE_BATCH_1_REPORT.md` have been resolved — the harness test file was updated to expect READY status for a populated corpus. `simulationFixtureSchema.test.ts`, `simulationScoringContract.test.ts`, `simulationHarness.test.ts`, and `loadSimulationFixtures.test.ts` all pass.
