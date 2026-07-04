# Owner Mode Full Capability Gap Audit

Date: 2026-06-10
Branch: `claude/vibrant-ramanujan-mdqej8`
Scope: audit + build plan only. No code, tests, workflows, or product files were modified. No commit/push.

## Executive Verdict

Status: **STRONG_FOUNDATION**

Owner Recovery V1 is a real, runtime-proven recovery loop — not a watered-down SaaS shell. It genuinely ingests 28 real business metrics, calculates 19 derived metrics from persisted data, generates 12 evidence-backed findings against explicit thresholds, produces assigned/dated recovery actions, runs them through a correct status machine, verifies real before/after movement, and repeats cycles — all proven against a live PostgreSQL with HTTP auth and DB-backed tests. But measured against the founder's full requirement (a 10-role business command system), it covers roughly **one and a half consultant roles** (business analyst + recovery consultant, with thin slices of financial and operations). It is **not** a strategist, not a sales-pipeline system, not a marketing-ROI engine, not a process/SOP system, not a forecasting/scenario engine, and not a portfolio command center. Of the 35 required capability areas, V1 is PROVEN on ~6, PARTIAL on ~12, and NOT PROVEN on ~17. Blunt: V1 is the engine block and one working cylinder. It is not yet the car.

## Current Proven Owner Recovery V1 Capabilities

Proven from code, migration, DB-backed tests, runtime smoke, and the runtime proof report:

- **Multi-business intake**: `OwnerBusiness` (name, type, location, currency, B2C/B2B flags, active). Business types: laundry_local_service, generic_local_service, retail_service_hybrid. (`src/domain/founder-recovery/types.ts`, migration `20260610120000_owner_recovery_mode`.)
- **Real metric intake (28 fields)**: revenue, total_costs, gross_profit, net_profit, order_count, kg_processed, pieces_processed, b2c_revenue, b2b_revenue, new_customers, repeat_customers, dormant_contacted, average_order_value, discount_amount, refund_amount, rewash_count, complaint_count, receivables, staff_cost, rent_cost, utilities_cost, material_cost, delivery_cost, marketing_spend, campaign_conversions, average_turnaround_hours, staff_productivity + reporting period + currency. Validated (Zod), duplicate-period rejected, workspace-scoped.
- **19 derived metrics** from persisted data (`metrics.ts`): revenueTrendPct, costTrendPct, grossMarginPct, netMarginPct, orderTrendPct, averageOrderValue, repeatCustomerRatePct, b2bSharePct, b2cSharePct, complaintRatePct, refundRatePct, rewashRatePct, receivablesExposurePct, deliveryCostRatioPct, marketingConversionEfficiency, staffProductivity, turnaroundHours, discountLeakagePct, cashPressureIndicator. Currency-driven (no hardcoded USD).
- **12 evidence-backed findings** (`diagnosis.ts`): LOW_REVENUE, HIGH_COST_RATIO, WEAK_REPEAT_RATE, DISCOUNT_LEAKAGE, QUALITY_FAILURE, DELIVERY_COST_LEAKAGE, B2B_CONCENTRATION, LOW_STAFF_PRODUCTIVITY, SLOW_TURNAROUND, RECEIVABLES_PRESSURE, POOR_CAMPAIGN_CONVERSION, LOW_AOV — each with source metric, current value, threshold, severity, evidence, why-it-matters, impact estimate, confidence, verification metric.
- **Recovery action generation** (`recovery-actions.ts`): per-finding action with owner role, due date, priority, expected outcome, metric-to-move, baseline, target, verification window, effort, confidence, completion criteria — all persisted (no fields dropped).
- **Execution tracking** with explicit status machine (`action-status.ts`): proposed→assigned→in_progress→blocked→completed/cancelled, invalid transitions rejected (HTTP 400), completion requires notes + actual outcome.
- **Real before/after verification** (`verification.ts`): direction-aware comparison → unverified | verified_improved | verified_not_improved | inconclusive | disputed. Proven at runtime: baseline 30 → after 60 → verified_improved.
- **Closed loop**: cycles linked via `previousCycleId`, prior snapshot used for trend, resolved findings drop out in the next cycle.
- **Owner dashboard** (`dashboard.service.ts`): business selector, latest snapshot, latest cycle (findings + actions + verification), overdue actions, cycle history, empty state.
- **Access control**: OWNER_VIEW/OWNER_MANAGE, workspace isolation, capability-gated sidebar nav. Proven runtime: 401 unauth, 403 non-owner, 404 cross-workspace.
- **Operational proof**: migration applied to real DB; 46 founder-recovery tests; 15/15 service smoke; HTTP create→snapshot→cycle→verify→dashboard.

