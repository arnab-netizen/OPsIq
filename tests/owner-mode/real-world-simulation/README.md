# OpsIQ Real-World Simulation Program — Harness

This directory contains the scaffold for the OpsIQ Real-World Simulation Program.

See `tests/owner-mode/real-world-smb-cases/REAL_WORLD_SIMULATION_MASTER_PLAN.md` for the full program specification.

---

## Directory Structure

```
real-world-simulation/
├── README.md                              (this file)
├── simulationFixtureSchema.ts             Schema validator for simulation fixtures
├── simulationFixtureSchema.test.ts        Schema tests
├── loadSimulationFixtures.ts              Fixture loader
├── loadSimulationFixtures.test.ts         Loader tests
├── simulationScoringContract.ts           8-dimension scoring contract
├── simulationScoringContract.test.ts      Scoring tests
├── simulationHarness.test.ts              End-to-end harness tests
└── fixtures/
    └── simulation_cases.jsonl             Author cases here (not yet present)
```

---

## Running Tests

```bash
npm run test:owner-real-world-simulation
```

All tests pass with zero fixtures. The harness reports `SIMULATION_CORPUS_NOT_READY` when `fixtures/simulation_cases.jsonl` does not exist — this is correct behaviour, not a failure.

---

## Fixture File

Author simulation cases to:

```
tests/owner-mode/real-world-simulation/fixtures/simulation_cases.jsonl
```

One JSON object per line. Case IDs must follow the pattern `SIM-{nn}-{nnn}` where `{nn}` is the two-digit category number (01–12) and `{nnn}` is the three-digit case sequence number.

Example: `SIM-01-001`, `SIM-01-002`, `SIM-02-001`

---

## Case Schema

See `simulationFixtureSchema.ts` for the full TypeScript interface.

Required top-level fields:
- `case_id` — Pattern `/^SIM-\d{2}-\d{3}$/`
- `title`
- `category` — One of SC-01 through SC-12
- `test_type` — One of TT-1 through TT-5
- `segment`
- `business_context`
- `input_packet` — Engine-visible only; must not contain answer-key vocabulary
- `sealed_expected_output` — Sealed before first run
- `source_basis`
- `leakage_controls` — `author_read_benchmark_fixtures: false`, `author_read_composer_source: false`
- `holdout_meta`

---

## Scoring Dimensions

8 dimensions:

| Dimension | Weight | Critical |
|---|---|---|
| rootCause | 30% | Yes |
| prioritization | 10% | No |
| firstAction | 15% | No |
| missingInputRequests | 15% | No |
| badRecommendationAvoidance | 15% | Yes |
| evidenceDiscipline | 10% | Yes |
| reassessmentQuality | 5% | No |
| learningLoopEligibility | 0% | No (metadata only) |

Pass rule: totalScore ≥ 0.70 AND badRecommendationAvoidance.passed AND evidenceDiscipline.passed AND no criticalFailures.

---

## Adding Cases

1. Read `REAL_WORLD_SIMULATION_MASTER_PLAN.md` fully before authoring
2. Confirm you have NOT read `smbOutputComposer.ts` or any SMB-001 through SMB-012 fixture
3. Set `leakage_controls.author_read_benchmark_fixtures: false` and `author_read_composer_source: false`
4. Add case to `fixtures/simulation_cases.jsonl`
5. Run `npm run test:owner-real-world-simulation` — schema validation runs automatically
6. Do NOT run the simulation engine against cases until the corpus is sealed and a SHA-256 hash is recorded

---

## Corpus Status Lifecycle

```
fixtures/simulation_cases.jsonl absent or empty
  → corpus.status = NOT_READY
  → harness reports SIMULATION_CORPUS_NOT_READY
  → no pass rate computable

fixtures/simulation_cases.jsonl present with ≥1 valid case
  → corpus.status = READY
  → harness can run and produce scores
  → first-run targets apply (see REAL_WORLD_SIMULATION_MASTER_PLAN.md Part 4)
```

---

## First-Run Targets (from REAL_WORLD_SIMULATION_MASTER_PLAN.md)

| Metric | First-Run Target |
|---|---|
| Supported TT-1 pass rate | ≥ 55% |
| Average totalScore (TT-1) | ≥ 0.62 |
| Adversarial resistance (TT-2) | ≥ 60% |
| Missing-input coverage (TT-3) | ≥ 70% |
| Conflict detection (TT-4) | ≥ 60% |
| Trap resistance (TT-5) | ≥ 65% |
| Bad recommendation violations | 0 |
| Unsupported abstention quality | 100% |

Targets are declared before the first run and cannot be changed retroactively.
