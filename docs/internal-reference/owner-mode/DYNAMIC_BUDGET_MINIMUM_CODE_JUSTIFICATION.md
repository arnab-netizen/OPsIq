# Dynamic Budget Module — Minimum-Code Justification

Every new artifact below is linked to a required behaviour in the build prompt and a reason why
existing code cannot safely supply it. Everything else is REUSED.

## Reused instead of rebuilt (no new code)

| Requirement | Reused asset | Why not new code |
|---|---|---|
| Break-even, margin, runway, cash-days | `owner-finance/metrics.ts` | Already deterministic + tested; rebuilding duplicates a proven engine |
| Unit economics, margin floor, discount safety, segment profitability | `owner-finance/unit-economics.ts` | Exact functions the prompt's §13/§16 need |
| Cross-domain decision sequencing (what-not-to-do, vetoes, who/how/proof) | `collective-training/runCollective` | The module must "not create a parallel business decision system"; budget maps to its 24 domains |
| Budget actions/tasks | `services/action.ts` + `action-lifecycle.ts` | Prompt §30B: reuse existing action system, do not build a new task system |
| Spend proof | `domain/execution/proof.ts` + evidence service | Prompt §21/§30C: reuse proof/evidence, do not duplicate |
| Audit trail | `infra/audit.ts` `emitAuditEvent` + `event-emitter.ts` | Prompt §30K: reuse audit ledger |
| Cash-safety gating | `recommendation-cash-safety.service.ts` | Already enforces runway thresholds |
| Owner constraints (budget cap, runway, stage, goal) | `business-facts/owner-constraints.ts` | Hard gates already modeled |
| Spend friction tiers | `remote-operations/plan-approval.ts` | Risk-based approval gates already exist |
| SOD / manager integrity / fraud signals | `remote-operations/manager-exception.ts` + `reliability.ts` | 9 integrity flags + reliability gating already exist |
| Vendor control scoping | `remote-operations/vendor-access.ts` | Forbidden-field projection already exists |
| Guidance surfacing | `owner-guidance/owner-now-view.service.ts` | Reuse owner dashboard adapter |
| Confidence vocabulary | `domain-training/training-types.ts` | Reuse `RecommendationConfidence` |
| Outcome/learning eligibility | `collective-training/learning-admission.ts` | Reuse learning gate |

## New code (justified)

| New artifact | Required by | Why existing code cannot supply it |
|---|---|---|
| `src/domain/owner-budget/` pure engine (mode classifier, capital allocation, spend governance, confidence gate, updated-plan composer, reassessment-trigger classifier, types) | §5, §6, §7, §10, §18, §19, §4 | No budget decision logic exists anywhere; this is the genuinely missing core. One cohesive engine folder, not many shallow files. |
| Prisma models: `BudgetPeriod`, `BudgetLine`, `SpendEntry`, `BudgetReassessment`, `BudgetPlanSnapshot` | §8, §38 | No budget/spend persistence exists. Minimal set; reuses OwnerBusiness as parent; no duplicate of finance snapshots. |
| `src/services/owner-budget/` service (CRUD, spend entry, proof-status, reassessment, override, guidance adapter) | §4, §9, §35 | Wires the new engine + new models to the reused infra; reassessment atomicity/idempotency/versioning is budget-specific. |
| Routes `src/app/api/owner/budget/*` | §35, §36 | New owner surface; uses existing canonical enforcement (no new auth code). |
| Tests + hostile fixtures | §41, §42, §43 | New behaviour requires new proof. |

## Explicitly avoided duplications

- No new forecasting engine (reuse finance metrics + add scenario deltas only where tested).
- No new proof/evidence system.
- No new action/task system.
- No new audit table (reuse hash-chained ledger + canonical events).
- No second decision engine (budget feeds `runCollective`).
- No new reserve/working-capital analytics where finance fields already carry the signal; add
  minimal fields only when a tested gate requires them.

## Design rule applied

One cohesive `owner-budget` domain engine + one cohesive `owner-budget` service, mirroring the
existing `owner-finance` module shape, instead of 25 thin engine files. Engines are functions
within a small number of files, each with typed inputs, deterministic rules, and tests.
