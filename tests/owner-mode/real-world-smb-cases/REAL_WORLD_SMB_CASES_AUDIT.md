# Real-World SMB Cases — Audit Report

**Date:** 2026-06-20
**Branch:** claude/cool-ptolemy-dxrpm7

---

## Files Added

| File | Purpose |
|---|---|
| `tests/owner-mode/real-world-smb-cases/opsiq_real_world_smb_case_fixtures.jsonl` | 12 anonymized SMB case fixtures (one JSON per line) |
| `tests/owner-mode/real-world-smb-cases/opsiq_real_world_smb_case_pack.md` | Case index and descriptions |
| `tests/owner-mode/real-world-smb-cases/fixtureSchema.ts` | Strict schema validator with typed interfaces |
| `tests/owner-mode/real-world-smb-cases/fixtureSchema.test.ts` | Schema validation tests |
| `tests/owner-mode/real-world-smb-cases/loadFixtures.ts` | Fixture loader (loadRealWorldSmbFixtures, getRealWorldSmbCaseById, listRealWorldSmbCaseIds) |
| `tests/owner-mode/real-world-smb-cases/loadFixtures.test.ts` | Loader tests |
| `tests/owner-mode/real-world-smb-cases/scoringContract.ts` | 4-dimension deterministic keyword scorer |
| `tests/owner-mode/real-world-smb-cases/scoringContract.test.ts` | Scoring contract tests |
| `tests/owner-mode/real-world-smb-cases/runCaseAgainstOpsiq.ts` | Engine adapter (PENDING — documented, not connected) |
| `tests/owner-mode/real-world-smb-cases/realWorldSmbHarness.test.ts` | Harness (Part A: infra tests; Part B: skipped integration) |
| `tests/owner-mode/real-world-smb-cases/README.md` | Test harness documentation |
| `tests/owner-mode/real-world-smb-cases/REAL_WORLD_SMB_CASES_AUDIT.md` | This file |
| `.github/workflows/owner-real-world-smb-cases.yml` | CI workflow (no DB, no secrets required) |

## Files Changed

| File | Change |
|---|---|
| `vitest.config.ts` | Added `"tests/owner-mode/**/*.test.ts"` to `include` array |
| `package.json` | Added `"test:owner-real-world-smb"` script |

## No Production Files Changed

Zero changes to:
- `src/services/consulting-engine/diagnosis-engine.ts`
- Any Owner Mode module
- Any existing test file
- Any schema or migration

---

## Cases Ingested

**12 cases ingested.** Case IDs: SMB-001 through SMB-012.

| Case ID | Segment | Primary Root Cause |
|---|---|---|
| SMB-001 | retail_smb | working_capital_cash_flow_trap |
| SMB-002 | retail_smb | inventory_cash_trap |
| SMB-003 | ecommerce_smb | negative_unit_economics_paid_acquisition |
| SMB-004 | food_service_smb | prime_cost_margin_erosion |
| SMB-005 | professional_services_smb | revenue_concentration_single_client_dependency |
| SMB-006 | fitness_smb | fixed_cost_overextension_below_breakeven |
| SMB-007 | solopreneur | owner_capacity_bottleneck_revenue_ceiling |
| SMB-008 | b2b_smb | accounts_receivable_cash_flow_gap |
| SMB-009 | services_smb | staff_turnover_cost_spiral |
| SMB-010 | food_retail_smb | input_cost_margin_compression_without_pricing_response |
| SMB-011 | saas_creator_smb | product_market_fit_gap_audience_engagement_without_paid_validation |
| SMB-012 | education_smb | unit_economics_failure_premature_expansion |

---

## Test Counts

| Category | Tests |
|---|---|
| Schema validation tests (fixtureSchema.test.ts) | 11 |
| Loader tests (loadFixtures.test.ts) | 7 |
| Scoring contract tests (scoringContract.test.ts) | 8 |
| Harness infrastructure tests (realWorldSmbHarness.test.ts Part A) | 6 |
| **Total deterministic tests** | **32** |
| Engine integration tests (Part B, skipped) | 3 skipped |