## Current Limits of Owner Recovery V1

What it cannot yet do:

- **No time granularity beyond a reporting period** — snapshots are period blobs; there is no daily/weekly review cadence, no daily sales trend.
- **No customer-level or order-level data** — only aggregate counts. Cannot identify *which* customers are dormant, *which* orders, or run a named reactivation campaign.
- **No sales pipeline** — no leads, stages, conversion funnel, or deal tracking.
- **No channel-level marketing ROI** — only one blunt conversions-per-spend ratio; no per-campaign/per-channel attribution, no campaign planning or offer design surface.
- **No true cashflow/working-capital model** — receivables exposure + a coarse "cash pressure" flag only; no runway, no forecast, no AR aging.
- **No pricing analysis** — B2B pricing is a one-line recommendation, not an analysis (no margin-by-segment, no price elasticity, no rate card).
- **No process/SOP system** — no SOP authoring, no recurring task scheduling, no checklists.
- **No vendor/supplier or inventory/materials tracking** — `material_cost` is a number, not an inventory.
- **No competitor/local-market analysis**, no reputation/review actions.
- **No forecasting or scenario planning** — no projections, no what-if.
- **No decision log or experiment tracking** surfaced for the owner (audit events exist but are not an owner-facing decision/experiment ledger).
- **No portfolio command center** — businesses are listed but there is no cross-business rollup, ranking, or attention queue.
- **Findings are rule-threshold based**, not strategic — they detect threshold breaches; they do not reason about business model, positioning, or growth strategy.
- **Diagnosis depth is one layer** — no root-cause chaining (e.g., low revenue → low repeat → quality failure → staffing).

## Required Owner Mode Capability Map

