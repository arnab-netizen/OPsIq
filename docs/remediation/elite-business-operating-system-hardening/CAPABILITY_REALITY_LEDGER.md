# Capability Reality Ledger

**Date:** 2026-07-04 · **Branch:** `claude/elite-business-operating-system-hardening` ·
**Base (main):** `be62a606`.

Honest classification of every elite-system capability named in the prompt, against what is actually
wired, DB-backed, integrated, tested, and owner-visible **on this branch**. This pass used
**depth over breadth**: one priority-1 capability (Owner Workload Budget) was implemented to the full
standard; the rest are classified against pre-existing implementations without fabricating new stubs.

| Capability | Classification | Basis |
|-----------|----------------|-------|
| **Owner Workload Budget** | `REAL_AND_OWNER_VISIBLE` | **New this pass.** `computeOwnerWorkloadBudget` (pure) groups related alerts, suppresses LOW noise, separates owner-only vs delegable, flags owner bottleneck, estimates owner minutes + minutes saved. Wired into the live `getOwnerNowView` from the real `BusinessIssue[]` + DB counts (proofs in `NEEDS_HUMAN_REVIEW`, pending reassessments), surfaced via `/api/owner/now-view`. 7 unit tests + a DB test proving real proof-review counting + workspace isolation. |
| Owner Now View / command center | `REAL_AND_OWNER_VISIBLE` | Pre-existing live aggregation (`owner-now-view.service.ts`) over cash/finance/complaints/rework/churn/supplier/proof/outcome/capacity/overload → prioritized `topOwnerActions`, `actionsToAvoid`, missing-data requests, per-function status. Now also carries the workload budget. |
| Opportunity / Wealth engine (decision envelope) | `REAL_API_ONLY` → owner-callable | `decideOpportunity` + `buildOpportunityEnvelope` (prior pass, now on main): live capacity/margin screen + full owner-decision envelope (confidence, missing-data, cash impact, owner-approval gate, first-test action, success metric, stop-loss, reassessment trigger). Exposed at `/api/owner/opportunities/decide`. Tested. UI surfacing is the remaining gap. |
| Constraint / bottleneck signals | `REAL_BACKEND_ONLY` (partial) | The now-view issue pipeline already detects capacity bottleneck, overload (staff/owner), supplier, margin, churn — a de-facto constraint surface. A dedicated typed Constraint Engine with the full 14-type taxonomy is **not** built this pass → classified `PARTIAL`, not claimed. |
| Profit leak signals | `REAL_BACKEND_ONLY` (partial) | Margin/discount/churn/rework/complaint signals exist in the now-view + finance guardrails (margin floor, discount approval). A dedicated Profit Leak Radar object with the full leak taxonomy + estimated-impact tiers is **not** built this pass → `PARTIAL`. |
| Startup validated learning controller | `REAL_AND_OWNER_VISIBLE` | Pre-existing: intake, constraints, risk-adjusted scoring, startup cost, break-even, capital sufficiency + survival runway, compliance-confidence `LOCAL_VERIFICATION_REQUIRED` flag, validation-first gate (`planLaunch` throws unless validated), 30/60/90 plan, kill/pivot. Tested under owner-strategy. |
| Anti-gaming | `REAL_AND_OWNER_VISIBLE` (proof layer) | Proof precheck (EVID-01) screens tamper/format/reuse; SoD blocks self-review; completion gate requires human-ACCEPTED, non-duplicate, fresh proof. A cross-event *analytics* layer (repeated-weak-proof-by-staff patterns) is **not** built this pass → analytics classified `PARTIAL`. |
| Reassessment | `REAL_AND_OWNER_VISIBLE` | REEVAL-01: 9 triggers wired; engine updates business condition / intervention mode / phase / priorities / cadence / health and writes `CONDITION_CHANGED`. Usefulness-quality hardening beyond current is a follow-up. |
| Evidence credibility graph | `MISSING` (this pass) | Not built. Classified honestly. |
| Business-control SLOs | `MISSING` (this pass) | Not built as a metric layer. Classified honestly. |
| Process intelligence / mining | `MISSING` (this pass) | Not built. Classified honestly. |
| AI abstention / agent safety gate | `BLOCKED_BY_OWNER_DECISION` | No LLM write-path is active (the diagnosis/opportunity/startup engines are deterministic rules). The gate is intentionally deferred until an LLM write path exists; see prior AI-02 classification. |

## Rule applied
Nothing above is called "closed/ready" unless it is wired + DB-backed/verified + integrated + tested +
(if business-outcome) owner-visible. Capabilities not built this pass are marked `MISSING`/`PARTIAL`,
not stubbed.
