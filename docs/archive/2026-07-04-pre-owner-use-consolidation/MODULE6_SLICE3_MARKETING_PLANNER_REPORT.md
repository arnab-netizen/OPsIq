# Module 6 (Marketing & Growth Intelligence) — Slice 3: Action Planner — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic planner over the Slice 2
detector: finding → traceable `MarketingRecommendation` → spine `OwnerAction`
(status "proposed") with pressure-weighted priority → ranked plan + recommended
next action. No DB/API/UI. Module 1 + all proven modules untouched. Public/SaaS
frozen.

## 1. Why this is the correct next slice

Slices 1–2 (engine + detector) are proven. Per the 8-slice contract, Slice 3 is
the planner — it turns ranked findings into concrete, prioritised owner actions
with verification metrics (the action-prioritization + decision-support layer).

## 2. Files created / changed

Created (`src/domain/owner-marketing/`):
- `recommendations.ts` — `MARKETING_REC_TEMPLATES` (one per emitted finding code:
  stop waste, raise conversion, strengthen offer, rebalance channels, activate
  referrals, add follow-up, scale winner, fix currency, improve data quality) +
  `buildMarketingRecommendation(s)`. Each carries the finding's real source
  metric/value/threshold/evidence; no template → no recommendation.
- `actions.ts` — `recommendationToOwnerAction` (spine `calculateOwnerPriorityScore`
  with the **marketing risk score** as the pressure weight, so stopping waste
  outranks optimisation) + `planMarketingActionsFromDiagnosis` (spine
  `rankOwnerActions`, `recommendedNextAction`, `missingActionInputs`).

Changed: `src/domain/owner-marketing/index.ts` (barrel +2 exports);
`opportunity-rules.ts` (capped the lift-conversion opportunity impact at 50 so a
medium upside cannot saturate priority above a paired critical risk —
prioritization-correctness fix surfaced by the planner test).
Created test: `src/__tests__/owner-marketing/actions.test.ts` (9 tests).

## 3. Honesty / governance

- Deterministic, no LLM. Every action ties to a finding (`findingCode`) + a
  verification metric/method; priority is a pure function of impact × confidence ×
  urgency × effort × severity × marketing-risk pressure.
- No fabrication: only templated findings become recommendations; the rest are
  reported in `missingActionInputs` (empty in practice — asserted by test).
- **Prioritization correctness:** a critical "stop wasted spend" now correctly
  outranks a medium conversion-upside action (the opportunity impact was capped so
  it no longer ties the critical at the priority ceiling and wins on raw impact).
- Actions validate against the spine `ownerActionSchema` with `domain: "marketing"`,
  `status: "proposed"`, integer bounded priority. No other module file modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-marketing/` | 36 passed (engine 17 + detector 10 + planner 9) |
| `npx eslint src/domain/owner-marketing src/__tests__/owner-marketing` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 4 — persistence +
migration (GATE)**: additive Prisma `OwnerMarketing*` models + an additive
`CREATE TABLE` migration + a manual fail-closed migrate workflow — create the
workflow and stop for the owner to run. Public/SaaS stays frozen.
