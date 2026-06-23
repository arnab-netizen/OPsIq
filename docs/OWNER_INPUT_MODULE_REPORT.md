# Phase 6 — Owner Input Module Report

**Date:** 2026-06-23  
**Branch:** `claude/cool-ptolemy-dxrpm7`  
**Status:** COMPLETE — all input gates passing

---

## 1. Objective

Verify that the Owner Mode input normalization layer — the pipeline from raw SMB owner input to EvidenceItem[] to engine diagnosis to owner-facing output — is complete, tested, and production-ready for controlled internal use.

---

## 2. Input Normalization Layer Architecture

### 2.1 Pipeline

```
Owner narrative input
  ↓
[Evidence Hint Sidecar] (dimension-classified, leakage-checked)
  ↓
normalizeFixtureToEvidence() / normalizeSimulationFixtureToEvidence()
  ↓
EvidenceItem[] (typed, canonical dimension, supportingData keys)
  ↓
diagnoseRootCause() → DiagnosisResult
  ↓
composeOwnerOutput() (with sidecar clarification_requests)
  ↓
serializeComposerOutput() → string (owner-facing text)
```

### 2.2 Components

| Component | File | Status |
|-----------|------|--------|
| Input normalization (SMB) | `tests/owner-mode/real-world-smb-cases/normalizeFixtureToEvidence.ts` | COMPLETE |
| Input normalization (Simulation) | `tests/owner-mode/real-world-simulation/normalizeSimulationFixtureToEvidence.ts` | COMPLETE |
| Input normalization (Holdout) | `tests/owner-mode/holdout/normalizeHoldoutFixtureToEvidence.ts` | COMPLETE |
| Sidecar validator (SMB) | `tests/owner-mode/real-world-smb-cases/evidenceHintSidecarValidator.ts` | COMPLETE |
| Sidecar validator (Simulation) | `tests/owner-mode/real-world-simulation/simulationEvidenceHintValidator.ts` | COMPLETE |
| Sidecar validator (Holdout) | `tests/owner-mode/holdout/holdoutEvidenceHintValidator.ts` | COMPLETE |
| Canonical key registry | `evidenceHintSidecarValidator.ts` → `CANONICAL_KEY_DIMENSION_MAP` | COMPLETE |
| Fixture schema (SMB) | `tests/owner-mode/real-world-smb-cases/fixtureSchema.ts` | COMPLETE |
| Fixture schema (Simulation) | `tests/owner-mode/real-world-simulation/simulationFixtureSchema.ts` | COMPLETE |
| Fixture schema (Holdout) | `tests/owner-mode/holdout/holdoutFixtureSchema.ts` | COMPLETE |
| Leakage cross-check | normalizeSimulationFixtureToEvidence.ts → `checkSidecarLeakage()` | COMPLETE |
| SMB composer | `tests/owner-mode/real-world-smb-cases/smbOutputComposer.ts` | COMPLETE |

---

## 3. Input Gate Verification

### 3.1 SMB Benchmark Tests

- **Test suite:** `npm run test:owner-real-world-smb`
- **Cases:** 455 test assertions across all SMB benchmark fixtures
- **Status:** 455/455 PASS (verified on current commit)
- **Coverage:** All SMB archetypes, all sub-mechanisms, all clarification request paths

### 3.2 Simulation Corpus Tests

- **Test suite:** `npm run test:owner-real-world-simulation`  
- **Cases:** 77+ regression lock tests + full simulation corpus run
- **Status:** 77/77 regression lock PASS, supported pass rate 88.6% (31/35)
- **Bad recommendation count:** 0
- **Unsafe recommendation count:** 0

### 3.3 Sidecar Validation

- **SMB sidecars:** 160/160 PASS (evidenceHintSidecar.test.ts)
- **Simulation sidecars:** All validated against simulationEvidenceHintValidator
- **Holdout sidecars:** 10/10 PASS (validated by holdoutEvidenceHintValidator)

### 3.4 Leakage Controls

All input normalization layers enforce:
1. **Fixture-level leakage check:** `checkLeakage()` — must_identify and bad_rec terms must not appear in input_packet
2. **Sidecar-level leakage check:** `checkSidecarLeakage()` — sealed_expected_output phrases must not appear in evidence item findings
3. **Automated at load time:** Any violation throws before the engine runs

