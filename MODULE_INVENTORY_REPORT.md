# OpsIQ Owner Mode — Module Inventory Report (Stage 0)

Audit-before-implementation gate per the Command-and-Control Gap Closure prompt.
Classifications are derived from a parallel repository audit (6 read-only agents,
ripgrep + file/symbol/test/schema inspection). Per the continuous-build rule,
each implementation slice **re-verifies** the specific module it touches before
coding.

Owner Mode only. No public SaaS / billing / Product Hunt / cross-user learning /
external integration / advanced forecasting work is implied or authorized here.

## Classification legend
ALREADY_EXISTS · PARTIALLY_EXISTS · MISSING · DUPLICATE_RISK ·
CONFLICTS_WITH_CURRENT_ARCHITECTURE · IMPLEMENTED_BUT_NOT_WIRED ·
IMPLEMENTED_BUT_UNPROVEN · IMPLEMENTED_BACKEND_ONLY_UI_MISSING ·
IMPLEMENTED_UI_ONLY_BACKEND_MISSING · IMPLEMENTED_AS_STUB_OR_PLACEHOLDER ·
IMPLEMENTED_BUT_ONLY_MOCK_PROVEN

## Summary matrix

| # | Module | Classification | Highest-value next action |
|---|---|---|---|
| 0 | Capability Inventory | THIS REPORT (complete) | — |
| 1 | BusinessImpactAssessment | IMPLEMENTED_BUT_NOT_WIRED | Persist + wire into recommendation promotion gate |
| 2 | Input Quality & Evidence Confidence Gate | IMPLEMENTED_BUT_ONLY_MOCK_PROVEN | Extend gate from diagnosis-only to recommendation promotion |
| 3 | Recommendation Confidence Gate | IMPLEMENTED_BUT_NOT_WIRED | Wire confidence classes into promotion; persist score |
| 4 | Finance Truth | ALREADY_EXISTS | None (owner-finance domain proven w/ DB tests, routes, UI) |
| 5 | Cash Flow Survival | ALREADY_EXISTS | None (owner-cashflow domain proven) |
| 6 | Unit Economics & Pricing | PARTIALLY_EXISTS | Per-service/segment economics + persistence + wire to sales snapshot |
| 7 | Lean Profitability & Workload Guardrail | PARTIALLY_EXISTS | Add classification enum + missing scoring dims |
| 8 | Employee Workload Model | PARTIALLY_EXISTS | Add utilization bands + shift/travel/rework workload model |
| 9 | Owner Workload Protection | MISSING | Build owner-load + delegation-path model (detector exists) |
| 10 | Capacity & Bottleneck | PARTIALLY_EXISTS | Add revenueCeiling/growthCapacity/expansionTrigger outputs |
| 11 | False Lean Detector | PARTIALLY_EXISTS | Centralize FalseLean classification + missing detectors |
| 12 | SOP-Linked Action Object | ALREADY_EXISTS | None (OwnerSopAction + workflow-library proven) |
| 13 | Role Accountability & RACI | IMPLEMENTED_BUT_UNPROVEN | Formalize RACI enum/assignment + tests |
| 14 | SOP & Process Control | ALREADY_EXISTS | None (48 templates, proof/escalation wired) |
| 15 | Quality Economics | MISSING | Build complaint/rework/refund/damage cost models |
| 16 | Operating Cadence | PARTIALLY_EXISTS | Cadence scheduling + persisted briefing records |
| 17 | Customer Profitability | PARTIALLY_EXISTS | Persist CLV/segment + complaint-rate per customer |
| 18 | Customer Acquisition & Sales Funnel | PARTIALLY_EXISTS | Add CAC + SalesStage enum to owner-sales |
| 19 | Marketing Experiment Ledger | PARTIALLY_EXISTS | Persist Experiment + measurementWindow enforcement |
| 20 | Retention & Win-back | PARTIALLY_EXISTS | Persist retention + winback/referral triggers |
| 21 | Growth Readiness Gate | MISSING | Build gate over survival/capacity (field exists, no gate) |
| 22 | Scale Readiness Gate | MISSING | Build scale-readiness gate |
| 23 | Supplier & Inventory Control | MISSING | Build supplier/stock/reorder/PO models |
| 24 | Business Risk & Compliance Guardrail | PARTIALLY_EXISTS | Centralize compliance rules + PROFESSIONAL_REVIEW route |
| 25 | Business Continuity & Emergency | MISSING | Build continuity/emergency model |
| 26 | Data Sensitivity, Privacy & Access Control | PARTIALLY_EXISTS | Add sensitivity classification policy + PAYROLL_SENSITIVE |
| 27 | Outcome Causality Review | IMPLEMENTED_BUT_UNPROVEN | Persist causality/confounder review + end-to-end test |
| 28 | Adversarial Business Simulation Pack | PARTIALLY_EXISTS | Add discount-trap / B2B-trap / false-lean cases |
| 29 | Archetype Registry | ALREADY_EXISTS | None |
| 30 | Laundry Operating Pack | ALREADY_EXISTS | None |
| 31 | Housekeeping Operating Pack | ALREADY_EXISTS | None |
| 32 | Local Home Services / Maintenance Pack | MISSING | Build LOCAL_SERVICES_PACK_SLOTS following M30/31 |
| 33 | Owner Command Center | IMPLEMENTED_BUT_NOT_WIRED | Verify all per-domain modules wired into aggregator |
| 34 | Negative Recommendation Engine | MISSING | Build "what to avoid/stop" engine |
| 35 | Action WIP Limit | IMPLEMENTED_BUT_UNPROVEN | Add per-workspace in-progress action cap + proof |
| 36 | Alternative Comparison | MISSING | Persist rejected alternatives per recommendation |
| 37 | Time-Horizon Trade-off | PARTIALLY_EXISTS | Per-recommendation 7d/30d/90d/6m trade-off output |
| 38 | Manual / CSV / Document Input Pack | ALREADY_EXISTS | None (owner-intake proven) |
| 39 | Integration Readiness Layer | IMPLEMENTED_AS_STUB_OR_PLACEHOLDER | Out of Owner-Mode scope; defer (touches external integrations) |
| 40 | Public Scope Freeze Guard | IMPLEMENTED_BUT_NOT_WIRED | Centralized guard asserting no public/billing mutation in Owner Mode |

