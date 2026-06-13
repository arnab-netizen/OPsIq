# Module 8 (Strategy & Scenario Planning) — Slice 3: Action Planner — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic planner over the Slice 2
detector: finding → traceable `StrategyRecommendation` → spine `OwnerAction`
(status "proposed") with pressure-weighted priority → ranked plan + recommended
next action. No DB/API/UI. Module 1 + all proven modules untouched. Public/SaaS
frozen.

## 1. Why this is the correct next slice

Slices 1–2 (engine + detector) are proven. Per the 8-slice contract, Slice 3 is the
planner: it turns ranked scenario findings into concrete, prioritised owner actions
with verification metrics — the decision → action bridge (drop/re-scope, compare
alternatives, cap downside, stage payback, secure funding, de-risk, pursue/scale).

## 2. Files created / changed

Created (`src/domain/owner-strategy/`):
- `recommendations.ts` — `STRATEGY_REC_TEMPLATES` (one template per emitted finding
  code) + `buildStrategyRecommendation(s)`. Each recommendation carries the
  finding's real sourceMetric/value/threshold/evidence (never invented); a finding
  with no template yields no recommendation.
- `actions.ts` — `recommendationToOwnerAction` (spine `calculateOwnerPriorityScore`
  with the **scenario risk score** as the pressure weight, so drop/re-scope/cap-
  downside outranks pursue/scale) + `planStrategyActionsFromDiagnosis` (ranks via
  the spine `rankOwnerActions`, selects `recommendedNextAction`, reports
  `missingActionInputs`).

Changed: `src/domain/owner-strategy/index.ts` (barrel +2 exports).
Created test: `src/__tests__/owner-strategy/actions.test.ts` (9 tests).

## 3. Honesty / governance

- Deterministic, no LLM. Every action ties to a finding (`findingCode`) and a
  verification metric/method; priority is a pure function of impact × confidence ×
  urgency × effort × severity × scenario-risk pressure.
- No fabrication: only findings with a template become recommendations; the rest
  are reported in `missingActionInputs` (empty in practice — every emitted finding
  has a template, asserted by test).
- Actions validate against the spine `ownerActionSchema` with `domain: "strategy"`,
  `status: "proposed"`, integer bounded priority. No existing module file modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-strategy/` | 35 passed (engine 16 + detector 10 + planner 9) |
| `npx eslint src/domain/owner-strategy src/__tests__/owner-strategy` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 4 — persistence +
migration (GATE)**: additive Prisma `OwnerStrategy*` models + an additive
`CREATE TABLE` migration + a manual fail-closed migrate workflow — create the
workflow and stop for the owner to run. Public/SaaS stays frozen.
