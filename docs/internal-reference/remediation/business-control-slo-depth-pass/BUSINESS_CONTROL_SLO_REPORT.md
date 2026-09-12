# Business-Control SLOs — Report

**Classification:** `BUSINESS_CONTROL_SLO_REAL_AND_OWNER_VISIBLE`
**Code:** `src/domain/owner-mode/business-control-slo.ts` (pure),
`src/services/owner-mode/business-control-slo.service.ts` (owner-callable), integrated in
`src/services/owner-guidance/owner-now-view.service.ts` (`payload.businessControlHealth` via
`GET /api/owner/now-view`).
**Tests:** `src/__tests__/owner-mode/business-control-slo.test.ts` (13),
`src/__tests__/owner-mode/business-control-slo-simulation.db.test.ts` (4 DB).

## What it answers
"Is OpsIQ's own business-control loop reliable?" — it grades the control system, not the business.

## SLIs (15) and measurability
| SLI | Measurable now? | Source |
|-----|-----------------|--------|
| OWNER_WORKLOAD_BURDEN | ✅ | owner workload budget |
| OWNER_BOTTLENECK | ✅ | constraint engine + workload budget |
| ANTI_GAMING_RISK | ✅ | anti-gaming analytics (top signal severity) |
| EVIDENCE_CREDIBILITY_RISK | ✅ | credibility graph (top concern severity) |
| WEAK_PROOF_REVIEW_RATE | ✅ | proof table (status) |
| PROOF_REVIEW_COMPLETION | ✅ (backlog) | proof table (status + age) |
| CONSTRAINT_FRESHNESS | ✅ | constraint engine |
| PROFIT_LEAK_FRESHNESS | ✅ | profit-leak radar |
| OPPORTUNITY_DECISION_COMPLETENESS | ✅ when a decision is present | opportunity envelope fields |
| NOW_VIEW_SIGNAL_COMPLETENESS | ✅ | now-view signal presence |
| AUDIT_DURABILITY | ❌ NOT_MEASURABLE | needs per-mutation state-change↔audit correlation index (atomic-audit is guaranteed by design, AUDIT-01, but not a runtime rate yet) |
| REASSESSMENT_LATENCY | ❌ NOT_MEASURABLE | needs trigger↔reassessment timestamp linkage |
| SHOCK_HANDLING_LATENCY | ❌ NOT_MEASURABLE | needs shock↔reassessment timestamp linkage |
| STARTUP_VALIDATION_COMPLETENESS | ❌ NOT_MEASURABLE unless Startup Mode active | needs an active startup recommendation |
| CROSS_WORKSPACE_ISOLATION_PROOF | test-backed only | isolation test evidence (not a runtime metric) |

## SLO shape (all 20 required fields)
workspaceId, sloType, sliName, status (PASS/WARN/FAIL/NOT_MEASURABLE), target, actualValue, measurementWindow,
confidence, sourceDataRefs[], missingData[], ownerExplanation, businessImpact, degradedBehavior,
recommendedAction, ownerActionRequired, relatedConstraint, relatedProfitLeak, relatedGamingSignal,
relatedCredibilityConcern, evaluatedAt.

## No fake / always-green metrics
- With no inputs, most SLIs are `NOT_MEASURABLE` (not PASS) — proven by test.
- Every NOT_MEASURABLE carries the **exact missing source**; no fabricated timestamps or linkages.
- A `DATA_INSUFFICIENT` signal counts as *present* for now-view completeness (the pipeline ran with an
  honest data gap) — it is not mislabelled a control failure.

## Integration (no orphan monitoring)
Graded from the SAME signals the now-view already computes + proof counts from the already-fetched proof
rows (no extra query). Exposed via `/api/owner/now-view` (`businessControlHealth`) + owner-callable
`getBusinessControlHealth`. Each SLI links its related constraint/profit-leak/gaming/credibility.

## Owner-visible output
Overall control health + the single top control risk (why it matters, evidence/source, corrective
action, owner-vs-data/system framing, and what's not measurable yet).
