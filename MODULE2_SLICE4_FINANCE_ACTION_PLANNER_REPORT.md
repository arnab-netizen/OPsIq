# Module 2 — Slice 4 — Finance Recommendation/Action Planner — Report

Status: **Slice 4 COMPLETE (pure planner).** No DB/schema/API/UI/migration. Module
1, Spine, Slice 2 metrics, and Slice 3 findings unchanged. Public/SaaS frozen.

## 1. Files created / updated

- `src/domain/owner-finance/recommendations.ts` — finding → traceable
  `FinanceRecommendation` (template-driven, deterministic).
- `src/domain/owner-finance/actions.ts` — recommendation → Spine `OwnerAction`
  (status "proposed") + `planFinanceActionsFromDiagnosis`.
- `src/domain/owner-finance/index.ts` — re-exports the new modules.
- `src/__tests__/owner-finance/actions.test.ts` — 16 unit tests (pure).
- `MODULE2_SLICE4_FINANCE_ACTION_PLANNER_REPORT.md` — this report.

## 2. Recommendation rules implemented

A recommendation is built for each finding via a deterministic template map (21
finding codes covered). Every recommendation carries: `recommendationCode`,
`findingCode`, `category`, `sourceMetric`, `sourceValue` (only from a real metric —
`null` otherwise), `threshold`, `severity`, `expectedFinancialImpactScore`,
`urgencyScore`, `confidence`, `requiredOwnerAction`, `verificationMetric`,
`verificationMethod`, `expectedTimeframeDays`, `effortScore`, `ownerRole`, `title`,
`evidence`. Categories include the required set — **stop_reduce_leakage,
collect_receivables, reduce_debt_pressure, reduce_fixed_cost_burden,
reduce_payroll_burden, reach_break_even, improve_margin, improve_data_quality,
improve_revenue_quality** — plus preserve_cash and manage_payables.

## 3. Action planner behavior

`recommendationToOwnerAction` builds a Spine `OwnerAction` with `domain="finance"`,
`status="proposed"`, `findingCode`, `title`, `description` (= requiredOwnerAction),
`ownerRole`, `expectedImpactScore`, `effortScore`, `urgencyScore`, `severity`,
`confidence`, `verificationMetric`, `verificationMethod`, `expectedTimeframeDays`,
and a computed `priorityScore`. `planFinanceActionsFromDiagnosis(diagnosis)` returns
`{ recommendations, actions (ranked), recommendedNextAction, missingActionInputs,
generatedAt }`. Findings without a template are surfaced in `missingActionInputs`
(never invented). Persists nothing; does not alter findings/metrics.

## 4. Priority / ranking behavior

`priorityScore` = Spine `calculateOwnerPriorityScore({ expectedImpactScore,
confidence, urgencyScore, effortScore, severity, survivalRiskScore })`, where
`survivalRiskScore = diagnosis.metrics.financialRiskScore` — so under survival
pressure, existential actions outrank growth actions; high-impact/high-confidence/
low-effort actions rank high; high effort is penalized; invalid/missing values clamp
(fail closed). Actions are ranked by the Spine `rankOwnerActions` (priority desc →
impact → confidence → findingCode → title); `recommendedNextAction` is the top
action. Verified: critical insolvent-runway action outranks a low data-quality
action and is the recommended next action.

## 5. Test results

| Command | Result |
|---|---|
| `npx vitest run src/__tests__/owner-finance/actions.test.ts` | **16 passed** |
| `npx vitest run src/__tests__/owner-finance/diagnosis.test.ts` | 17 passed |
| `npx vitest run src/__tests__/owner-finance/metrics.test.ts` | 21 passed |
| `npx vitest run src/__tests__/owner-spine/contracts.test.ts` | 23 passed |
| `npx vitest run src/__tests__/founder-recovery/` | 38 passed (Module 1 unchanged) |
| `npx eslint` (new files) | clean |
| `git diff --check` | clean |
| `npx prisma validate` | valid 🚀 |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500 — no increase) |
| `npm run build` | Compiled successfully |
| `npm test` (run 1) | 2 failed / 5548 passed — failures in `infra/rate-limiter` and `phase-e/e2-replay-determinism-proof` |
| `npm test` (run 2) | **197 files passed, 0 failed; 5550 passed** |

Coverage (16 tests): margin-improvement, receivables-collection, debt-reduction,
leakage-reduction, data-quality, revenue-quality actions; OwnerActionSchema
conformance; status="proposed" reuses Module 1 vocab; recommendations cite
metric/value/threshold; no invented sourceValue; bounded priority; critical-survival
outranks growth; high-effort lowers priority; deterministic ranking;
recommendedNextAction = first action; clean business → no actions; input
non-mutation.

### Honest note on the run-1 failures (not caused by Slice 4)
Run 1 showed 2 failures in `src/__tests__/infra/rate-limiter.test.ts` and
`src/__tests__/phase-e/e2-replay-determinism-proof.test.ts`. Both **pass 57/57 in
isolation** and run 2 of the full suite was fully green. My change is additive
owner-finance domain code only (does not touch those files). These are pre-existing
**parallel-load timing/performance flakes** (rate-limiter token timing; replay
"consistent performance" wall-clock), distinct from the two I stabilized earlier
(telemetry + confidence-engine). They are **reported, not hidden**, and recommended
for a separate stabilization task (out of Slice 4 scope). Slice 4's own tests and
the sibling suites are green and deterministic.

## 6. No schema/API/UI/migration

Confirmed — pure domain TypeScript only. `prisma/schema.prisma` unchanged (valid);
no migration/routes/pages. Slice 2 formulas and Slice 3 finding logic read-only.

## 7. Module 1 / public-SaaS

Module 1 green (founder-recovery 38 passed; no recovery files touched). Public/SaaS
remains **frozen**.

## 8. Next single action

Execute **Module 2 Slice 5** (persistence schema + manual fail-closed migration)
under explicit authorization — additive Prisma models for finance snapshot/cycle/
finding/action/verification per the Slice 0 decision (no `recovery_*` mutation),
applied only via a manual fail-closed workflow. (Optionally first run a small
stabilization task for the two newly-observed flaky files.)