## Key evidence per module (audit-derived; re-verified at slice time)

### Stage 1 — Stop bad recommendations (highest priority)
- **M1 BusinessImpactAssessment** — `src/domain/business-impact/business-impact-engine.ts` (`assessBusinessImpact`, `calculateROI`, `BusinessImpactAssessmentSchema`) + `src/services/business-impact/business-impact.service.ts` (`generateBusinessImpact`). Unit tests only; **no Prisma persistence**; **not called from the recommendation promotion path**. UI read views exist under `engagements/[id]/business-impact`. Missing dims vs spec: cashImpact/unitEconomicsImpact/staff+owner workload/capacity/quality/customer/riskCompliance/timeHorizons/rejectedAlternatives/rollbackTrigger/leanClassification are not all first-class. → Persist + wire a promotion gate.
- **M2 Input Quality & Evidence Confidence** — `src/domain/owner-mode/input-quality.ts` (`assessInputQuality`, `assertAllowsStrongRecommendation`, `assertAllowsHighRiskAction`) + Prisma `OwnerInputQualityAssessment`, `OwnerDataProvenanceRecord`, `OwnerMissingDataFlag`. Wired into **diagnosis** (`diagnosis-evidence.ts`) but **not** recommendation promotion. Workspace-scoped. → Extend to promotion path.
- **M3 Recommendation Confidence** — `src/domain/decision-confidence/confidence-engine.ts` (`generateDecisionConfidenceScore`, `determineConfidenceLevel`, `determineRecommendationStrength`). Rich unit tests; **no persistence; not wired**; `Recommendation.confidenceLevel` field exists but unset by this engine. → Persist + wire promotion classification (incl. INSUFFICIENT_DATA / BLOCKED_UNSAFE / REQUIRES_*_REVIEW).

### Stage 2 — Financial truth
- **M4/M5 ALREADY_EXIST** — `src/domain/owner-finance/*` (metrics: grossMargin, netMargin, breakEven, debtServicePressure, profitPerOrder, leakage) + `src/domain/owner-cashflow/*` (cashRunwayDays, obligations, CashflowState SAFE/WATCH/AT_RISK/CRITICAL/INSOLVENT_RISK). Prisma `OwnerFinancialSnapshot`/`OwnerCashflow*` with `[db]` tests, routes, and owner UI pages. **Do not rebuild.**
- **M6 Unit Economics** — `src/services/growth/unit-economics-engine.ts` (CAC/LTV/payback). **Not persisted**, no per-service/per-segment economics, no owner UI, DUPLICATE_RISK with `OwnerSalesSnapshot`. → Build per-service/segment + wire.

