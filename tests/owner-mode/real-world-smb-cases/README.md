# OpsIQ Real-World SMB Case Harness

## What This Is

A deterministic test harness for evaluating OpsIQ Owner Mode against 12 anonymized,
source-inspired real-world SMB scenarios. Designed to catch generic advice, missed root
causes, and failure to request missing inputs before public/SaaS release.

## Where Fixtures Live

```
tests/owner-mode/real-world-smb-cases/
├── opsiq_real_world_smb_case_fixtures.jsonl   ← 12 case fixtures (one JSON per line)
├── opsiq_real_world_smb_case_pack.md          ← Case index and descriptions
├── fixtureSchema.ts                           ← Strict schema validator
├── fixtureSchema.test.ts                      ← 11 schema validation tests
├── loadFixtures.ts                            ← Fixture loader (loadRealWorldSmbFixtures etc.)
├── loadFixtures.test.ts                       ← Loader tests
├── scoringContract.ts                         ← 4-dimension deterministic scorer
├── scoringContract.test.ts                    ← 8 scoring tests
├── runCaseAgainstOpsiq.ts                     ← Engine adapter (PENDING — see below)
├── realWorldSmbHarness.test.ts                ← Harness (Part A: infra tests; Part B: skipped)
├── README.md                                  ← This file
└── REAL_WORLD_SMB_CASES_AUDIT.md             ← Audit report
```

## How to Run

```bash
npm run test:owner-real-world-smb
```

## What Is Being Tested

1. **Fixture validation** — all 12 JSONL cases pass strict schema checks
2. **Fixture loading** — loader returns typed fixtures; ID lookup works
3. **Scoring contract** — 4-dimension keyword-based scoring is correct and deterministic
4. **Harness infrastructure** — all 12 fixtures are scoreable without throwing

## What Is NOT Being Tested (Yet)

- Live OpsIQ engine output — engine integration is PENDING (see below)
- Database behavior
- Authentication or authorization
- UI rendering
- Any live or external data source

## Engine Integration Status: SKIPPED

The `realWorldSmbHarness.test.ts` Part B (engine integration) is **skipped**.

**Reason:** The OpsIQ diagnosis engine (`diagnoseRootCause`) requires `EvidenceItem[]`
with typed canonical dimensions (e.g., `"financial_health"`, `"market_position"`).
SMB fixtures carry narrative format (free-form symptoms, key-value facts). No
deterministic conversion from narrative → typed `EvidenceItem[]` exists without
either case-specific handwritten mappings or an NLP layer (not permitted — no external
calls).

**Missing entrypoint:** `tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts`
documents the resolution path. Author companion `EvidenceItem[]` arrays per fixture
to enable integration.

## About the Cases

These are **source-inspired, anonymized composite scenarios**. They are NOT factual
private business records. Each case documents its `source_basis` field to indicate
the general pattern category it represents.

Cases **must not** be treated as private records of real individuals or organizations.
They are test scenarios for evaluating OpsIQ's diagnostic quality.

## What the Tests Score

Each case evaluates OpsIQ output on four dimensions:

| Dimension | Weight | Pass condition |
|---|---|---|
| ROOT_CAUSE_ALIGNMENT | 40% | ≥60% of `must_identify` terms present in output |
| MISSING_INPUT_REQUESTS | 20% | ≥1 missing-input category addressed |
| FIRST_ACTION_QUALITY | 20% | ≥40% of expected first-action key tokens matched |
| BAD_RECOMMENDATION_AVOIDANCE | 20% | Zero flagged bad recommendations detected |

**Pass threshold:** totalScore ≥ 0.70 AND ROOT_CAUSE_ALIGNMENT passed AND BAD_RECOMMENDATION_AVOIDANCE passed.

## Do Not Use These Cases to Tune the Engine

These cases are a harness, not a training set. Do not adjust detection vocabulary or
scoring thresholds to make these cases pass. They are a test of the engine as-is.