| Capability Area | Required Functions | Current Status | Evidence | Missing Gaps | Priority | Build Module |
|---|---|---|---|---|---|---|
| 1. Strategic diagnosis | Business-model/positioning/stage reasoning, root-cause chaining, growth-vs-recovery stance | NOT PROVEN | V1 has threshold rules only (`diagnosis.ts`) | No model/positioning logic, no root-cause graph | P2 | M9 |
| 2. Business model analysis | Revenue streams, unit economics, segment mix, model viability | PARTIAL | B2B/B2C split + AOV (`metrics.ts`) | No unit economics, no model viability scoring | P2 | M2/M9 |
| 3. Revenue analysis | Trend, mix, driver decomposition, growth levers | PARTIAL | revenueTrendPct, orderTrendPct, AOV, B2B/B2C share | No driver decomposition (price×volume×mix), no daily trend | P1 | M2/M3 |
| 4. Profitability analysis | Gross/net margin, contribution by segment/service | PARTIAL | grossMarginPct, netMarginPct | No segment/service-line contribution margin | P1 | M2/M7 |
| 5. Cashflow & working capital | Runway, AR aging, payables, cash forecast | NOT PROVEN | cashPressureIndicator + receivablesExposurePct only | No runway/forecast/AR aging | P1 | M6 |
| 6. Pricing analysis | Price vs cost vs margin, B2B rate card, elasticity | NOT PROVEN | B2B_CONCENTRATION recommendation only | No pricing engine | P2 | M2/M7 |
| 7. Cost leakage detection | Discount/delivery/material/quality leakage quantified | PARTIAL | DISCOUNT_LEAKAGE, DELIVERY_COST_LEAKAGE, QUALITY_FAILURE | No cost-line ranking, no material/vendor leakage | P1 | M6 |
| 8. Sales pipeline | Leads, stages, conversion, win/loss | NOT PROVEN | none in owner-recovery | Entire pipeline model | P2 | M3 |
| 9. Marketing ROI | Per-channel/campaign spend→revenue attribution | PARTIAL | marketingConversionEfficiency (single ratio) | No channel/campaign attribution | P2 | M4 |
| 10. Customer retention | Repeat rate, cohort retention, churn drivers | PARTIAL | repeatCustomerRatePct, WEAK_REPEAT_RATE | No cohorts, no churn driver analysis | P1 | M3 |
| 11. Dormant customer recovery | Identify dormant list, campaign, track reactivation | PARTIAL | dormant_contacted field + reactivation recommendation | No customer list, no campaign execution/tracking | P1 | M3/M4 |
| 12. B2B account analysis | Account-level revenue, margin, concentration, terms | PARTIAL | b2bSharePct, B2B_CONCENTRATION | No account-level records or profitability | P1 | M7 |
| 13. B2C order growth | Order volume diagnosis, AOV growth, basket | PARTIAL | orderTrendPct, AOV, LOW_AOV | No basket/add-on modeling, no daily orders | P1 | M3 |
| 14. Staff productivity | Output per staff/cost, utilization, scheduling | PARTIAL | staffProductivity, LOW_STAFF_PRODUCTIVITY (vs prior period) | No per-staff or shift/utilization data | P2 | M5 |
| 15. Operations workflow | Stage throughput, bottleneck, turnaround | PARTIAL | turnaroundHours, SLOW_TURNAROUND | No stage-level workflow model | P2 | M5 |
| 16. SOP/process design | SOP authoring, checklists, recurring tasks | NOT PROVEN | none | Entire SOP system | P3 | M8 |
| 17. Task/accountability mgmt | Assign, due, escalate, overdue, ownership | PARTIAL | RecoveryAction (assign/due/status/overdue) | No recurring tasks, no escalation, no per-user assignment UI depth | P1 | M8 |
| 18. Vendor/supplier mgmt | Vendor records, spend, renegotiation tracking | NOT PROVEN | none | Entire vendor module | P3 | M6/M8 |
| 19. Inventory/materials | Stock, consumption, reorder (where applicable) | NOT PROVEN | material_cost number only | Inventory model | P3 | M5 |
| 20. Quality/complaints/refunds | Complaint/rewash/refund rate, root cause, QC action | PARTIAL | complaintRatePct, rewashRatePct, refundRatePct, QUALITY_FAILURE | No complaint categories/root cause, no QC checklist | P2 | M5/M8 |
| 21. Delivery/logistics | Delivery cost ratio, batching, route efficiency | PARTIAL | deliveryCostRatioPct, DELIVERY_COST_LEAKAGE | No route/zone/batch modeling | P2 | M5/M6 |
| 22. Receivables/collections | AR aging, collection actions, DSO | PARTIAL | receivablesExposurePct, RECEIVABLES_PRESSURE | No aging buckets, no collection workflow, no DSO | P1 | M6 |
| 23. Competitor/local market | Local competitor/price/demand context | NOT PROVEN | none | Entire market module | P3 | M9 |
| 24. Campaign planning | Plan campaigns, targets, channels, budget | NOT PROVEN | none | Campaign planner | P2 | M4 |
| 25. Offer/discount design | Structured offers, guardrails, impact projection | PARTIAL | DISCOUNT_LEAKAGE detection + "cap discount" recommendation | No offer builder, no projected impact | P2 | M4 |
| 26. Weekly owner review | Weekly KPIs, exceptions, actions due, decisions | NOT PROVEN | cycles exist but not framed as weekly reviews | Review cadence + surface | P1 | M2/M8 |
| 27. Monthly business review | Monthly P&L-style review, cycle comparison, narrative | PARTIAL | cycle history + summary | No monthly review surface, no P&L narrative | P1 | M2 |
| 28. Scenario planning | What-if on price/volume/cost, recovery paths | NOT PROVEN | none | Scenario engine | P3 | M9 |
| 29. Forecasting | Revenue/cash projection from trend | NOT PROVEN | trends computed but not projected | Forecast engine | P2 | M2/M6 |
| 30. Risk detection | Concentration/cash/key-person/quality risk flags | PARTIAL | B2B_CONCENTRATION, RECEIVABLES_PRESSURE, cashPressure | No consolidated risk register | P2 | M9 |
| 31. Decision log | Owner decisions captured, linked to findings/actions | PARTIAL | audit events emitted (not owner-facing) | No owner decision ledger surface | P2 | M8 |
| 32. Experiment tracking | Hypothesis→action→result as experiments | PARTIAL | actions+verification approximate this | No explicit experiment framing/ledger | P3 | M8 |
| 33. Verification of business impact | Before/target/after, status, dashboard reflection | PROVEN | `verification.ts`, DB + HTTP runtime proof | Multi-metric verification per action only single-metric | P1 | M1 |
| 34. Multi-business portfolio | Cross-business rollup, ranking, attention queue | PARTIAL | businesses listed; per-business dashboard | No portfolio rollup/ranking | P3 | M10 |
| 35. Industry templates (laundry first) | Laundry metric set, thresholds, findings, actions | PARTIAL→PROVEN | laundry metrics + thresholds + 12 findings shipped | No second industry, thresholds not yet field-calibrated | P1 | M1 |