### Stage 3 — Lean / workload / capacity
- **M7/M10/M11 PARTIAL** — capacity gating exists (`src/domain/execution/operational-capacity.ts` CapacityStatus GREEN/YELLOW/RED, `capacity.ts` OwnerCapacity, `services/execution-core/capacity-controller.ts`, `services/diagnostic-core/bottleneck-engine.ts`); progression engine blocks unsafe growth (`progression-engine.ts`). Missing: unified Lean classification enum (LEAN_APPROVED/…/FALSE_LEAN_REJECTED), several scoring dims, structured false-lean detectors, capacity ceiling outputs.
- **M8 Employee Workload PARTIAL** — `owner-operations` metrics (idleRate, capacityUtilization) + employee-lifecycle. Missing utilization bands + shift/travel/rework model.
- **M9 Owner Workload MISSING** — only `services/reality-awareness/bottleneck-detector.ts` + `reality/human-factors-model.ts` (owner_bottleneck factor). No owner-load/delegation-path model.

### Stages 4–8 (modules 12–40)
See the summary matrix. Notable ALREADY_EXISTS: M12/M14 (SOP), M29/30/31 (archetype + laundry + housekeeping packs), M38 (CSV/intake). Notable MISSING: M15 (quality economics), M21/22 (growth/scale readiness gates), M23 (supplier/inventory), M25 (continuity), M32 (home-services pack), M34 (negative recommendations), M36 (alternative comparison). PARTIAL: M16/17/18/19/20/24/26/28/37. UNPROVEN: M13/27/35. Out-of-scope/defer: M39 (integration readiness — touches external integrations, frozen). M40 (public scope freeze guard) — IMPLEMENTED_BUT_NOT_WIRED; high value as a safety guard.

## Conflict / duplication warnings
- Do **not** create new finance/cashflow engines (M4/M5 own that domain).
- M1/M3 must **reuse** the existing business-impact and confidence engines — wire + persist, do not re-derive scoring.
- M6 must consume `OwnerSalesSnapshot` rather than create a divergent economics source.
- M11 must consume the existing progression-engine + finance/operations findings, not re-detect in parallel.

## Implementation order (per prompt §2/§6)
Stage 1 first (M1 → M2 → M3), then Stage 2 (M6), then Stage 3 (M7–M11), then 12+.
No growth module (18–22) before finance/cash/unit-economics/workload/capacity gates exist.
No UI before the business-control engine exists. No public SaaS/billing.

## Completion gate
This report classifies modules 0–40. Implementation may now begin with the
highest-priority partial/missing module in Stage 1: **Module 1 —
BusinessImpactAssessment** (persist + wire the promotion gate), re-verifying its
exact current state before coding.

## BUILD PROGRESS — completed slices (Owner Mode command-and-control)
All slices below are additive and gated by the per-workspace opt-in flag
`ClientAccount.requireBusinessImpactAssessment` (default **off** → zero regression
to the existing suite). The single promotion chokepoint is
`updateRecommendationStatus` in `src/services/recommendation.ts` (the
`status === "approved"` block), which calls the M1→M5 enforcers in order.

### Stage 1 — decision integrity (PROMOTION-GATING, wired + CI-proven)
- **M1 Business Impact** — FULLY_IMPLEMENTED, WIRED. `domain/business-impact/*`
  (`recommendation-business-impact.ts` gate, `business-impact-composer.ts`),
  `services/business-impact/*` (persist + `enforceBusinessImpactIfRequired`),
  Prisma `RecommendationBusinessImpact` + migration. Fail-closed.
- **M2 Input Quality / Evidence Confidence** — FULLY_IMPLEMENTED, WIRED.
  `domain/owner-mode/recommendation-input-quality-gate.ts` +
  `services/owner-mode/recommendation-input-quality.service.ts`.
- **M3 Decision Confidence** — FULLY_IMPLEMENTED, WIRED.
  `domain/decision-confidence/*` + `services/decision-confidence/*` (composes
  M1 evidence + M2 input-quality + finding compliance).

