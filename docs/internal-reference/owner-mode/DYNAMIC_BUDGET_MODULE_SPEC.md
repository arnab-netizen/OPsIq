# Dynamic Budget, Capital Allocation & Profit Governance — Module Spec

Owner-Mode only. Not a budget tracker — a governed financial decision layer that
answers, on every material change: what changed, why it matters, what mode applies,
what to fund/block/defer, who is accountable, what proof is required, the updated
cash/profit/runway view, and when to reassess.

## Architecture (minimum-code)

```
src/domain/owner-budget/            (pure, deterministic — no DB/IO)
  types.ts                  shared types + hierarchy/confidence constants
  mode-classifier.ts        classifyBudgetMode → EMERGENCY/STABILIZE/GROW/SCALE/PROFIT_INCREASE/HYBRID/DATA_INSUFFICIENT
  capital-allocation.ts     rankCapitalAllocation → survival-first ranked fund decisions
  spend-governance.ts       evaluateSpend → risk tier + SOD/split/self-approval/vendor-bank flags
  confidence-gate.ts        checkConfidenceGate / expressAllocation → recommendation strength gating
  reassessment-triggers.ts  classifyMaterialChange → material? immediate?
  updated-plan.ts           composeUpdatedPlan → the full UpdatedOwnerPlan (orchestrator)
  index.ts                  barrel

src/services/owner-budget/budget.service.ts   (DB-backed wiring)
  createBudgetPeriod / addBudgetLine / updateBudgetLineAmount
  recordSpendEntry / updateSpendProofStatus
  reassessBudget (atomic, idempotent, snapshot-versioned)
  getBudgetGuidance / listBudgetSnapshots (owner guidance adapter)

src/app/api/owner/budget/{guidance,snapshots}/route.ts   (OWNER_VIEW read surface)

prisma: BudgetPeriod, BudgetLine, SpendEntry, BudgetReassessment, BudgetPlanSnapshot
```

## Reuse (no duplication)

- Financial math: `owner-finance/metrics.ts` + `unit-economics.ts` (runway, break-even,
  margin, contribution, margin floor, discount safety).
- Cross-domain sequencing / "what not to do": `collective-training/runCollective`.
- Audit: `infra/audit.ts` `emitAuditEvent` (+ canonical event store).
- Ownership guard: `getBusiness(businessId, workspaceId)`.
- Finance signals: latest `OwnerFinancialSnapshot` (read, not re-stored).

## Data model

| Model | Purpose | Audit/immutability |
|---|---|---|
| BudgetPeriod | period, currency, approved budget, reserve targets, owner goal | mutable structure |
| BudgetLine | planned allocation by category + owner role + approval threshold | soft-void (`voidedAt`) |
| SpendEntry | spend lifecycle + governance flags + obligation (dueInDays/kind) | soft-void (`voidedAt`) |
| BudgetReassessment | one row per trigger (idempotent via unique triggerEventId) | append-only |
| BudgetPlanSnapshot | immutable versioned plan; one `isCurrent` per business | append-only + atomic pointer |

All models are workspace-scoped (`workspaceId`) with `@@index([workspaceId, businessId])`.

## The Updated Owner Plan (Section 7 contract)

`composeUpdatedPlan` returns: `mode`, `topConstraint`, `nextBestAction`,
`decisionType` (APPROVE|BLOCK|PAUSE|REDUCE|INCREASE|REALLOCATE|INVESTIGATE|DEFER|
ESCALATE|COLLECT_EVIDENCE), `whatChanged`, `affectedBudgetLines/Functions`,
`fundAllocationChanges`, `spendRestrictions`, `accountableRoles`, `generatedActions`
(title/role/decision/proof/review/impact/killRule), `requiredProof`, `cashImpact`,
`profitImpact`, `runwayImpact`, `confidence`, `reviewInDays`, `killRule`, `signals`,
`whatNotToDo` (from the collective engine), `highRiskBlocked`.

Advice is specific (names the constraint, role, proof, review). Generic advice
("review expenses", "increase sales") is structurally impossible — the composer
always emits a typed decision + named target.

## Confidence rules (Section 10)

UNVERIFIED → only evidence collection. PARTIAL → capped reversible tests only.
OPERATIONAL → controlled growth if cash + unit economics pass. VERIFIED → larger
reallocation / irreversible spend (still owner-approved). Below VERIFIED,
discretionary allocations are expressed as capped ranges, not false precision.

## Scope

In scope: Owner-Mode authenticated service/adapters + read routes. Out of scope:
public SaaS onboarding/billing/launch UI, external production integrations.
