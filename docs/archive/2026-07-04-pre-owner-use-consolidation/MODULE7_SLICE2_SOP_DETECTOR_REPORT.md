# Module 7 (SOP, Process & Execution Accountability) — Slice 2: Detector — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic detector over the Slice 1
execution engine: risk findings + opportunity findings + deterministic ranking +
`diagnoseSopSnapshot` → spine `DomainScore { domain: "sop" }`. No DB/API/UI yet.
Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slice 1 (engine) is proven. Per the 8-slice contract, **Slice 2 = the detector**:
it turns the engine's metrics into explainable `OwnerFinding`s and the execution
`DomainScore` that the planner (Slice 3) and command center consume. This is the
diagnosis-quality and bottleneck-identification layer for the execution domain.

## 2. Files created / changed

Created (`src/domain/owner-sop/`):
- `risk-rules.ts` — `buildSopRiskFindings`: invalid currency, missing critical
  data, low completion (bands), low verification (bands), high overdue (bands),
  repeated failures (bands), high dispute, high reassignment, low proof
  compliance, low SOP coverage (bands). Each emits only when its metric is
  computable and crosses its threshold; `sourceValue` from a real metric only.
- `opportunity-rules.ts` — `buildSopOpportunityFindings`: clear overdue backlog,
  convert repeated failures into SOPs, close the SOP coverage gap, raise
  verification discipline, improve data quality. Emitted only when supporting
  inputs exist (never fabricated).
- `diagnosis.ts` — `rankSopFindings` (severity→impact→urgency→confidence→code) +
  `diagnoseSopSnapshot` → ranked risk/opportunity findings + `DomainScore`
  (`domain: "sop"`, execution health/risk/opportunity/dataConfidence, top finding
  codes).

Changed: `src/domain/owner-sop/index.ts` (barrel +3 exports).
Created test: `src/__tests__/owner-sop/diagnosis.test.ts` (9 tests).

## 3. Honesty / governance

- Deterministic, no LLM. Findings cite sourceMetric/value/threshold/evidence.
- No fabrication: opportunities require real inputs; missing data surfaces as a
  certain finding + `missingData`, never invented.
- Findings validate against the spine `ownerFindingSchema`; the `DomainScore`
  validates against `domainScoreSchema` with `domain: "sop"`.
- Models only business-operational accountability variables (no mental-health /
  personality modelling). No existing file modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-sop/` | 25 passed (engine 16 + detector 9) |
| `npx eslint src/domain/owner-sop src/__tests__/owner-sop` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 3 — action planner**
(`SOP_REC_TEMPLATES` per finding code → `OwnerAction`s with pressure-weighted
priority). Migration gate is Slice 4. Public/SaaS stays frozen.