### Stage 2 — finance survival (PROMOTION-GATING, wired + CI/DB-proven)
- **M4 Finance Truth + M5 Cash Flow Survival** — FULLY_IMPLEMENTED, WIRED.
  `domain/owner-finance/cash-safety-gate.ts` +
  `services/owner-finance/recommendation-cash-safety.service.ts` reads latest
  `ownerCashflowCycle.cashflowState` / `ownerFinanceCycle.survivalState`
  (shared `SAFE|WATCH|AT_RISK|CRITICAL|INSOLVENT_RISK` scale). Growth blocked at
  AT_RISK+, finance/pricing/hiring at CRITICAL+, all at INSOLVENT_RISK. Missing
  cycle → AT_RISK (growth fail-closed).
- **M6 Per-service / Unit Economics** — FULLY_IMPLEMENTED, PERSISTED.
  `domain/owner-finance/unit-economics.ts` +
  `services/owner-finance/service-economics.service.ts`
  (Prisma `OwnerServiceEconomics` + migration, `[db]` test CI-proven).

### Stage 3 — workload / capacity / lean (wired into M1 via the ops bridge)
- **M7 Lean Guardrail, M11 False-Lean Detector** — `domain/execution/lean-guardrail.ts`,
  `false-lean-detector.ts` (shared `LeanClassification` enum, no duplication).
- **M8 Employee Workload** — `domain/execution/employee-workload.ts` +
  `services/owner-operations/employee-workload-snapshot.service.ts`
  (`OwnerEmployeeWorkloadSnapshot` + migration, `[db]` test CI-proven).
- **M9 Owner Workload** — `domain/execution/owner-workload.ts` +
  `services/owner-operations/owner-workload-snapshot.service.ts`
  (`OwnerWorkloadSnapshot` + migration).
- **M10 Capacity Ceiling / Bottleneck** — `domain/execution/capacity-ceiling.ts` +
  `services/owner-operations/capacity-snapshot.service.ts`
  (`OwnerCapacitySnapshot`, JSONB resources, + migration).
- **Bridge:** `domain/business-impact/business-impact-from-ops.ts`
  (`composeBusinessImpactFromOps`) maps the M7–M11 operational-safety verdict into
  the M1 workload/capacity dimensions + proposed lean classification, so ops risk
  flows through the M1 promotion gate (safety can only tighten).

### Stages 4+ — governance cores (advisory inputs / guards)
- **M13 Role Accountability / RACI** — `domain/workspace/raci.ts`
  (exactly one ACCOUNTABLE + ≥1 RESPONSIBLE).
- **M15 Quality Economics (CoPQ)** — `domain/execution/quality-economics.ts`.
- **M16 Operating Cadence** — `domain/execution/operating-cadence.ts`
  (clock injected; no `Date.now()`).
- **M17 Customer Profitability** — `domain/execution/customer-profitability.ts`.
- **M21 Growth Readiness Gate** — `domain/execution/growth-readiness.ts`
  (delegates to the proven progression engine; no parallel growth engine).
- **M22 Scale Readiness Gate** — `domain/execution/scale-readiness.ts`
  (builds on M21 + management-layer + repeatable-ops prerequisites).
- **M23 Supplier & Inventory Control** — `domain/execution/supplier-inventory.ts`
  (reorder point, days-of-cover, stockout risk, supplier reliability, PO suggestion).

Public scope remains frozen throughout: no SaaS, billing, external integrations,
cross-user learning, advanced forecasting, or launch work was added.

## BUILD PROGRESS — Modules 12–40 pass
Audit-first per module; existing modules reused (not duplicated). All new cores are
pure, deterministic (no `Date.now()`/`Math.random()`), with unit + adversarial tests.

### Already implemented — SKIPPED with evidence (no duplication)
- **M12 SOP-Linked Action Object** — `domain/execution/sop.ts` + `domain/owner-sop/*`.
- **M14 SOP & Process Control** — `domain/execution/sop.ts`, `domain/owner-sop/*`.
- **M18 Customer Acquisition & Sales Funnel** — `domain/owner-sales/*` (leads,
  qualifiedLeads, leadToSaleConversionPct, acquisitionPerDay, funnel metrics).
- **M19 Marketing Experiment Ledger** — `domain/experiment/experiment.ts`
  (hypothesis/rigor/status lifecycle) + `domain/owner-marketing/*`.