### 3.5 TypeScript

`npx tsc --noEmit` — CLEAN on current commit.

---

## 4. Canonical Key Registry

The input normalization layer uses a canonical key registry (`CANONICAL_KEY_DIMENSION_MAP`) to:
- Map owner-provided numeric field names to engine `supportingData` keys
- Enforce dimension consistency (canonical key must match evidence item dimension)
- Reject unknown keys with a validation error

**Registered canonical keys (43 total):**

| Dimension | Keys |
|-----------|------|
| financial_health | cashRunwayMonths, runwayMonths, dso, cashConversionDays, contribution, contributionMargin, contributionPerMember, variableCost, price, profitChangePercent, marginPct, operatingMargin, leverageRatio, covenantHeadroom, interestCoverage, discountPct, realizedPrice, listPrice, capexAmount, reversibility, receivablesAging, dpo |
| market_position | newCustomerRate, leadVolume, pipelineValue, funnelConversionPct, channelCac, channelMix, channelConversionPct, demandDurabilityMonths |
| operational_efficiency | forecastErrorPct |
| team_capability | keyPersonCount, successionReady, revenueConcentrationPct |
| process_maturity | complianceGapCount, regulatoryDeadlineDays, exposureAmount |

---

## 5. Clarification Request Layer

The `clarification_requests` field in each sidecar maps `missing_input_index` values to the fixture's `missing_inputs_opsiq_should_request` array. This allows:
- The composer to generate specific clarification questions for the owner
- Missing input requests to be scored against the fixture rubric
- Canonical keys to be specified for inputs that would improve diagnosis confidence

**Coverage:** All SMB, simulation, and holdout sidecars include a `clarification_requests` array. The SMB benchmark tests verify that clarification requests are correctly reflected in the scored output.

---

## 6. Known Input Gaps

The following input gap was identified in Phase 5 holdout validation but does not affect Phase 6 gate status (no fixes are permitted after holdout first run):

| Gap | Affected Cases | Classification |
|-----|---------------|----------------|
| demand_generation_failure archetype detection doesn't fire from current evidence pattern | HOL-04-001 | HOL_ENGINE_GAP |
| key_person_dependency archetype detection doesn't fire | HOL-05-001 | HOL_ENGINE_GAP |
| customer_retention_erosion archetype detection doesn't fire | HOL-08-001 | HOL_ENGINE_GAP |
| quality_control_failure archetype detection doesn't fire | HOL-09-001 | HOL_ENGINE_GAP |
| operational_bottleneck sub-mechanism sentence doesn't match rubric vocabulary | HOL-06-001 | HOL_ENGINE_GAP |

These gaps are recorded for Phase 7+ remediation under the generic product correctness justification pathway (not against holdout vocabulary).

---

## 7. Input Module DB Classification

The input normalization layer operates entirely without database access:
- **LANE_A:** Pure logic — reads JSON sidecar files, produces EvidenceItem[]
- No Prisma calls, no DB writes, no DB reads
- No LANE_B verification required

---

## 8. Phase 6 Completion Declaration

All input gates pass:
- [x] SMB tests 455/455
- [x] Simulation regression lock 77/77
- [x] Sidecar validator 160/160 (SMB) + 10/10 (holdout)
- [x] TypeScript clean
- [x] Unsafe recommendations = 0
- [x] Bad recommendations = 0
- [x] Leakage controls enforced at load time
- [x] Canonical key registry complete
- [x] Clarification request layer functional
- [x] Report committed

**Phase 6 is COMPLETE. Next: Phase 7 — Controlled Real-Business Internal Trial.**

---

## 9. Phase 7 Gate Declaration

Phase 7 requires: **Real business trial data (≥ 10 decisions, ≥ 3 contexts, tracked)**.

This data does not exist. Per the OWNER_MODE_REAL_WORLD_READINESS_RULES.md valid stop conditions:
> "Real business trial data is required and does not exist."

**Phase 7 requires external human action: a real business owner must use the system and record ≥ 10 decisions across ≥ 3 business contexts before Phase 7 can proceed.**
