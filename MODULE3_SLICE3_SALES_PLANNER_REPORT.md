# Module 3 (Sales & Customer Intelligence) — Slice 3: Action Planner — Report

Status: **COMPLETE — built and locally verified.** Pure deterministic planner
(no DB / API / UI / LLM). Maps Slice 2 findings → traceable recommendations →
Spine `OwnerAction[]` with pressure-weighted priority. Module 1 + Module 2 +
Module 5 untouched. No Prisma/migration change. No public/SaaS.

## 1. Files created / changed

- `src/domain/owner-sales/recommendations.ts` — `SALES_REC_TEMPLATES`,
  `buildSalesRecommendation(s)` (new).
- `src/domain/owner-sales/actions.ts` — `recommendationToOwnerAction`,
  `planSalesActionsFromDiagnosis` (new).
- `src/domain/owner-sales/index.ts` — export planner (changed).
- `src/__tests__/owner-sales/actions.test.ts` — 9 tests (new).

## 2. What it does

- Every Slice 2 finding code has a recommendation template (categories:
  improve_conversion, improve_follow_up, improve_retention, win_back,
  reduce_complaints, control_discount, reduce_refunds, build_b2b_pipeline,
  improve_data_quality), so `missingActionInputs` is empty (test-proven).
- Recommendations are fully traceable: `sourceMetric` / `sourceValue` /
  `threshold` / `severity` / `confidence` / `evidence` carried from the real
  finding (never invented); `verificationMetric` + `verificationMethod` +
  `expectedTimeframeDays` define how the owner proves the result.
- Actions are Spine `OwnerAction`s (status `proposed`, domain `sales`) with a
  deterministic, pressure-weighted priority via `calculateOwnerPriorityScore`
  using the **sales risk score** as the pressure weight — urgent sales fixes
  outrank optimisation work. Ranked by the Spine ranker; `recommendedNextAction`
  is the top action (a critical-severity action under distress — test-proven).

## 3. Honesty guarantees

- A finding with no template yields no recommendation (no fabrication) — proven
  with an unknown finding code.
- `sourceValue` comes only from a real computed metric.
- Priority is bounded 0..100 integer; pressure weighting only ever raises (never
  fabricates) priority — proven against the spine helper directly.
- Planner does not mutate the diagnosis findings (deep-equal check).

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-sales/` | 35 passed (17 + 9 + 9) |
| `npm run build` | Compiled successfully |
| `npx eslint src/domain/owner-sales src/__tests__/owner-sales` | clean |
| `git diff --check` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm test` | full suite — see status (0 failed) |

## 5. Scope / next slice — MANUAL STOP NEXT

The deterministic sales brain (engine → detector → planner) is now complete and
pure. **No gate reached by this slice.** The next slice is **Slice 4 —
persistence schema + manual migration**, the **first manual gate**: additive
`owner_sales_*` tables + a fail-closed migration applied via the manual workflow
(no migration run by the agent). Slices 5–8 (API, UI + command-center, runtime
proof, audit) follow.