- **M20 Retention & Win-back** — `domain/growth/growth-engines.ts` (retention/churn).
- **M24 Business Risk & Compliance Guardrail** — `domain/owner-mode/*`
  (harm-tracking, failure-adjudication, security-rules) + `domain/governance/*`.
- **M26 Data Sensitivity / Privacy / Access Control** — `domain/workspace/access-policies.ts`,
  `domain/workspace/dashboard-access.ts`, `domain/private-mode/role-config.ts`,
  `domain/audit-export/audit-export-packet.ts`.
- **M28 Adversarial Business Simulation Pack** — `domain/scenario/*`,
  `domain/execution/trial-pack.ts`, `domain/execution/dry-run-diagnosis.ts`.
- **M29 Archetype Registry / M30 Laundry Pack / M31 Housekeeping Pack** —
  `domain/execution/archetype-packs.ts`.
- **M36 Alternative Comparison** — `domain/decision/best-path-selection.ts`
  (dominance proof across alternatives, rejected-path reasons).
- **M38 Manual / CSV / Document Input Pack** — `domain/data-intake/*`,
  `domain/file-intake/*`, `domain/data-parsers/*`.

### Newly implemented cores (pure domain, unit + adversarial tests)
- **M25 Business Continuity & Emergency** — `domain/execution/business-continuity.ts`
  (`assessContinuityThreat`, `keyPersonRisk`, `emergencyReserveAdequacy`,
  `prioritizeContinuityActions`, `assertContinuityReviewed`/`ContinuityRiskError`). 28 tests.
- **M27 Outcome Causality Review** — `domain/execution/outcome-causality.ts`
  (`assessCausality` CAUSAL_LIKELY/PLAUSIBLE/INSUFFICIENT/SPURIOUS_RISK,
  `observedEffectSize`, `shouldCreditAction`, `assertCausalBeforeLearning` —
  guards the learning loop against false attribution). 23 tests.
- **M32 Local Home Services / Maintenance Operating Pack** —
  `domain/execution/home-services-pack.ts` (`HOME_SERVICES_PACK_SLOTS`,
  `createHomeServicesPack`, `assessDispatchEfficiency`, `firstTimeFixRate`;
  reuses `createArchetypePack`/`assessPackConfidence`). 11 tests.
- **M34 Negative Recommendation Engine** — `domain/execution/negative-recommendation.ts`
  (do-not / stop / avoid-escalation / reverse; ADVISORY/STRONG/BLOCKING,
  `rankNegativeRecommendations`, `assertNoBlockingNegative`). 11 tests.
- **M35 Action WIP Limit** — `domain/execution/action-wip-limit.ts`
  (`defaultWipPolicy`, `evaluateWipAdmission`, `wipUtilization`, `wipPressureBand`,
  `assertWipAdmissible` — prevents owner overload / too many in-flight actions). 15 tests.
- **M37 Time-Horizon Trade-off** — `domain/execution/time-horizon.ts`
  (`horizonFromDays`, `assessTimeHorizonTradeoff` PROCEED/DEFER_UNTIL_STABLE/REJECT,
  `benefitCostRatio`, `assertHorizonAffordable` — survival pressure defers long-payoff). 20 tests.
- **M40 Public Scope Freeze Guard** — `domain/execution/public-scope-freeze.ts`
  (`FrozenScopeArea`, `classifyScope`, `isOwnerModeAllowed`, `assertWithinOwnerScope`/
  `PublicScopeFrozenError` — single chokepoint blocking SaaS/billing/launch/cross-user/
  integrations/forecasting). 23 tests.

- **M33 Owner Command Center** — `domain/execution/owner-command-center.ts`
  (pure aggregation core, no UI/real-time layer): `composeCommandCenter` orders
  pre-computed module signals into a priority-ranked attention list,
  `CommandCenterStatus` (STABLE/NEEDS_ATTENTION/ACTION_REQUIRED/CRISIS),
  `topPrioritySignal`, `commandCenterRequiresOwnerAction`. Defines the minimal
  forward contracts `BusinessFunction` + `CommandCenterSignal` that Module 41 will
  reuse (permitted by the build rule); Module 41 itself remains NOT started. 14 tests.

### Deferred (frozen scope)
- **M39 Integration Readiness Layer** — DEFERRED. Touches external integrations,
  which are explicitly frozen in Owner Mode. No work done; recorded as out-of-scope.

145 new unit/adversarial tests added (all green); full typecheck clean; lint clean.

