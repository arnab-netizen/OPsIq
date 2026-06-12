# Module 5 (Cashflow Intelligence) — Slice 3: Action Planner — Report

Status: **COMPLETE — built and locally verified.** Pure deterministic planner
(no DB / API / UI / LLM). Maps Slice 2 findings → traceable recommendations →
Spine `OwnerAction[]` with survival-weighted priority. Module 1 + Module 2
untouched. No Prisma/migration change. No public/SaaS.

## 1. Files created / changed

- `src/domain/owner-cashflow/recommendations.ts` — `CASHFLOW_REC_TEMPLATES`,
  `buildCashflowRecommendation(s)` (new).
- `src/domain/owner-cashflow/actions.ts` — `recommendationToOwnerAction`,
  `planCashflowActionsFromDiagnosis` (new).
- `src/domain/owner-cashflow/index.ts` — export planner (changed).
- `src/__tests__/owner-cashflow/actions.test.ts` — 9 tests (new).

## 2. What it does

- Every Slice 2 finding code has a recommendation template (categories:
  preserve_cash, meet_near_term_dues, manage_payables, reduce_debt_default_risk,
  collect_receivables, speed_collections, control_owner_withdrawal,
  improve_data_quality), so `missingActionInputs` is empty (test-proven).
- Recommendations are fully traceable: `sourceMetric` / `sourceValue` /
  `threshold` / `severity` / `confidence` / `evidence` are carried from the real
  finding (never invented); `verificationMetric` + `verificationMethod` +
  `expectedTimeframeDays` define how the owner proves the result.
- Actions are Spine `OwnerAction`s (status `proposed`, domain `cashflow`) with a
  deterministic, survival-weighted priority via `calculateOwnerPriorityScore`
  using the **cashflow danger score** as the survival pressure — so existential
  cash actions outrank optimisation ones. Ranked by the Spine ranker;
  `recommendedNextAction` is the top action (a critical-severity action under a
  liquidity crisis — test-proven).

## 3. Honesty guarantees

- A finding with no template yields no recommendation (no fabrication) — proven
  with an unknown finding code.
- `sourceValue` comes only from a real computed metric.
- Priority is bounded 0..100 integer; survival weighting only ever raises (never
  fabricates) priority — proven against the spine helper directly.
- Planner does not mutate the diagnosis findings (deep-equal check).

## 4. Verification (local)

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/owner-cashflow/` | 41 passed (21 + 11 + 9) |
| `npm run build` | Compiled successfully |
| `npx eslint src/domain/owner-cashflow src/__tests__/owner-cashflow` | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 (no schema change) |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm test` | **0 failed** (full suite, includes Module 1 founder-recovery) |

## 5. Scope / next slice — MANUAL STOP

The deterministic cashflow brain (engine → detector → planner) is now complete
and pure. **Slice 4 — persistence schema + manual migration** is the next slice
and is the **first manual gate**: it adds additive `owner_cashflow_*` tables and
a fail-closed migration that must be applied via the manual workflow (no
migration is run by the agent). Per the automatic-continuation rule, the session
stops at the migration step; Slices 5–8 (API, UI + condition/command-center
integration, deployed runtime proof, audit) follow after the migration is
applied.