Summary tally: PROVEN ≈ 2 fully (33, partial-35) + the core loop; PARTIAL ≈ 17; NOT PROVEN ≈ 12; FAILED 0.

## Consultant Role Coverage

1. **Business strategist** — Must: assess model, positioning, stage, and choose recover-vs-grow stance; chain root causes. V1 does: nothing strategic (threshold rules only). Missing: business-model analysis, root-cause graph, strategy outputs. **Status: NOT PROVEN.**
2. **Business analyst** — Must: turn raw metrics into trends, ratios, and evidence-backed findings. V1 does: 19 derived metrics + 12 findings with evidence/threshold/confidence. Missing: driver decomposition, cohorts, daily granularity. **Status: PARTIAL (strongest role).**
3. **Operations consultant** — Must: diagnose throughput, turnaround, productivity, quality and fix workflow. V1 does: turnaround + staff productivity + quality findings. Missing: stage-level workflow, scheduling, QC process. **Status: PARTIAL.**
4. **Recovery consultant** — Must: diagnose distress, prioritize, plan, assign, verify recovery. V1 does: full recovery loop with verification and cycles. Missing: deeper triage logic, multi-metric verification. **Status: PARTIAL→PROVEN for the core loop.**
5. **Systems consultant** — Must: design the operating system (data, cadence, SOPs, dashboards). V1 does: a dashboard + cycles. Missing: SOPs, recurring cadence, system design. **Status: PARTIAL.**
6. **Financial consultant** — Must: margins, cashflow, working capital, pricing, forecast. V1 does: gross/net margin, receivables exposure, cash-pressure flag. Missing: cashflow/runway/forecast, AR aging, pricing, contribution margin. **Status: PARTIAL.**
7. **Sales consultant** — Must: pipeline, conversion, B2C order growth, B2B accounts. V1 does: repeat rate, AOV, B2B share at aggregate. Missing: pipeline, accounts, order-level growth levers. **Status: NOT PROVEN.**
8. **Marketing consultant** — Must: channel ROI, campaigns, offers, reputation. V1 does: one conversions/spend ratio + discount-leakage flag. Missing: channel attribution, campaign planner, offer builder, reviews. **Status: NOT PROVEN.**
9. **Process/SOP consultant** — Must: author SOPs, checklists, recurring tasks, enforce. V1 does: none. Missing: entire SOP/process system. **Status: NOT PROVEN.**
10. **Execution/accountability consultant** — Must: assign, schedule, chase, escalate, verify follow-through. V1 does: assign/due/status/overdue + completion evidence + verification. Missing: recurring tasks, escalation, per-person accountability views. **Status: PARTIAL.**

Net: 1 role partial-strong (analyst), 1 recovery loop proven, ~4 partial, ~4 not proven. **Owner Mode covers roughly 1.5 of 10 roles.**

## Tumbledry / Laundry Use Case Coverage