## MODULE 41 — Real-Time 360° Owner Guidance Layer
Implemented as pure domain cores under `src/domain/owner-guidance/` that ORCHESTRATE
the command-and-control modules (M1–M40) — they do not replace finance, cash, unit-
economics, workload, capacity, SOP, quality, customer, supplier, risk, or learning
logic. 102 owner-guidance tests (unit + adversarial), typecheck + lint clean.

- **business-function.ts** — canonical 27-value `BusinessFunction` enum (360° coverage);
  `assertBusinessFunction` (every recommendation/action/command-center item/avoid must
  map to ≥1 function); `requiresProfessionalReview` (compliance/payroll). M33 command
  center now re-exports this single vocabulary.
- **guidance-classification.ts** — the 9 `GUIDANCE_*` terminal states + actionability helpers.
- **guidance-object.ts** — step-by-step `GuidanceObject` contract + `validateGuidanceObject`
  hard rules (workspaceId, businessFunction, reasonNow, exactStep, proof-or-reason,
  employee-facing boundary validation, professional-review for compliance/payroll, owner
  approval for high-risk, weak-confidence-emergency guard). Reuses ProofType /
  EvidenceConfidenceLevel / BoundaryValidationStatus.
- **issue-priority.ts** — canonical 10-tier priority (cash > customer/service > overload >
  profit > capacity > compliance > blocked > proof/outcome > growth > process);
  `rankIssues`, `topIssues` (≤3 unless emergency).
- **next-best-step.ts** — `deriveActionsToAvoid` (risk → forbidden moves) +
  `selectNextBestSteps` (top owner actions + avoids + emergency flag).
- **generic-output-guard.ts** — rejects "improve marketing"/"reduce costs"/etc unless
  backed by concrete context+reason+role+step+proof+outcome+risk (8-flag specificity).
- **change-detection.ts** — 15 `ChangeCategory` deltas between business-state snapshots
  with owner alerts (cash worsened, complaints up, overload up, outcome check due,
  growth-readiness downgrade with old→new reason).
- **beginner-mode.ts** — plain-language explanation (why it matters, if ignored, do-first,
  do-not, proof, how to verify), jargon replacement, weak-data confidence cap,
  professional-review warning.
- **guidance-orchestrator.ts** — `buildOwnerNowView` real-time loop: classify data quality
  + cap confidence → rank risks → remove growth from top actions until gates pass →
  top-3 actions + actions-to-avoid → per-function status surface → terminal
  GuidanceClassification. 10 required adversarial simulations all pass.

### M41 user-facing wiring (live runtime)
- **Route:** `GET /api/owner/now-view?businessId=...` (`src/app/api/owner/now-view/route.ts`)
  — `withCanonicalEnforcement` with `CAPABILITIES.OWNER_VIEW` + `requireWorkspace`;
  workspace-scoped (never client-supplied).
- **Service:** `src/services/owner-guidance/owner-now-view.service.ts` —
  `assembleGuidanceContext` builds a live `GuidanceContext` from M4/M5 cash & finance
  cycles, M8 employee + M9 owner workload, M10 capacity snapshots; `getOwnerNowView`
  runs the orchestrator, diffs against the previous persisted snapshot for "what
  changed", builds beginner explanation + concrete step-by-step guidance, persists.
- **Persistence:** additive `OwnerGuidanceSnapshot` Prisma model + idempotent migration
  `20260626140000_owner_guidance_snapshots` (no FK; mirrors owner_*_snapshots). Stores
  the comparable state for change-detection + full payload. `[db]` test proves
  round-trip + workspace isolation on the Postgres CI lane.
- **UI:** `src/app/(authenticated)/owner/now/page.tsx` — minimal client surface
  (follows the existing `/owner` command-center fetch pattern): status badges, top-3
  actions with proof/role/deadline/rollback, actions-to-avoid, what-changed, missing
  data, beginner explanation. No business/permission logic in the page.
- **Tests:** route contract (capability + workspace isolation + businessId parsing),
  service unit (DI, live assembly + change detection + persistence), `[db]` persistence.

Classification: MODULE_41_USER_FACING_READY (route + live service + persistence + UI,
all tested; `[db]` proof on the Postgres CI lane). Public scope frozen:
no SaaS/billing/launch/cross-user/integrations/forecasting; near-real-time via
refresh/event recompute only — no autonomous high-risk execution.
