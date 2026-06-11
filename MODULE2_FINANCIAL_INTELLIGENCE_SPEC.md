# Module 2 — Financial Intelligence — SPEC

Status: **PLANNED (NOT STARTED)**. Planning/specification only — no code, schema,
API, UI, or migration in this document. Module 2 is the second owner-intelligence
domain after Module 1 (Owner Recovery, `OWNER_MODE_STAGING_PROVEN`). It must conform
to the Owner Intelligence Spine described in
`EXECUTION_OWNER_MODE_FULL_CAPACITY_AUDIT_ADDENDUM.md` and `execution.md` §9, §23.

Grounding (existing Module 1 contracts this spec reuses, verified in repo):
- `src/domain/founder-recovery/types.ts`: `Severity = low|medium|high|critical`;
  `Finding { code, title, sourceMetric, ..., severity, ..., confidence /*0..1*/,
  verificationMetric }`; `MetricSnapshotInput`; `DerivedMetrics` (nullable = "not
  computable").
- Action status machine `src/domain/founder-recovery/action-status.ts`
  (`proposed→assigned→in_progress→{blocked}→completed|cancelled`, optimistic
  `version`).
- Services `src/services/founder-recovery/*`; routes `/api/owner/recovery/*`;
  enforcement `withCanonicalEnforcement` with `OWNER_VIEW`/`OWNER_MANAGE` +
  `requireWorkspace`.

---

## 1. Purpose and owner value

Give the owner a **true financial control panel** that answers — from their own
numbers, deterministically — whether the business makes money, where money leaks,
how long the cash lasts, and **the single highest-impact financial action to take
next**. Not charts: a prioritized, verifiable financial action that plugs into the
same action→verification loop Module 1 already proved.

## 2. Exact owner questions Module 2 answers

1. Is the business making money (gross/net/contribution)?
2. Is revenue above or below break-even (and by how much)?
3. How many days of cash runway remain?
4. Where is money leaking (cost ratios, discounts, refunds/rework, delivery)?
5. How dangerous is debt/EMI and owner-withdrawal pressure?
6. Which receivables/payables threaten survival?
7. Which one financial action improves survival/profit fastest, and how will we
   verify it worked?

## 3. Financial data inputs (FinancialSnapshot)

Required period framing: `periodStart`, `periodEnd`, `currency`, `businessModelType`,
`industryTemplate` (see §16), `businessId`, `workspaceId`. All monetary values are in
the business currency (never assumed USD). All metric fields are **optional at type
level**; required/critical enforcement is in validation (§17, §9-data-confidence).

- revenue (and optional `b2cRevenue`, `b2bRevenue`)
- costOfGoodsOrServices (COGS / direct service cost)
- fixedCosts; variableCosts
- rent
- salaryPayroll
- utilities
- deliveryFulfilmentCost
- marketingSpend (+ optional `marketingAttributedRevenue`/`campaignConversions`)
- discountAmount (discount leakage)
- refundAmount; reworkCost; complaintCost
- loanEmiDebtPayments; totalDebtOutstanding
- cashOnHand
- receivables (+ optional `receivablesOverdue`)
- payables (+ optional `payablesOverdue`)
- ownerWithdrawals
- inventoryStockCashLock (only if inventory business — see §15)
- orderCount, customerCount (optional; enable per-order/per-customer metrics)
- notes; snapshotDate

Reuse note: several fields already exist on Module 1's `MetricSnapshotInput`
(revenue, totalCosts, discountAmount, refundAmount, receivables, staffCost→payroll,
rentCost, utilitiesCost, deliveryCost, marketingSpend). Slice 0 audits whether to
**extend** the existing snapshot or create a finance-specific snapshot; v1 default =
a finance-specific `FinancialSnapshot` that may import a Module 1 snapshot's shared
fields, to avoid mutating proven Module 1 persistence.

## 4. Derived metrics (deterministic; `null` = not computable)

- grossMarginPct, netMarginPct, contributionMarginPct
- fixedCostBurdenPct (fixed / revenue)
- breakEvenRevenue, dailyBreakEvenRevenue
- cashRunwayDays (cashOnHand ÷ daily net burn; `null` if not burning/insufficient data)
- debtServicePressurePct (EMI / revenue or EMI / net cash inflow)
- receivablesPressurePct (receivables ÷ revenue; overdue subset if provided)
- payablesPressurePct
- costLeakageRatioPct (discount+refund+rework+excess-delivery ÷ revenue)
- revenueQualityScore (recurring/repeat share, concentration, discount dependence)
- profitPerOrder, profitPerCustomer (only when orderCount/customerCount present)
- discountLeakagePct (discount ÷ gross revenue)
- ownerWithdrawalPressurePct (withdrawals ÷ net profit or ÷ cash)
- **financialHealthScore** (0–100, composite, explainable)
- **financialRiskScore** (0–100)
- **financialOpportunityScore** (0–100)
- **dataConfidenceScore** (0–1; §9 data-confidence)

Every derived metric is a **pure function** of inputs (+ optional prior snapshot for
trend). No LLM. Each carries provenance (which inputs it used) for explainability.

## 5. Risk rules (each → a traceable Finding)

negative gross margin · negative net margin · revenue below break-even · high fixed
cost burden · high payroll burden · high debt/EMI pressure · low cash runway · overdue
receivables · payables pressure · discount leakage · refund/rework leakage · marketing
spend without conversion evidence · owner withdrawals exceeding safe level · missing
critical data (degrades confidence; never invents). Thresholds come from the industry
template (§16) with safe generic defaults; each rule names the metric + threshold it
fired on.

## 6. Opportunity rules (each → a traceable Finding, opportunity-typed)

margin recoverable by cutting an identified leak · break-even reachable with a stated
revenue/cost delta · discount tightening upside · receivables collection upside ·
fixed-cost renegotiation upside · profitable-segment expansion (B2B/B2C share) when
data supports it. Opportunities are only emitted when the supporting inputs exist —
otherwise marked "insufficient data," never assumed.

## 7. Recommendation rules (traceability mandatory)

Every recommendation MUST state: **source metric · threshold/rule triggered ·
severity · expected financial impact (money + direction) · confidence (0–1) · required
owner action · verification method (which metric, before/after) · expected timeframe.**
No recommendation may invent data. If a critical input is missing, the recommendation
is "collect/confirm <metric>" with low confidence — not a fabricated number.

## 8. Action creation rules

Each Finding maps to an Action conforming to the existing action contract (title,
assignedToRole, priority, dueAt, expectedOutcome, **metricToMove**,
**verificationMethod**, status, actualOutcome, completionNotes, `version`) and the
proven status machine. Finance actions additionally carry Spine prioritization fields
(domain="finance", impact, confidence, urgency, effort — §"Spine") so the future
global queue can rank them. Actions are created only from Findings (never free-floating).

## 9. Verification rules

Reuse Module 1's before/after verification: capture baseline metric at action
creation, record after-value at verification, classify honestly
(`verified_improved` / `verified_not_improved` / `disputed` / `unverified`) by
comparing the **declared metricToMove** before vs after. No faked improvement; a
non-improvement is recorded truthfully (as Module 1's runtime proof already
demonstrated).

## 10. Dashboard requirements

`/owner/finance` shows: financial health score; top financial risks (ranked); top
profit leaks; break-even target + gap; cash runway; debt/withdrawal pressure;
recommended **next financial action** (single, prioritized); pending finance actions;
verified finance wins; data-confidence + any missing-critical-data banner. Dashboard
reads **persisted** data only (no demo/mock). Must also emit a finance **domain
contribution** to the Business Condition Profile (Spine).

## 11. API contracts (planned; built in Slice 6, not now)

`/api/owner/finance/snapshot` (POST create, GET list) ·
`/api/owner/finance/metrics` (GET derived) ·
`/api/owner/finance/risks` (GET findings: risks+opportunities) ·
`/api/owner/finance/actions` (POST/GET; PATCH via shared action route) ·
`/api/owner/finance/dashboard` (GET). All via `withCanonicalEnforcement`
(`OWNER_VIEW` read / `OWNER_MANAGE` write, `requireWorkspace: true`), canonical JSON,
input validation, safe errors.

## 12. UI routes

`/owner/finance` (within the authenticated owner area). Single-next-action first,
risk/money first, mobile-friendly (per execution.md §19). Built in Slice 7.

## 13. Persistence needs (decided in Slice 0/5; not migrated now)

- `FinancialSnapshot` (id, workspaceId, businessId, period, currency,
  businessModelType, industryTemplate, the §3 inputs, createdAt, updatedAt).
- `FinancialDiagnosis` + `FinancialFinding` (or reuse a generalized finding store) —
  persisted findings with code/severity/confidence/evidence/source+verification
  metric.
- Finance **Actions/Verifications**: reuse the existing owner action + verification
  mechanism via a `domain` discriminator (preferred) so finance actions enter the
  same proven loop; Slice 0 confirms whether to generalize the recovery action table
  or add a finance-scoped link. Every model carries id, workspaceId, businessId,
  createdAt, updatedAt, status/version where relevant, audit fields (execution.md
  §23.2).

## 14. Auth / workspace / owner access rules

Owner-only (`OWNER_VIEW`/`OWNER_MANAGE`); workspace-isolated; cross-workspace blocked
(≥400); unauthenticated blocked (401/403); non-owner blocked unless owner policy
allows; server-side enforcement only (no client trust). Mirrors Module 1, proven in
its runtime proof (unauth 401 · foreign 404 · invalid-transition 400).

## 15. Business-model adaptability

`businessModelType` drives which inputs/metrics are **relevant**:
- service business (e.g. laundry): no inventory cash-lock; COGS = direct service cost.
- inventory/retail business: include inventoryStockCashLock; COGS = goods.
- B2B-heavy vs B2C-heavy: weight receivables pressure and revenue-quality accordingly.
Irrelevant inputs are hidden/ignored (not demanded), and their absence does NOT lower
data confidence.

## 16. Industry-template handling

An `industryTemplate` (generic default + named packs, e.g. `laundry_local_service`)
supplies **threshold values and metric relevance**, not business identity. Templates
live in a deterministic config map with a safe generic fallback. **No business is
hardcoded**; Tumbledry is a *validation example* only (§21). Same metrics + different
template ⇒ different fired thresholds (tested in the test matrix).

## 17. Edge cases (must be handled, not crash)

zero revenue · negative profit · missing cost · missing revenue · high fixed cost ·
high debt/EMI · overdue receivables · overdue payables · break-even not reached ·
invalid currency · duplicate snapshot (same period) · stale snapshot · partial-period
data · revenue spike · cost spike · no-receivables/payables business · service vs
inventory business · B2B-heavy vs B2C-heavy. Each yields a defined result (finding,
`null` metric, or surfaced missing-data), never a silent assumption.

## 18. Non-goals (v1)

No bank/accounting connectors (Module 10) · no automated bank-feed ingestion · no
tax/legal advice · no forecasting beyond deterministic break-even/runway · no LLM-
generated numbers · no public/SaaS/billing · no cross-domain global priority queue
build (Module 2 only *emits into* the Spine; the global engine is a separate slice).

## 19. How it plugs into Module 1's action/verification loop

Finance Findings create Actions in the **same** action contract + status machine and
use the **same** before/after verification service Module 1 proved. A finance action
is indistinguishable to the execution/verification layer except for its `domain`
tag and `metricToMove` being a financial metric. This keeps one execution loop, not a
second disconnected one.

## 20. How it plugs into the future /owner command center

Module 2 emits a finance **domain score** + its top finding/action into the **Business
Condition Profile** and exposes its prioritized next action with Spine fields
(impact/confidence/urgency/effort) so the future global Prioritization Engine can rank
finance against other domains. v1 builds the *emit* side; the global rollup consumes
it later.

## 21. Generic vs Tumbledry-specific

100% generic owner-operated-business logic. Tumbledry Mukundapur (laundry, INR) is
used **only** as a validation example/dataset in tests and runtime proof. No Tumbledry
constant, threshold, or branch may appear in core product code (execution.md §0).

## 22. Allowed in v1 vs deferred

**v1:** FinancialSnapshot intake; deterministic metric engine; risk+opportunity
detection; traceable recommendations; finance actions into the existing loop;
before/after verification; `/owner/finance` dashboard reading persisted data;
data-confidence + missing-data honesty; finance contribution to Business Condition
Profile; finance runtime smoke proof.
**Deferred:** connectors/auto-ingestion; multi-currency consolidation; forecasting;
the global cross-domain priority queue engine; scenario planning (Module 8); cashflow
deep module (Module 5) beyond the runway/receivables/payables metrics here.

## Owner Intelligence Spine incorporation (summary)

1. **Finding contract** — reuse/extend Module 1 `Finding` (code,title,sourceMetric,
   severity,confidence 0..1,businessImpact,evidence,verificationMetric) + `domain`,
   `findingType: risk|opportunity`.
2. **Action contract** — existing action shape + `domain`, prioritization fields.
3. **Risk/Opportunity Score contract** — normalized `DomainScore { domain, riskScore
   0–100, opportunityScore 0–100, healthScore 0–100, confidence 0–1, evidence }`.
4. **Business Condition Profile** — finance emits a `DomainScore` into it.
5. **Prioritization hooks** — each action carries impact×confidence×urgency÷effort
   inputs (stored, explainable) for the future global queue.
6. **Adaptive re-evaluation triggers** — finance triggers: margin turns negative,
   runway crosses threshold, debt-pressure spike, new snapshot KPI deterioration,
   failed verification → emit re-evaluation event.
7. **Verification** — shared before/after, honest classification.
8. **Dashboard rollup** — finance feeds owner home + Business Condition Profile.
9. **Data-confidence/missing-data** — per-metric confidence; missing critical data
   lowers confidence and is surfaced, never invented.
10. **Anti-hallucination** — no invented numbers; recommendations cite metric+threshold.