| Use case | Status | Note |
|---|---|---|
| Daily sales review | NOT PROVEN | Snapshots are per-period, not daily; no daily trend surface |
| Weekly sales review | NOT PROVEN | No weekly cadence/surface (cycles are ad-hoc) |
| Order volume diagnosis | PARTIAL | orderTrendPct + LOW_REVENUE/LOW_AOV, but no daily/order-level |
| Repeat customer diagnosis | PARTIAL | repeatCustomerRatePct + WEAK_REPEAT_RATE; no cohorts/customer list |
| Dormant customer campaigns | PARTIAL | dormant_contacted + reactivation recommendation; no list/campaign execution |
| B2B pricing | NOT PROVEN | Recommendation text only; no pricing/margin-by-account |
| B2B profitability | PARTIAL | b2bSharePct + B2B_CONCENTRATION; no account-level margin |
| Staff productivity | PARTIAL | staffProductivity + LOW_STAFF_PRODUCTIVITY (period-over-period) |
| kg/piece productivity | PARTIAL | kg_processed/pieces_processed captured but no per-unit productivity calc |
| Delivery cost leakage | PROVEN | deliveryCostRatioPct + DELIVERY_COST_LEAKAGE finding+action+verify |
| Complaint/rewash/refund tracking | PARTIAL | rates + QUALITY_FAILURE; no categories/root cause |
| Receivables | PARTIAL | receivablesExposurePct + RECEIVABLES_PRESSURE; no aging/collections |
| Campaign ROI | PARTIAL | conversions/spend ratio + POOR_CAMPAIGN_CONVERSION; no channel ROI |
| Apartment/local-area campaigns | NOT PROVEN | No geo/zone campaign capability |
| Google review/reputation actions | NOT PROVEN | None |
| Discount control | PARTIAL | discountLeakagePct + DISCOUNT_LEAKAGE + cap-discount action |
| Monthly recovery plan | PARTIAL | A cycle produces a dated, assigned plan; not framed as monthly review |
| Owner dashboard | PROVEN | Findings/actions/status/verification/history, runtime-proven |

Laundry verdict: the **cost/quality/leakage and recovery-loop** slice is genuinely usable; the **sales-growth, marketing, daily/weekly cadence, and customer-level** slices are not.

## Minimum Complete Owner Mode Modules

### Module 1 — Owner Recovery V1 deployment hardening
- **Purpose**: make the proven V1 deployable and safe on the real DB.
- **Data required**: existing V1 models; production/staging DATABASE_URL.
- **Models/APIs/UI**: none new; apply migration; add nav-visibility test; optional snapshot edit.
- **Calculations**: none new.
- **Diagnosis rules**: calibrate the 12 thresholds against real Tumbledry numbers.
- **Outputs**: deployed, migrated, owner-usable V1.
- **Verification**: migrate deploy on real DB; live smoke with a real owner login.
- **Tests**: migration-applies test; nav-visibility test; existing 46 green in CI with TEST_WITH_DB.
- **Acceptance**: migration applied to real DB; owner logs in and completes one real cycle; thresholds calibrated.

### Module 2 — Business financial intelligence
- **Purpose**: margins, contribution, cashflow direction, monthly/weekly review.
- **Data**: existing financial fields + service-line tagging; opening cash (optional).
- **Models/APIs/UI**: extend snapshot with service-line splits; `/owner/recovery/financials`; review surface.
- **Calculations**: contribution margin by line, cost-line ranking (80/20), simple revenue/cash projection from trend.
- **Diagnosis rules**: margin-by-line below guard; top cost driver; declining-trend forecast breach.
- **Outputs**: P&L-style review, top-leak ranking, weekly/monthly review pack.
- **Verification**: projected vs actual next-period margin compared via existing verification engine.
- **Tests**: contribution/forecast unit tests; review-loader DB test.
- **Acceptance**: owner runs a weekly and a monthly review from persisted data.

