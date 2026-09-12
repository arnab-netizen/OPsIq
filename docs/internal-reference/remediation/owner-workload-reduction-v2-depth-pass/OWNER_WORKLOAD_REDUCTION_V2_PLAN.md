# Owner Workload Reduction v2 — PLAN

## Objective
Actively identify avoidable owner burden and recommend delegation / policy / better-proof / checklist /
data-collection / training — instead of routing everything to the owner — without weakening control of
material (money/staff/legal/reputation) decisions.

## Approach (derived, backfill-safe)
Pure `buildOwnerWorkloadReduction(signals, ...)` over the already-derived findings/corrections/training +
counted burden scalars (adjudication total, weak-proof count, owner-bottleneck items). `deriveWorkloadSignals`
in the now-view maps analyses→signals and flags owner-approval corrections high-risk by impact type. No schema.
Surfaced as `ownerWorkloadReduction` + an executive-cockpit `OwnerWorkloadReductionPanel`.

## Governance
High-risk stays owner-gated (KEEP_OWNER_APPROVAL). No guessed time saving (touch counts only when counted).
Risk guardrail on every finding. No fraud/negligence/firing/payroll/discipline; no hidden score.

## UI (Executive Cockpit standard)
Top avoidable burden only by default; owner action first, impact second, evidence collapsed; extra items
behind a summary. No owner overload.

## Tests
14 domain + 5 component + 2 page + laundry DB sim (wired into db-verification LANE_B/LANE_A).

## Out of scope
Approval Threshold / Auto-Action Policy (next pass); Cash/Profit Protection; External Opportunity
Intelligence; public SaaS; billing.
