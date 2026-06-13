# Module 4 — Operations & Productivity Intelligence — SPEC

Status: **PLANNED / first build slice = deterministic engine.** Grounded in
execution.md §11 (Module 4) + §22 Phase 5. Reuses the Owner Intelligence Spine and
the proven Module 2/3/5 build pattern (engine → detector → planner →
persistence/migration → API → UI + command-center → runtime proof → audit).
Operations is an **execution** domain (`EXECUTION_DOMAINS = ["operations","sop"]`),
so its risk feeds the command center's `executionRiskScore` (bottleneck/throughput
reliability), not survival risk. Module 1/2/3/5 untouched. No public/SaaS.

## 1. Purpose / owner value (execution.md §11)

Answer: can the business handle current demand, where is work delayed, which
staff/process underperforms, is quality leaking profit, what must improve today —
and surface the single highest-impact operations action with verification.

## 2. Inputs (OperationsSnapshotInput; execution.md §11.1)

period + currency + businessModel/industryTemplate, plus (all nullable):
`ordersReceived`, `ordersCompleted`, `ordersDelayed`, `reworkCount`, `complaints`,
`staffHours`, `machineCapacityUnits` (equipment capacity per period),
`deliveryAttempts`, `deliveryFailures`, `inventoryShortages`, `sopChecks`,
`sopMisses`, `idleHours`. Missing = missing (never invented).

## 3. Derived metrics (§11.2; `number | null` when not computable)

`completionRatePct`, `delayRatePct`, `reworkRatePct`, `complaintRatePct`,
`capacityUtilizationPct` (received ÷ capacity), `ordersPerStaffHour`,
`deliverySuccessRatePct`, `sopCompliancePct`, `idleRatePct`,
`inventoryShortageCount`. Composite (0..100): `operationsHealthScore`,
`operationsRiskScore`, `operationsOpportunityScore`, `dataConfidenceScore`. State:
`SMOOTH/STEADY/STRAINED/BOTTLENECKED/OVERLOADED`.

## 4. Risk rules (§11.3 — Slice: detector, next)

capacity bottleneck (utilization over ceiling) · staff productivity / idle issue ·
quality leakage (rework/complaint) · high rework · delivery bottleneck · SOP
non-compliance · low completion / high delay · inventory constraint · missing data.

## 5. Opportunity rules (next slice)

recover delayed throughput · cut rework · reclaim idle capacity · close the SOP
gap · use spare capacity headroom for more orders. Emitted only when supporting
inputs exist.

## 6. Spine integration

Emits a `DomainScore` (domain `operations`) + `OwnerFinding`/`OwnerAction`s, so the
command center becomes finance + recovery + cashflow + sales + **operations**
(reusing `buildBusinessConditionProfile` + `rankOwnerActions`). As an execution
domain, operations risk drives `executionRiskScore`. Verification reuses the shared
`verifyOutcome`.

## 7. Persistence / API / UI (later slices)

Additive `owner_operations_*` tables via a manual fail-closed migration;
`/api/owner/operations/*` routes (canonical enforcement, OWNER_VIEW/MANAGE,
workspace-scoped); `/owner/operations` UI; deployed runtime proof. No existing
table mutated.

## 8. Slice plan (mirrors Modules 3/5)

1. **Engine** (this slice) — deterministic metrics + health/risk/opportunity +
   data-confidence + state. Pure, no DB. ← building now
2. Detector (risk/opportunity `OwnerFinding[]`).
3. Recommendation/action planner (`OwnerAction[]`).
4. Persistence schema + manual migration (stop for manual run).
5. API + services.
6. UI + command-center integration.
7. Deployed runtime proof (stop for manual run).
8. Audit + proof.

## 9. Non-goals / honesty

Deterministic (no LLM); missing data marked missing; generic for any
owner-operated business; per-stage/per-staff timing detail needs itemized intake
(Module 10 connectors) — v1 works on aggregate period inputs and emits prioritized
*actions*, not per-stage timelines.
