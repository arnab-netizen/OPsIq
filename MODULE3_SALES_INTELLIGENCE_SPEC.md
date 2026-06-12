# Module 3 — Sales & Customer Intelligence — SPEC

Status: **PLANNED / first build slice = deterministic engine.** Grounded in
execution.md §10 (Module 3) + §22 Phase 4. Reuses the Owner Intelligence Spine
and the proven Module 2/5 build pattern (engine → detector → planner →
persistence/migration → API → UI + command-center → runtime proof → audit).
Sales is a **growth** domain (NOT in `SURVIVAL_DOMAINS`), so its risk feeds the
growth/execution rollup, not survival risk. Module 1/2/5 untouched. No public/SaaS.

## 1. Purpose / owner value (execution.md §10)

Answer: where are sales coming from, where are customers dropping off, are
customers repeating, which channel/offer works, which prospects to contact today —
and surface the single highest-impact sales action with verification.

## 2. Inputs (SalesSnapshotInput; execution.md §10.1)

period + currency + businessModel/industryTemplate, plus (all nullable):
`leads`, `qualifiedLeads`, `orders`, `revenue`, `averageOrderValue`,
`newCustomers`, `repeatCustomers`, `lostCustomers`, `b2bProspects`,
`b2bPipelineValue`, `b2bRevenue`, `b2cRevenue`, `complaints`, `discountAmount`,
`refundAmount`, `staffCount`. Missing = missing (never invented).

## 3. Derived metrics (§10.2; `number | null` when not computable)

`leadToSaleConversionPct`, `qualifiedConversionPct`, `repeatRatePct`,
`newCustomerSharePct`, `lostCustomerRatePct`, `acquisitionPerDay`,
`averageOrderValue` (revenue÷orders, or direct), `salesPerDay`, `ordersPerDay`,
`salesPerStaff`, `b2bSharePct`/`b2cSharePct`, `b2bPipelineCoveragePct`
(pipeline÷revenue), `complaintToSaleRatioPct`, `discountDependencePct`,
`refundRatePct`. Composite (0..100): `salesHealthScore`, `salesRiskScore`,
`salesOpportunityScore`, `dataConfidenceScore`. State:
`STRONG/STEADY/SOFT/WEAK/CRITICAL` (sales momentum, not survival).

## 4. Risk rules (§10.3 — Slice: detector, next)

low/critical conversion · weak/critical repeat rate · high complaint-to-sale ·
discount overdependence · high refund rate · lost-customer leakage · weak B2B
pipeline · missing critical data.

## 5. Opportunity rules (next slice)

raise conversion to the healthy bar · improve retention (repeat) · win back lost
customers · tighten discounting · convert the B2B pipeline. Emitted only when
supporting inputs exist.

## 6. Spine integration

The sales engine emits a `DomainScore` (domain `sales`) + `OwnerFinding`/
`OwnerAction`s into the Owner Intelligence Spine, so the command center becomes
finance + recovery + cashflow + **sales** (reusing `buildBusinessConditionProfile`
+ `rankOwnerActions`). Verification reuses the shared `verifyOutcome`.

## 7. Persistence / API / UI (later slices)

Additive `owner_sales_*` tables via a manual fail-closed migration;
`/api/owner/sales/*` routes (canonical enforcement, OWNER_VIEW/MANAGE,
workspace-scoped); `/owner/sales` UI; deployed runtime proof. No recovery/finance/
cashflow table mutated.

## 8. Slice plan (mirrors Module 5)

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
owner-operated business; per-prospect follow-up *lists* require itemized intake
(Module 10 connectors) — v1 works on aggregate inputs and emits prioritized
*actions*, not per-customer lists.
