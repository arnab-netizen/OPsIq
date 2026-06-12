# Module 5 — Cashflow Intelligence — SPEC

Status: **PLANNED / first build slice = deterministic engine.** Grounded in
execution.md §12 (Module 5 Cashflow), reusing the Owner Intelligence Spine (Slice 1)
and the Module 2 build pattern. Survival module (per §0 / constraint precedence
SURVIVAL > CASHFLOW > GROWTH); built before growth modules. No public/SaaS. Module 1 +
Module 2 untouched.

## 1. Purpose / owner value

Prevent business death from liquidity (not just profit): answer *who owes money, what
to collect first, which payments are urgent, where cash leaks, and can the business
survive the next 30 days* — and surface the single highest-impact cash action.

## 2. Inputs (CashflowSnapshotInput; execution.md §12.1)

period + currency + businessModel/industryTemplate, plus (all nullable):
`cashInHand`, `bankBalance`, `dailyCollections`, `receivables`, `receivablesOverdue`,
`payables`, `payablesOverdue`, `upcomingEmi`, `rentDue`, `salaryDue`, `vendorDue`,
`taxDue`, `ownerWithdrawal`. Missing = missing (never invented).

## 3. Derived metrics (§12.2; `number | null` when not computable)

`totalCash` (cashInHand + bankBalance), `nearTermObligations` (emi+rent+salary+vendor+
tax+ownerWithdrawal), `cashRunwayDays` (only when burning), `collectionGapDays`
(receivables ÷ dailyCollections), `overdueReceivablesPct`, `payablesPressurePct`
(payables ÷ totalCash), `urgentPaymentRiskPct` (nearTermObligations ÷ totalCash),
`ownerWithdrawalPressurePct`. Composite (0..100): `cashflowDangerScore`,
`cashflowHealthScore`, `cashflowOpportunityScore`, `dataConfidenceScore`. State:
`SAFE/WATCH/AT_RISK/CRITICAL/INSOLVENT_RISK`.

## 4. Risk rules (§12.3 — Slice: detector, next)

cash shortage (low/critical/insolvent runway) · high overdue receivables · salary/rent
risk (near-term dues exceed cash) · vendor cutoff risk (high payables pressure) · debt
default risk (EMI vs cash) · owner-withdrawal pressure · missing critical data.

## 5. Opportunity rules (next slice)

collect overdue receivables → free cash; defer/negotiate non-critical payables;
reduce owner withdrawals under pressure. Emitted only when supporting inputs exist.

## 6. Spine integration

The cashflow engine emits a `DomainScore` (domain `cashflow`) and `OwnerFinding`/
`OwnerAction`s into the Owner Intelligence Spine, so the Business Condition Profile /
command center becomes finance + recovery + **cashflow** (reusing
`buildBusinessConditionProfile` + `rankOwnerActions`). Verification reuses the shared
`verifyOutcome`.

## 7. Persistence / API / UI (later slices)

New finance-style additive tables (`owner_cashflow_snapshots`, `_cycles`, `_findings`,
`_actions`, `_verifications`) via a manual fail-closed migration; `/api/owner/cashflow/*`
routes (canonical enforcement, OWNER_VIEW/MANAGE, workspace-scoped); `/owner/cashflow`
UI; deployed runtime proof. No recovery/finance table mutated.

## 8. Slice plan (mirrors Module 2)

1. **Engine** (this slice) — deterministic metrics + danger/health/opportunity +
   data-confidence + state. Pure, no DB. ← building now
2. Detector (risk/opportunity `OwnerFinding[]`).
3. Recommendation/action planner (`OwnerAction[]`).
4. Persistence schema + manual migration (stop for manual run).
5. API + services.
6. UI + condition/command-center integration.
7. Deployed runtime proof (stop for manual run).
8. Audit + proof.

## 9. Non-goals / honesty

Deterministic (no LLM); missing data marked missing; generic for any owner-operated
business (no hardcoded business); per-item collection/payment *lists* require itemized
intake (Module 10 connectors) — this module works on aggregate inputs and emits
prioritized *actions*, not per-customer lists, in v1.