### Module 3 — Sales and customer intelligence
- **Purpose**: order growth, retention cohorts, dormant lists, B2C levers.
- **Data**: customer + order records (or imported aggregates by customer).
- **Models/APIs/UI**: `Customer`, `OrderSummary`; `/owner/recovery/customers`.
- **Calculations**: cohort retention, dormancy detection, AOV/basket, repeat-driver.
- **Diagnosis rules**: dormant-segment size, falling cohort retention, basket decline.
- **Outputs**: dormant list, reactivation targets, order-growth actions.
- **Verification**: reactivated count and repeat-rate movement before/after.
- **Tests**: cohort + dormancy unit tests; customer persistence DB test.
- **Acceptance**: owner generates a dormant list and verifies reactivation lift.

### Module 4 — Marketing and campaign intelligence
- **Purpose**: channel ROI, campaign planning, offer design, reputation actions.
- **Data**: campaign spend/conversions by channel; offer definitions.
- **Models/APIs/UI**: `Campaign`, `Offer`; `/owner/recovery/marketing`.
- **Calculations**: per-channel ROI/CAC, offer projected impact vs guardrail.
- **Diagnosis rules**: channel ROI below guard; offer leakage; reputation gap.
- **Outputs**: campaign plan, offer with guardrails, review-action list.
- **Verification**: campaign revenue attribution before/after.
- **Tests**: ROI + offer-impact unit tests; campaign DB test.
- **Acceptance**: owner plans a local campaign and verifies ROI.

### Module 5 — Operations and productivity intelligence
- **Purpose**: throughput, turnaround, staff/kg-piece productivity, quality root cause.
- **Data**: stage timings, per-staff output, complaint categories.
- **Models/APIs/UI**: `OpsStage`, `ComplaintCategory`; `/owner/recovery/operations`.
- **Calculations**: bottleneck stage, per-unit productivity (orders or kg per staff-hour), complaint Pareto.
- **Diagnosis rules**: bottleneck threshold, productivity drop, top complaint category.
- **Outputs**: bottleneck + QC actions.
- **Verification**: turnaround/productivity/complaint movement before/after.
- **Tests**: bottleneck + Pareto unit tests; ops DB test.
- **Acceptance**: owner fixes a bottleneck and verifies turnaround improvement.

### Module 6 — Cashflow, receivables, and leakage control
- **Purpose**: runway, AR aging, collections, vendor/material leakage.
- **Data**: receivables by age, payables, vendor spend.
- **Models/APIs/UI**: `Receivable`, `Vendor`; `/owner/recovery/cash`.
- **Calculations**: DSO, AR aging buckets, runway, leakage ranking.
- **Diagnosis rules**: DSO breach, runway < N weeks, vendor overspend.
- **Outputs**: collection actions, vendor renegotiation actions, runway alert.
- **Verification**: receivables/DSO/runway movement before/after.
- **Tests**: DSO/runway unit tests; receivables DB test.
- **Acceptance**: owner runs a collections cycle and verifies AR reduction.

### Module 7 — B2B/B2C profitability intelligence
- **Purpose**: account- and segment-level profitability and pricing.
- **Data**: B2B accounts with revenue/cost/terms; service-line costs.
- **Models/APIs/UI**: `B2BAccount`, pricing inputs; `/owner/recovery/profitability`.
- **Calculations**: contribution by account/segment, price-vs-cost margin, concentration.
- **Diagnosis rules**: loss-making account, underpriced contract, over-concentration.
- **Outputs**: pricing/renegotiation actions, mix-shift plan.
- **Verification**: account margin / mix movement before/after.
- **Tests**: account-margin unit tests; profitability DB test.
- **Acceptance**: owner identifies a loss-making B2B account and verifies repricing impact.

### Module 8 — SOP/process/action system
- **Purpose**: recurring tasks, SOPs, accountability, escalation, decision log.
- **Data**: SOP definitions, recurring schedules, decisions.
- **Models/APIs/UI**: `SOP`, `RecurringTask`, `DecisionLog`; extend action assignment UI.
- **Calculations**: overdue/escalation logic, adherence rate.
- **Diagnosis rules**: missed-SOP, overdue-escalation, low adherence.
- **Outputs**: SOP packs, recurring task board, escalation queue, decision ledger.
- **Verification**: adherence-rate movement before/after.
- **Tests**: scheduling/escalation unit tests; SOP DB test.
- **Acceptance**: owner runs a recurring weekly review SOP with accountable owners.

