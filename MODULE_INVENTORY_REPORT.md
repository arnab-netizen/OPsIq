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
