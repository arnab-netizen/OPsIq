# Dynamic Budget — Signal & Integration Map

## Budget signals emitted (Section 30)

Defined in `src/domain/owner-budget/types.ts` (`BudgetSignalType`) and produced by
`composeUpdatedPlan` (`UpdatedOwnerPlan.signals`). Each carries severity + message.

| Signal | Emitted when |
|---|---|
| statutory_reserve_breach | cash below required statutory/cash reserve |
| cash_runway_risk | runway < 45d (CRITICAL < 14d) |
| profit_guardrail_breach | net margin < target (HIGH if < 0) |
| unit_economics_negative | unit economics explicitly negative |
| growth_budget_available | a growth line is funded within guardrails |
| growth_budget_blocked | a growth line is blocked/deferred by mode/confidence |
| scale_budget_ready | a scale line clears readiness + confidence gates |
| scale_budget_blocked | a scale line is blocked until readiness/confidence proven |
| updated_plan_ready | a new plan was produced (always) |

Additional signal types are reserved in `BudgetSignalType` for spend-proof,
reconciliation, revenue-leakage, manager-violation, approval-bypass, vendor-control,
and owner-override events (emitted by the spend-governance/override paths as those
surfaces are wired; see Implementation Status for current coverage).

## Cross-module integration (reuse, not duplicate)

| Direction | Mechanism | Status |
|---|---|---|
| Finance → Budget | reads latest `OwnerFinancialSnapshot` via `rowToFinanceInput` | WIRED |
| Budget → Collective engine | maps state to `DomainSignalInput[]` → `runCollective` for "what not to do" / sequencing | WIRED |
| Budget → Audit ledger | `emitAuditEvent` on every mutation + reassessment (hash-chained) | WIRED |
| Budget → Owner guidance | `getBudgetGuidance` adapter (mode, top risk, next action, confidence, pending decisions, signals, actions) | WIRED |
| Budget → Actions | `UpdatedOwnerPlan.generatedActions` (typed budget actions with role/proof/review/killRule) | WIRED (plan-level); deeper `services/action.ts` linkage = PARTIAL |
| Budget → Proof/Evidence | spend `proofStatus` lifecycle feeds confidence/governance | WIRED at service; full proof-object linkage = PARTIAL |
| Operations/Sales/Marketing → Budget | capacity/CAC/ROI signals accepted as `BudgetAssessmentInput` fields | INTERFACE READY; live snapshot wiring = PARTIAL |

## Collective domain mapping (budget → 24-domain engine)

| Budget signal | DomainKey |
|---|---|
| cash runway / reserve | cash-survival |
| net margin | profit-improvement |
| capacity utilization / workload | capacity |
| repeatable demand | growth-readiness |

The collective engine returns vetoes + `whatNotToDo`, embedded into the plan — so the
budget module feeds the existing decision system rather than forming a parallel one.