---

## Harness Status

| Component | Status |
|---|---|
| Fixture schema validation | COMPLETE |
| Fixture loader | COMPLETE |
| Scoring contract (4 dimensions) | COMPLETE |
| Harness Part A (infrastructure) | COMPLETE |
| Harness Part B (engine integration) | **SKIPPED — pending** |
| NPM script | COMPLETE |
| CI workflow | COMPLETE |
| README | COMPLETE |

---

## Engine Integration Status

**SKIPPED.** The OpsIQ diagnosis engine (`diagnoseRootCause`) accepts `EvidenceItem[]`
with typed canonical dimensions (e.g., `"financial_health"`, `"market_position"`).
SMB fixtures carry narrative format (free-form symptoms, key-value facts objects).

No deterministic, non-LLM conversion from SMB narrative → typed `EvidenceItem[]` exists
without case-specific handwritten companion arrays (out of scope for this harness task).

**Missing entrypoint:** `runCaseAgainstOpsiq.ts` documents the resolution path.

**Resolution:** For each fixture, author a companion `EvidenceItem[]` array that faithfully
represents the scenario in the engine's canonical format, then call `diagnoseRootCause()`
and map the result to the fixture's `primary_root_cause`. Remove `TODO_INTEGRATION_SKIPPED`
and enable Part B tests.

---

## Pass/Fail Count (deterministic tests only)

| Test suite | Expected result |
|---|---|
| fixtureSchema.test.ts | All 11 pass |
| loadFixtures.test.ts | All 7 pass |
| scoringContract.test.ts | All 8 pass |
| realWorldSmbHarness.test.ts Part A | All 6 pass |
| realWorldSmbHarness.test.ts Part B | 3 skipped (not failed) |

Engine integration pass/fail: **not yet run** (pending adapter).

---

## Determinism

**All 32 active tests are fully deterministic.**

- No LLM calls
- No external API calls
- No database required
- No secrets required
- All scoring is keyword-based string matching
- Fixture file is committed to the repo

---

## Commands Run

| Command | Result |
|---|---|
| `npm run test:owner-real-world-smb` | See test results |
| `npx tsc --noEmit` (SMB files only) | 0 errors |
| `npm run lint` | Not run (lint not relevant to these pure-TS files) |

---

## Limitations

1. **Source-inspired, not audited records.** The 12 cases are anonymized composites informed
   by public SMB failure literature. They are not audited private business records and
   must not be treated as such.

2. **Deterministic keyword scoring is imperfect.** Keyword matching can miss semantically
   correct answers that use different vocabulary. A semantically correct answer using
   synonyms (e.g., "payables/receivables gap" vs "AR AP mismatch") may score lower than
   deserved.

3. **Keyword scoring can be gamed.** An output that mechanically lists the `must_identify`
   terms without providing meaningful analysis could score well. This is acceptable for
   deterministic CI gates but not as a final quality measure.

4. **Bad-recommendation detection must be improved over time.** Current detection is
   phrase-based. Paraphrased bad recommendations (e.g., "invest in growth marketing" instead
   of "increase marketing and sales") may not be caught.

5. **12 cases is a small validation set.** These cases cover common failure modes but are not
   exhaustive. The case pack should be expanded with additional real-world scenarios after
   the harness is stable.

6. **Engine integration is pending.** Without real engine output being scored, the harness
   cannot yet validate OpsIQ's actual diagnosis quality against SMB scenarios.

7. **No solopreneur-to-enterprise path coverage.** The current 12 cases focus on early-stage
   SMB problems. Scaling, exit, or turnaround scenarios for mid-market businesses are not
   yet covered.

---

## Next Recommended Improvements

1. **Add companion EvidenceItem[] arrays** to each fixture to enable engine integration.
2. **Expand the case pack** to 25+ cases covering more segments and failure modes.
3. **Add semantic scoring tier** alongside keyword scoring to catch paraphrased correct answers.
4. **Add temporal scoring** — does the engine correctly sequence first action before growth actions?
5. **Run holdout validation** — add 25+ fresh cases the engine was never tuned against.
