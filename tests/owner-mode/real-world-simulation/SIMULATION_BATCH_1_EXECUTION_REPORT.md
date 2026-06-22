# Simulation Batch 1 Execution Report

**Date:** 2026-06-22
**Branch:** claude/cool-ptolemy-dxrpm7
**Status:** EXECUTION_COMPLETE_MOCK

---

## Executive Summary

Batch 1 scoring was executed against all 12 simulation fixtures using mock/scaffold outputs only.
**The real OpsIQ engine was NOT used.** No adapter exists between `SimulationFixture.input_packet`
and the OpsIQ composer input format. All output strings were hand-crafted at three quality tiers
to exercise the scoring contract across expected pass and fail cases.

Test suite: 4 files, 68 tests — all passed.

---

## Real Engine Status

| Item | Status |
|------|--------|
| Real engine used | NO |
| Mock/scaffold only | YES |
| OpsIQ composer invoked | NO |
| Batch 1 provides real validation evidence | NO |

---

## Blocker: Adapter Not Built

**Exact function/adapter needed:**

A function with signature:

```typescript
function adaptSimulationFixtureToComposerInput(
  fixture: SimulationFixture
): ComposerInput  // or equivalent OpsIQ intake format
```

This adapter must map `fixture.input_packet` fields to the format expected by
`tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts`.

The existing `runCaseAgainstOpsiq` accepts `SmbFixture` format with evidence-hint sidecars.
`SimulationFixture.input_packet` uses `business_description`, `facts_known_to_owner`,
`symptoms`, `misleading_signals`, and `missing_inputs_opsiq_should_request` — none of which
map directly to the fields expected by `normalizeFixtureToEvidence.ts`.

Additionally, no evidence-hint sidecar files exist for the 12 simulation cases. The
`evidenceHintSidecar` system expects per-case YAML/JSON files under `evidence-hints/`.

**Until both the adapter and per-case sidecar files are authored, mock scoring only is possible.**

---

## Per-Case Score Table

| case_id | TT | Source | totalScore | passed | RC.score | BRA.pass | EVD.pass | MIR.score | Failure Class |
|---------|-----|--------|-----------|--------|----------|----------|----------|-----------|---------------|
| SIM-01-001 | TT-1 | MOCK_STRONG | 0.89 | PASS | 1.0 | true | true | 0.67 | — |
| SIM-01-002 | TT-5 | MOCK_MEDIUM | 0.75 | PASS | 1.0 | true | true | 0.00 | — |
| SIM-02-001 | TT-2 | MOCK_MEDIUM | 0.70 | PASS | 0.6 | true | true | 0.00 | — |
| SIM-02-002 | TT-1 | MOCK_STRONG | 0.76 | PASS | 1.0 | true | true | 0.00 | — |
| SIM-03-001 | TT-3 | MOCK_WEAK | 0.08 | FAIL | 0.0 | false | false | 0.00 | SIM_ENGINE_GAP |
| SIM-03-002 | TT-1 | MOCK_STRONG | 0.75 | PASS | 1.0 | true | true | 0.00 | — |
| SIM-04-001 | TT-4 | MOCK_MEDIUM | 0.79 | PASS | 1.0 | true | true | 0.00 | — |
| SIM-04-002 | TT-1 | MOCK_STRONG | 0.92 | PASS | 1.0 | true | true | 0.67 | — |
| SIM-05-001 | TT-2 | MOCK_WEAK | 0.05 | FAIL | 0.0 | false | false | 0.00 | SIM_TRAP_TAKEN |
| SIM-05-002 | TT-5 | MOCK_MEDIUM | 0.64 | FAIL | 0.6 | true | true | 0.00 | SIM_SCORING_LIMITATION |
| SIM-06-001 | TT-3 | MOCK_WEAK | 0.08 | FAIL | 0.0 | false | false | 0.00 | SIM_ENGINE_GAP |
| SIM-06-002 | TT-4 | MOCK_STRONG | 0.73 | PASS | 0.6 | true | true | 0.00 | — |

**Summary: 8 passed / 4 failed (67%)**

Column key:
- RC.score = rootCause dimension score (weight 30%)
- BRA.pass = badRecommendationAvoidance passed (zero-tolerance; critical failure if false)
- EVD.pass = evidenceDiscipline passed (zero-tolerance; critical failure if false)
- MIR.score = missingInputRequests dimension score (weight 15%)

---

## Failure Classification Detail

### SIM-03-001 — SIM_ENGINE_GAP

- All five `must_identify` terms missed (score 0.0)
- Four bad recommendations present in MOCK_WEAK output
- Evidence discipline failed (no evidence requests)
- Tier: MOCK_WEAK — intentional; demonstrates engine-gap failure mode
- Classification: **SIM_ENGINE_GAP** — zero root-cause term coverage; no vocabulary alignment
  between the WEAK mock and the fixture's `must_identify` rubric

### SIM-05-001 — SIM_TRAP_TAKEN

- All five `must_identify` terms missed (score 0.0)
- Four bad recommendations present: CRM recommendation, intake manager hire,
  increased advertising budget, additional ad channels — all in the fixture's `bad_recommendations_to_flag`
- TT-2 adversarial resistance check: FAILED (output took the follow-up-process misclassification)
- Classification: **SIM_TRAP_TAKEN** — output suggested the exact bad recommendations the fixture
  flags; adversarial resistance check confirmed the wrong diagnostic path was taken

### SIM-05-002 — SIM_SCORING_LIMITATION

- Root cause partially matched (3/5 must_identify terms; score 0.6, passed rootCause gate)
- Bad recommendations avoided; evidence discipline passed
- Total score 0.64 — below 0.70 threshold
- Missing input requests dimension: score 0 (anchor term matching did not find request phrases)
- Prioritization dimension: below 50% secondary cause coverage
- Classification: **SIM_SCORING_LIMITATION** — output was directionally correct but fell below
  threshold due to missing input request phrasing and incomplete secondary cause coverage;
  not an engine gap or confabulation issue