### Module 9 — Strategy and scenario planning
- **Purpose**: business-model analysis, root-cause chaining, scenarios, risk register, forecasting.
- **Data**: existing metrics + model inputs + assumptions.
- **Models/APIs/UI**: `Scenario`, `RiskRegister`; `/owner/recovery/strategy`.
- **Calculations**: what-if on price×volume×cost, root-cause graph, risk scoring.
- **Diagnosis rules**: model-viability flags, compounded-risk flags.
- **Outputs**: strategy stance (recover/stabilize/grow), scenarios, risk register.
- **Verification**: scenario projection vs realized outcome.
- **Tests**: scenario math unit tests; strategy DB test.
- **Acceptance**: owner runs a recovery vs growth scenario and tracks the chosen path.

### Module 10 — Multi-business owner portfolio command center
- **Purpose**: cross-business rollup, ranking, attention queue.
- **Data**: all owner businesses' latest cycles/health.
- **Models/APIs/UI**: `/owner/recovery/portfolio`.
- **Calculations**: portfolio health rollup, worst-first ranking, aggregate risk.
- **Diagnosis rules**: which business needs attention now.
- **Outputs**: portfolio dashboard, attention queue.
- **Verification**: portfolio health movement over cycles.
- **Tests**: rollup unit tests; portfolio DB test.
- **Acceptance**: owner sees all businesses ranked by urgency with next actions.

## No-Go Rules Before Public SaaS

Public/SaaS work must NOT resume until all are PROVEN:

1. Owner mode deployed with migration applied to the real (non-local) database.
2. Owner can load and use real Tumbledry data (not seed/demo).
3. At least one real recovery cycle completed on a real business.
4. Before/after improvement verified on at least one action with real metrics.
5. Dashboard reflects actual results (findings, actions, verification, history).
6. Owner can run a weekly and a monthly review from persisted data.
7. At least one repeatable, documented case study exists (a real business measurably moved).
8. Public/SaaS mode is **derived** from the proven owner mode (same engine), not a separate parallel build.

Current status against these: only #4 and #5 are PROVEN (locally). #1 (real DB), #2 (real data), #3 (real cycle), #6 (reviews), #7 (case study) are NOT met. **No-Go for public SaaS holds.**

## Recommended Next Build Slice

**Module 1 — Owner Recovery V1 deployment hardening (deploy + real-data calibration).**

Rationale (single highest-leverage step): V1 is already proven in code and locally against a real DB, but it has **zero** real-business mileage. The biggest risk and the biggest unlock is the same thing — get it running on the real database with real Tumbledry numbers and complete one real recovery cycle. That converts "proven in a test" into "proven on a business," calibrates the 12 thresholds against reality (which every later module depends on), and produces the first case-study evidence. Building Module 2+ before this would stack unproven intelligence on uncalibrated foundations. Do Module 1 first; do not start Module 2 until a real cycle is verified.

## Final Verdict

1. **Is Owner Recovery V1 enough for the founder's full requirement?** NO. It covers ~1.5 of 10 consultant roles and ~6 of 35 capability areas at PROVEN level.
2. **Is Owner Mode currently fully loaded?** NO. It is a STRONG_FOUNDATION recovery loop, not a full business command system.
3. **Can public/SaaS work resume?** NO. No-Go rules #1, #2, #3, #6, #7 are unmet (no real-DB deploy, no real data, no real cycle, no reviews, no case study).
4. **What is the next single build slice?** Module 1 — deploy V1 to the real database and complete one real, verified Tumbledry recovery cycle (with threshold calibration).
5. **What evidence must prove that slice complete?** Migration applied to the real DB (`prisma migrate deploy` against the production/staging URL); a real owner login; one snapshot of real Tumbledry numbers; one diagnosis cycle with calibrated thresholds; at least one action executed and verified (real before/after movement); the dashboard reflecting it; and a one-page documented case study of the business metric that moved.
