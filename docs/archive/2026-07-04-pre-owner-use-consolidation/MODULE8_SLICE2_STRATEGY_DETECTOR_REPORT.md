# Module 8 (Strategy & Scenario Planning) — Slice 2: Detector — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic detector over the Slice 1
scenario engine: risk findings + opportunity findings + deterministic ranking +
`diagnoseStrategySnapshot` → spine `DomainScore { domain: "strategy" }`. No DB/API/UI.
Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slice 1 (engine) is proven. Per the 8-slice contract, Slice 2 is the detector: it
turns the engine's scenario economics into explainable `OwnerFinding`s and the
strategy `DomainScore` the planner (Slice 3) and command center consume — the
decision-support layer that says, in words + numbers, why an option is a go or a no.

## 2. Files created / changed

Created (`src/domain/owner-strategy/`):
- `risk-rules.ts` — `buildStrategyRiskFindings`: invalid currency, missing critical
  data, negative base case (critical), negative ROI / weak ROI bands, negative
  worst case, long-payback bands, unaffordable bands, high execution risk. Each
  emits only when its metric is computable and crosses its threshold; `sourceValue`
  from a real metric only.
- `opportunity-rules.ts` — `buildStrategyOpportunityFindings`: high-return option,
  fast payback, safe upside (worst case still profitable), data quality. Emitted
  only when supporting inputs exist (never fabricated).
- `diagnosis.ts` — `rankStrategyFindings` (severity→impact→urgency→confidence→code)
  + `diagnoseStrategySnapshot` → ranked risk/opportunity findings + `DomainScore`
  (`domain: "strategy"`, attractiveness/risk/opportunity/dataConfidence, top codes).

Changed: `src/domain/owner-strategy/index.ts` (barrel +3 exports).
Created test: `src/__tests__/owner-strategy/diagnosis.test.ts` (10 tests).

## 3. Honesty / governance

- Deterministic, no LLM. Findings cite sourceMetric/value/threshold/evidence.
- No fabrication: opportunities require real inputs; a negative base case / ROI is
  surfaced as a critical risk, never hidden; missing data surfaces as a certain
  finding + `missingData`.
- Findings validate against the spine `ownerFindingSchema`; the `DomainScore`
  validates against `domainScoreSchema` with `domain: "strategy"`. No existing file
  modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-strategy/` | 26 passed (engine 16 + detector 10) |
| `npx eslint src/domain/owner-strategy src/__tests__/owner-strategy` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 3 — action planner**
(`STRATEGY_REC_TEMPLATES` per finding code → `OwnerAction`s with pressure-weighted
priority → `planStrategyActionsFromDiagnosis`). Migration gate is Slice 4.
Public/SaaS stays frozen.
