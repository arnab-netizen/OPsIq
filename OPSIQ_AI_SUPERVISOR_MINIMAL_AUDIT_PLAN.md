# OpsIQ AI Supervisor — Minimal-Code Audit + Gap-Closure Plan

Branch: `claude/opsiq-ai-supervisor-minimal-audit`
Base HEAD: `825bf14` (main, after PR #59 merge)
Principle: **audit first, reuse existing systems, add the minimum code, only close proven gaps.** No parallel AI brain. No new supervisor service. No new dashboard wall.

Baseline on this branch: `prisma validate` ✅ · `tsc` 0 ✅ · owner-pilot + max-reliability **231 passed / 6 [db] skipped** ✅.

## 1. Existing AI/rule/hybrid decision paths
- **Owner advice is fully DETERMINISTIC / rule-based — there is NO LLM/model call in the owner runtime** (grep for openai/anthropic/llm/inference in `src/services/owner-mode` + `src/behavioral-validation` returns nothing). "AI supervisor" here = governed deterministic + learning-backed supervision. There is therefore no parallel brain to build, and the prompt's "no parallel AI brain" is satisfied by construction.
- Production runtime: `runOwnerAdvice` (`src/services/owner-mode/owner-advice-runtime.service.ts`) → `buildWholeBusinessPlan` (`src/behavioral-validation/whole-business/whole-plan.ts`, the 25-section `WholeBusinessPlan`) → cross-domain `arbitrate` → `evaluateGrowthGates` → `profitabilityCheck` → `caseDomainHealth` → `inferBusinessStage`.
- Max-reliability supervision gates (already proven, untouched): FMEA, evidence-trace, business-math gate, red-team, source-quality, contradiction/owner-burden, learning-governance, adjudication-queue, assurance/ratchet (`src/behavioral-validation/max-reliability/**`, `expert/ratchet`).
- Structured owner-decision seams: `decideOpportunity` (`opportunity-decision.service.ts` → accept/defer/reject via live capacity + margin, audited) + `/api/owner/opportunities/decide`; `/api/owner/guided-choice`, `/api/owner/arbitrate`, `/api/owner/approvals`, `/api/owner/collective-decision`.

## 2. Where final owner advice is produced
`runOwnerAdvice` → `WholeBusinessPlan` → surfaced by `getOwnerWholeBusinessPlan` (`owner-whole-business-plan.service.ts`, `OwnerWholeBusinessPlanView`) → `GET /api/owner/whole-business-plan` → consumed by the command center page (`src/app/(authenticated)/owner/page.tsx`) and the priority strip / readiness / guidance / action-plan routes (which all read the same runtime).

## 3. Where module output can reach the dashboard
The command center fetches ONLY `/api/owner/*` routes (`command-center`, `control-center`, `whole-business-plan`, `businesses`, `priorities`, `readiness`, `input-guidance`, `action-plan`). Each route is `withCanonicalEnforcement` (OWNER_VIEW) and returns a service view built from the runtime. The priority strip (`command-center-priorities.ts`) returns `[]` when `wbp.found` is false (no static fabrication).

## 4. Can module output bypass final supervision?
No raw per-domain module output is rendered as final owner advice — the dashboard reads the composed runtime view (`getOwnerWholeBusinessPlan`/priorities), which always runs through `runOwnerAdvice` (arbitration + plan). **Gap: this no-bypass property is architecturally true but not yet asserted as an explicit test contract.** (Slice 3.)

## 5. Where assumptions / missing data / confidence are handled
- Confidence: `AdviceOutput.dataConfidence` + `ingestBusinessState().overallConfidence` (`owner-domain-ingestion.ts`) → `view.data.overallConfidence` + `dataSourceMissing`. Owner-pilot input-guidance/onboarding/readiness already expose honest confidence + missing-data (cannot read high while a critical domain is missing).
- **Gap: there is no single owner-visible "assumption ledger" object (known facts / assumptions / missing data / confidence reason / what-would-change) and no explicit action-status taxonomy (proceed / cautious / owner-decision / need-more-data / blocked).** These are derivable from existing signals with a small pure helper. (Slice 4.)

## 6. Where profit / cash / workload impact is handled
Already computed in `WholeBusinessPlan`: `financeCashImpact`, `marginPricingImpact`, `staffTrainingImpact`/`equipmentCapacityImpact` (capacity/workload), `customerReputationImpact` (quality), plus `successMetrics`, `rootCause`, and the rich `AdviceOutput.ownerWorkloadPlan` (ownerDecides / staffExecutes / staffProof / escalationThreshold / nextOwnerTouchpoint / estimatedOwnerReductionPct). The revenue-up/profit-down trap is handled by `profitabilityCheck` + the business-math gate + the `below_margin` arbitration constraint. **Gap: `OwnerWholeBusinessPlanView` DROPS all of these fields at the view boundary — they never reach the owner.** Pure surfacing. (Slice 5.)

## 7. Where owner / delegate / proof / reassessment is handled
Fully present: `ownerApprovalRequired`, `delegatedWork`, `ownerWorkloadOffload`, `opsiqPreparedWork`, `proofRequired`, `reassessmentTriggers`, plus the owner-pilot `action-assignment` (responsible party + proof lifecycle) and the command-center action/proof card. Surfaced already.

## 8. Where owner questions are handled
Partial: structured `decideOpportunity` (accept/defer/reject) + `guided-choice` actions. **There is no natural-language "should I X?" flow.** Building an NL brain is explicitly out of scope (parallel brain). Plan: STAGE a safe owner-question flow honestly on top of the existing structured decision seam + the supervisor summary, and do not claim a full NL flow. The top classification permits an honestly-staged owner-question flow.

## 9. Where dashboard AI assistance exists
Command center renders runtime-fed panels: whole-business-plan section (`wbp-*`), priority strip (`owner-priority-strip`), readiness (`owner-readiness-score`), input-guidance (`owner-input-guidance`), action/proof (`owner-action-plan`), control-center. **Gap: no single concise "OpsIQ Supervisor Summary" panel** (main issue / why / do-now / do-not-do / owner-vs-delegate / proof / missing-data+assumptions / confidence / action-status / reassessment / profit-cash-workload impact, ≤3 priorities). (Slice 6.)

## 10. What is already proven by existing tests
- Production runtime: `behavioral-validation/whole-business/production-runtime.test.ts` (runtime exists, workspace-scoped, learning applied, arbitration, no cross-workspace leakage).
- Max-reliability: `max-reliability/*` + `expert/ratchet` (FMEA, evidence, math, red-team, source, contradiction, learning-governance, adjudication, scorer negative controls).
- Owner-pilot: `owner-mode/pilot-readiness/*` (onboarding, guidance, readiness, action/proof, input paths, priority strip, mobile) + `owner-pilot-surfaces.db.test.ts` + browser specs 13–17.
- Isolation: `owner-business-isolation.db.test.ts`, `domain/workspace/isolation-contracts`.

## 11. Real gaps only (everything else is reuse)
- **G1 — Surfacing:** profit/cash/workload/quality impact + rootCause + successMetrics + owner-workload-plan are computed but dropped from the owner view.
- **G2 — Assumption ledger:** no first-class known-facts/assumptions/missing-data/confidence-reason/what-would-change object.
- **G3 — Action status taxonomy:** no proceed/cautious/owner-decision/need-more-data/blocked disposition surfaced.
- **G4 — Supervisor summary panel:** no single concise ≤3-priority owner-facing supervisor panel.
- **G5 — No-bypass contract:** true but untested as an explicit contract.
- **G6 — Owner question flow:** only structured opportunity decisions exist; NL flow staged honestly.

## 12. Minimum-code closure plan
- **One pure domain module** `src/domain/owner-mode/supervisor-summary.ts`: `buildSupervisorSummary(input)` deriving — from existing view + plan fields ONLY — the assumption ledger (G2), the action-status taxonomy (G3), the impact block (G1, plumbed), the ≤3 top priorities, and the operating cadence (now/today/this-week/reassess/KPI/stop-loss/next-review from existing 7/30/90 + reassessment + successMetrics + escalationThreshold). No new advice, no new business logic, no model.
- **Plumb existing fields** into `OwnerWholeBusinessPlanView` (`impact` + `supervisor` blocks) inside `getOwnerWholeBusinessPlan` — pass the already-computed plan fields through (they are currently discarded).
- **One presentational component** `src/components/owner/SupervisorSummary.tsx` rendered on the command center from the already-fetched `wbp` (no new route → minimal).
- **Owner question flow:** reuse `decideOpportunity` + surface the supervisor summary as the "answer"; document the NL flow as a staged, non-blocking future enhancement.
- **Inventory:** `OPSIQ_AI_SUPERVISOR_INVENTORY.json` enumerating every owner-visible/dashboard advice path with confidence/missing-data + scope, validated by a test.

## 13. Tests required
- `supervisor-summary.test.ts` (pure): assumption ledger present; material missing-data lowers confidence; high-confidence-with-weak-data fails; unmarked material assumption fails; action status never shows blocked/need-more-data as proceed; profit/cash/workload impact appears where relevant; revenue-up/profit-down (below-margin) → not "proceed" + do-not-do present; ≤3 top priorities unless emergency; cadence (now/today/week/reassess/KPI/stop-loss) present.
- `supervisor-inventory.test.ts`: every declared owner-visible/dashboard advice path is inventoried; fails if a high-impact path lacks confidence/missing-data handling or workspace/business scoping.
- `no-bypass.test.ts`: missing runtime output → no card; raw unsafe module output not rendered as final advice; final advice includes confidence + missing-data + owner/delegate/proof/reassessment.
- Component jsdom `supervisor-summary` render (runtime-fed, null when empty, ≤3 priorities, mobile-bounded).
- Browser spec `18-owner-supervisor-summary.spec.ts` (+ mobile) — runtime-fed; no static fallback.
- DB: extend `owner-pilot-surfaces.db.test.ts` (or a sibling) to assert the supervisor view reads real scoped rows.
- No-regression: re-run max-reliability, owner-pilot, isolation, DB suite, browser 13–17.

## 14. What will explicitly NOT be built
- No parallel AI/LLM brain, no model wrapper, no NL "ask anything" parser.
- No new supervisor service or new runtime — reuse `runOwnerAdvice`.
- No new forecasting/simulation engine.
- No second dashboard wall — one compact panel.
- No duplication of max-reliability/FMEA/evidence/math/red-team/learning/ratchet/owner-pilot/DB/browser systems.
- No autonomous high-risk action — AI remains supporting/supervisory; high-risk stays owner-approval-gated.

## Slices / commit boundaries
- **A0** — this plan (no code).
- **A1** — `OPSIQ_AI_SUPERVISOR_INVENTORY.json` + inventory test.
- **A2** — `supervisor-summary.ts` (assumption ledger + action status + impact + cadence) + view plumbing + unit tests.
- **A3** — no-bypass tests.
- **A4** — `SupervisorSummary.tsx` panel + component test + browser spec 18 (+ mobile), executed against local PG + Chromium.
- **A5** — owner-question honest staging note + DB proof + no-regression + reports + classification.