### SIM-06-001 — SIM_ENGINE_GAP

- All five `must_identify` terms missed (score 0.0)
- Two bad recommendations present: larger workshop facility, reducing furniture design count
- Evidence discipline failed (no evidence requests)
- Tier: MOCK_WEAK — intentional; demonstrates engine-gap failure mode
- Classification: **SIM_ENGINE_GAP** — zero root-cause term coverage; WEAK output chose headcount
  and facility expansion over constraint-location analysis

---

## Failure Class Summary

| Failure Class | Count | Cases |
|---------------|-------|-------|
| PASS | 8 | SIM-01-001, SIM-01-002, SIM-02-001, SIM-02-002, SIM-03-002, SIM-04-001, SIM-04-002, SIM-06-002 |
| SIM_ENGINE_GAP | 2 | SIM-03-001, SIM-06-001 |
| SIM_TRAP_TAKEN | 1 | SIM-05-001 |
| SIM_SCORING_LIMITATION | 1 | SIM-05-002 |
| SIM_INPUT_MODEL_GAP | 0 | — |
| SIM_HONEST_CEILING | 0 | — |
| SIM_FIXTURE_ERROR | 0 | — |
| SIM_CONFABULATION | 0 | — |
| SIM_CONFLICT_IGNORED | 0 | — |

---

## Unsafe Recommendations (Bad Recs Triggered)

The following bad recommendations were detected in WEAK-tier mock outputs.
These are intentional (WEAK outputs are designed to take the bad-rec path) but would be
safety failures if produced by the real engine.

| Case | Bad Recommendation Triggered |
|------|------------------------------|
| SIM-03-001 | "hire a dedicated salesperson to grow total revenue" |
| SIM-03-001 | "invest in building an online sales channel" |
| SIM-03-001 | "expand by adding new overseas suppliers to the range" |
| SIM-03-001 | "increase general promotional activity to raise overall brand awareness" |
| SIM-05-001 | "implement a CRM system to improve tracking and follow-up of incoming enquiries" |
| SIM-05-001 | "hire a dedicated intake manager to handle lead follow-up more consistently" |
| SIM-05-001 | "increase the digital advertising budget to generate a higher total volume of enquiries" |
| SIM-05-001 | "add more advertising channels to diversify lead sources" |
| SIM-06-001 | "invest in a larger workshop facility to accommodate more simultaneous orders" |
| SIM-06-001 | "reduce the number of furniture designs offered to simplify the production process" |

All bad-rec violations are in deliberately WEAK-tier mock outputs. No STRONG or MEDIUM tier
output triggered a bad recommendation.

---

## TT-2 Adversarial Resistance

| Case | Adversarial Check | Result |
|------|-------------------|--------|
| SIM-02-001 | No misclassification phrase defined in fixture | N/A (skipped) |
| SIM-05-001 | CRM/follow-up misclassification expected | FAILED — output took the trap |

---

## TT-5 Trap Resistance

| Case | Trap Phrase | Result |
|------|------------|--------|
| SIM-01-002 | Trap phrase in output (14-month-ago client attribution) | FAILED — trap matched |
| SIM-05-002 | "marketing campaigns not reaching enough audience" | PASSED — trap not in output |

SIM-01-002 still PASSED overall scoring because root-cause dimension was strong (all 5 terms
matched). The trap resistance failure is recorded but did not cause a total score failure at
this quality tier.

---

## Whether Batch 1 Provides Real Validation Evidence

**NO.**

All outputs are hand-crafted mock strings. The scoring contract is exercised and verified
to be functional, but no real OpsIQ diagnostic engine output has been evaluated.

Batch 1 establishes:
1. The scoring contract functions correctly against real fixture rubrics
2. The fixture schema validates correctly for all 12 cases
3. `loadSimulationFixtures` correctly loads and exposes all 12 cases
4. The failure class taxonomy is exercised across SIM_ENGINE_GAP, SIM_TRAP_TAKEN, and SIM_SCORING_LIMITATION
5. Test suite: 4 test files, 68 tests — all passed

Batch 1 does NOT establish:
- Whether the OpsIQ engine produces correct diagnoses for any of these 12 cases
- Whether the adapter can correctly translate `input_packet` to engine input
- Whether the engine avoids bad recommendations on real inputs

---

## Next Exact Prompt

```
TASK: BUILD_SIMULATION_ENGINE_ADAPTER

Build the adapter that connects SimulationFixture.input_packet to the OpsIQ engine so
that real engine output can be scored against the 12 Batch 1 fixtures.

Files to create:
  tests/owner-mode/real-world-simulation/adaptFixtureToEngineInput.ts
  Function: adaptSimulationFixtureToEngineInput(fixture: SimulationFixture): SmbFixture

Files to reference:
  tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts (engine input format)
  tests/owner-mode/real-world-smb-cases/normalizeFixtureToEvidence.ts (field mapping)
  tests/owner-mode/real-world-simulation/simulationFixtureSchema.ts (SimulationFixture shape)
  tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl (12 cases)

After building the adapter, author evidence-hint sidecar files for each of the 12 simulation
cases under tests/owner-mode/real-world-simulation/evidence-hints/ following the existing
pattern in tests/owner-mode/real-world-smb-cases/evidence-hints/.

Then update runBatch1Scoring.ts to call the real engine via the adapter instead of mock
outputs and re-run to get real validation evidence.

Acceptance criteria:
- All 12 cases execute against the real engine
- Scores recorded; failure classes reflect actual engine behavior
- No mock outputs used
```
