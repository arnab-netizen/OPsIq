# Dynamic Budget — Implementation Status

**Classification: DYNAMIC_BUDGET_MODULE_INTEGRATED_PARTIAL**

The reassessment engine is implemented and PROVEN (mandatory dynamic proof passes),
integrated with existing finance, collective-decision, audit, and owner-guidance
systems. Slice 2 added owner-override persistence + outcome classification, the
employee/manager budget-authority lifecycle (with lawful-action guardrails), and
OWNER_MANAGE write routes. Slices 3–4 added working-capital, revenue-assurance, and
vendor/procurement engines plus vendor-master + funded-initiative persistence. Remaining
surfaces (full owner UI, live external feeds, ageing buckets, runtime RBAC denial tests)
remain PARTIAL/MISSING, so this is **NOT** OWNER_MODE_READY. Owner Mode is not runtime-complete.

## Slice history

- Slice 1: inventory, min-code, pure engine core, schema, DB reassessment service,
  mandatory dynamic proof, read routes, hostile fixtures, docs.
- Slice 2: owner override (persistence + 8-class outcome classification +
  hard-block refusal), budget-authority lifecycle (NORMAL→WATCH→RESTRICTED→
  OWNER_APPROVAL_REQUIRED→SUSPENDED_FOR_CATEGORY→RESTORED) with lawful-action
  guardrails, and OWNER_MANAGE write routes (spend / override / authority) with Zod
  validation + enforcement tests + `[db]` governance tests.
- Slice 6 (this slice): bank/payment reconciliation evaluator (§21 — a receipt alone
  is not verification; full match required; mismatch→disputed→`reconciliation_exception`)
  and rolling 13-week cash forecast / scenario engine (§28 — base/downside/cash-stress,
  reserve-breach week) with `updateSpendReconciliation` + `getBudgetForecast` + read route.
- Slice 5: underinvestment detection (§24 — harmful vs good-savings vs
  cash-preservation classification) and collusion/fraud risk indicators (§25 —
  self-approval, split-spend clusters, approver concentration, refund/discount
  clustering; "requires review" language, never accusations), wired into the plan
  (`underinvestment_detected` / `approval_bypass_risk` / `manager_budget_violation`).
- Slice 4: persistence + live wiring — vendor master (`VendorRecord`) with
  bank-change hold + independent verification, invoice-hash duplicate detection feeding
  `vendor_control_risk` in persisted plans, and funded-initiative outcome persistence
  (`FundedInitiativeOutcome`) with learning-safe classification. `[db]`-proven.
- Slice 3: working-capital engine (collection-gap survival, receivables/
  payables pressure), revenue-assurance signals (completed-not-paid, undeposited cash,
  excessive discount, refund spike, order/invoice mismatch), vendor/procurement
  controls (bank-change hold, quotes/benchmark/duplicate/related-party/equipment-
  payback), and funded-initiative outcome learning — all wired into the updated plan
  (+ `working_capital_risk` signal) and surfaced through persisted reassessments.

## COMPLETE (implemented + tested)

- Repository inventory + minimum-code justification.
- Budget mode classifier (7 modes), evidence-backed, deterministic. (unit-tested)
- Capital allocation engine (survival-first hierarchy, confidence/mode gating). (unit-tested)
- Confidence gate (recommendation strength + capped-range expression). (unit-tested)
- Spend governance (risk tiers, SOD/self-approval, split-spend, vendor-bank hold,
  new-vendor, proof gating, emergency exception). (unit-tested)
- Reassessment-trigger classifier (Section 4 taxonomy). (unit-tested)
- Dynamic updated owner plan composer (Section 7 contract; reuses collective engine). (unit-tested)
- Schema + migration (BudgetPeriod, BudgetLine, SpendEntry, BudgetReassessment,
  BudgetPlanSnapshot), validated + applied to PostgreSQL.
- DB-backed reassessment service: atomic snapshot versioning, idempotency by trigger,
  audit emission, ≥5 real mutation paths trigger reassessment. (db-tested)
- Mandatory dynamic proof scenario (GROW→EMERGENCY via real mutation). (db-tested)
- Workspace isolation. (db-tested)
- Owner guidance adapter + OWNER_VIEW read routes. (tested)
- Hostile fixture pack (9 scenarios) + targeted hostile unit assertions.
- Owner override: persistence, 8-class outcome classification, hard safety/legal
  block refusal (vendor-bank-unverified / statutory-reserve / unlawful action),
  override-triggers-reassessment, outcome closure. (unit + db-tested)
- Employee/manager budget-authority lifecycle: governed transitions + lawful-action
  guardrails (forbids wage deduction / unpaid overtime / termination / etc.),
  persisted + audited. (unit + db-tested)
- Write API routes: POST spend / override / authority — OWNER_MANAGE, workspace-
  scoped, Zod-validated, enforcement-tested.
- Working-capital engine: collection-gap survival gate (B2B 45-day case),
  receivables/payables pressure, inventory cash-lock. (unit + integration-tested)
- Revenue-assurance signals: completed-orders-without-payment, undeposited cash,
  excessive discount, refund spike, order/invoice mismatch. (unit + integration-tested)
- Vendor/procurement controls: unverified-bank-change payment hold, insufficient
  quotes, price-above-benchmark, duplicate invoice, related-party, equipment-without-
  payback. (unit + integration + `[db]` tested via persisted plan signal)
- Funded-initiative outcome learning: 7-class outcome + next-step + safe-for-learning
  flag (unverified never treated as success). (unit-tested)
- Underinvestment detection: harmful vs delayed vs good-savings vs cash-preservation
  across marketing/maintenance/training/staffing/service/QC/sales. (unit + integration-tested)
- Collusion/fraud risk indicators: self-approval, split-spend cluster, approver
  concentration, refund/discount clustering, delivery-without-payment — review-only
  language. (unit + integration-tested)
- Reconciliation evaluator: receipt≠verified, full proof+invoice+payment+bank match,
  mismatch/disputed handling → reconciliation_exception. (unit + integration + `[db]`-tested)
- Rolling 13-week cash forecast: base/downside/cash-stress scenarios with reserve-breach
  week + 7/30/90-day views + read route. (unit + `[db]`-tested)
- All 7 documentation files.

## PARTIAL (interface/foundation present; not fully operational)

- **Working-capital per-line ageing buckets**: the engine computes collection-gap
  survival + receivables/payables pressure from finance aggregates and owner terms;
  detailed ageing-bucket models (0–30/30–60/60–90) are not persisted. PARTIAL.
- **Vendor/procurement live POS/gateway feeds**: vendor master + invoice-hash store +
  duplicate detection + bank-verification hold are now persisted and `[db]`-proven
  (Slice 4); automatic quote/benchmark ingestion from external sources remains PARTIAL.
- **Revenue assurance live source wiring**: detection logic + signals are implemented
  and tested; live order/invoice/deposit feeds beyond finance aggregates are supplied
  per assessment, not auto-pulled from a POS/gateway. PARTIAL.
- **Owner UI (Budget & Profit Plan)**: OWNER_VISIBLE / PARTIAL. A client page
  (`src/app/(authenticated)/owner/budget/page.tsx`) consumes the existing routes and
  surfaces mode, confidence, what-changed, next best action, cash forecast, fund
  allocation, spend governance, accountability/authority, advisory actions, what-not-
  to-do, and owner override — with honest PARTIAL labels (advisory ≠ persisted task;
  confidence warnings; live-feed limits). Component-proven via RTL
  (`src/__tests__/components/owner-budget-plan.test.tsx`); **NOT browser-proven** (no
  live Playwright run executed here). Status: DYNAMIC_BUDGET_UI_OWNER_VISIBLE.

## MISSING / NOT CLAIMED

- Multi-currency consolidation; live bank-feed auto-ingestion; archetype-specific
  hostile packs beyond the generic set. Explicitly not claimed (no false "complete").

## OWNER_MODE_READY gate (Section 48) — NOT satisfied

Satisfied: inventory, min-code, reuse, schema/migration validated, workspace
isolation, mode classifier, capital allocation, reassessment engine + ≥5 triggers,
updated-plan, snapshots/versioning, cash/reserve/due-date safety, unit-economics gate,
growth/scale gates, profit-increase (non-cost-cut) logic, spend governance, SOD,
confidence gate, audit integration, guidance adapter, hostile fixtures, mandatory
dynamic proof, atomic/idempotent writes, documentation.

Added in Slice 2: owner-override persistence + outcome classification, employee
authority lifecycle, OWNER_MANAGE write routes.
Added in Slice 3: working-capital, revenue-assurance, vendor/procurement control
engines (wired + tested), funded-initiative outcome classifier.
Added in Slice 4: vendor master + invoice-hash duplicate detection + bank-verification
hold (persisted, `[db]`-proven), funded-initiative outcome persistence.
Added in Slice 5: underinvestment detection + collusion/fraud risk indicators (wired).
Added in Slice 6: reconciliation evaluator + rolling 13-week forecast/scenarios.
Added in Deep Action-System Linkage (`DYNAMIC_BUDGET_ACTION_LINKAGE_DB_PROVEN`): advisory
budget `generatedActions` are now persisted/linked as governed owner execution tasks
(`OwnerBudgetAction`) reusing the SHARED owner action FSM
(`@/domain/founder-recovery/action-status`) — no parallel engine. Reassessment upserts by
`(workspaceId, businessId, sourceKey)` (create/link, never duplicate, never reopen
closed); completion runs the shared FSM with required evidence and records a
`FundedInitiativeOutcome` (budget learning). New routes
`GET /api/owner/budget/actions` (OWNER_VIEW) + `PATCH /api/owner/budget/actions/[actionId]`
(OWNER_MANAGE); `/owner/budget` UI shows persisted execution tasks distinct from advisory
actions. Proven by 8 `[db]` tests + 17 non-DB tests (mapping/idempotency/route/reuse);
100/100 owner-budget + owner-finance regression green. Browser/E2E remains deferred.
Added in Runtime RBAC proof (`DYNAMIC_BUDGET_RBAC_RUNTIME_PARTIAL`, PR #44): runtime
authorization is proven through the real route → canonical wrapper for both allowed and
denied actors (unauthenticated, no-membership, no-OWNER_VIEW read, no-OWNER_MANAGE write,
authorized read/write, cross-workspace) — PARTIAL only because no role grants OWNER_VIEW
without OWNER_MANAGE (gradient actor not expressible).
Added in Working-Capital Ageing (`DYNAMIC_BUDGET_WORKING_CAPITAL_DB_PROVEN`, PR #45): receivable/
payable ageing buckets (current/0-30/31-60/61-90/90+) via a pure engine + a minimal
manual/import-ready `OwnerWorkingCapitalItem` table, fed into the EXISTING reassessment
(overdue payables → real obligation → mode/allocation react; collection gap → gap-survival
engine; ageing signals/actions/restrictions in the plan). Emits receivables/payables ageing
risk, collection_first_required, vendor_pressure_risk, cash_conversion_risk,
profitable_but_cash_negative, growth_blocked_by_working_capital, and data stale/insufficient
signals. Proven by 16 unit + 7 `[db]` tests; no-items regression unchanged. Live feeds still
deferred (manual/import-ready, confidence never VERIFIED).
Added in Archetype Budget Packs (`DYNAMIC_BUDGET_ARCHETYPE_PACKS_LOGIC_PROVEN`, PR #46): laundry /
housekeeping / generic-fallback budget packs (`archetype-packs.ts`) that reason with the
business type's cost drivers, leakage patterns, growth levers and scale gates. The packs
emit archetype-specific signals + generated actions + restrictions + what-not-to-do via the
existing `composeUpdatedPlan` pipeline, and a hard economics gate (laundry delivery / HK
travel) defers offensive candidates through the EXISTING allocation result (no parallel
engine). Generic falls back safely; a specific archetype with no operational metrics emits
`archetype_data_insufficient` (no fabricated advice). Proven by 18 deterministic logic +
plan-integration tests; generic-plan regression unchanged. No schema; archetype operational
metrics are manual/import-ready and not yet persisted (deferred).
Added in Working-Capital × Archetype Cross-Integration
(`DYNAMIC_BUDGET_WC_ARCHETYPE_INTEGRATION_LOGIC_PROVEN`): a pure helper
(`archetype-working-capital.ts`) combines the ageing assessment with the archetype packs for
business-specific cash-cycle guidance — laundry B2B profit-but-cash-negative / low-margin +
delayed receivable / delivery + severe ageing / downtime-reserve protection; housekeeping
recurring-contract cash risk / payroll-collection conflict / travel + slow collection /
underpriced-recurring repricing. 5 new signals; growth deferred through the EXISTING
allocation; generic stays safe; each side unchanged when the other input is absent. Proven by
15 deterministic plan-integration tests; 166/166 owner-budget regression. No schema. Full
reassessBudget DB proof of the combined path awaits persisted archetype metrics (next slice).

Added in Persisted Archetype Operational Metrics (`DYNAMIC_BUDGET_ARCHETYPE_METRICS_RUNTIME_PROVEN`):
workspace-scoped `OwnerArchetypeMetric` table + service + `GET/POST /api/owner/budget/archetype-metrics`
routes (OWNER_VIEW/OWNER_MANAGE, canonical-enforced). Persisted manual/import-ready metrics derive
the archetype-pack signal inputs and feed the REAL reassessment, so laundry/housekeeping packs +
working-capital × archetype cross-integration now run DB-driven (chemical/B2B/downtime, travel/
recurring guidance); missing or stale metrics fall back to `archetype_data_insufficient`. Proven by
6 unit + 7 `[db]` + 6 runtime-RBAC route tests; 186/186 regression. Live feeds still deferred
(manual/import-ready, confidence never VERIFIED).

Added in Working-Capital Route/UI + Manual Entry (`DYNAMIC_BUDGET_WORKING_CAPITAL_ENTRY_UI_OWNER_VISIBLE`):
`GET/POST /api/owner/budget/working-capital` (OWNER_VIEW/OWNER_MANAGE, canonical-enforced,
reusing the PR #45 service) + a `/owner/budget` working-capital section showing receivable/
payable ageing buckets (computed client-side via the same pure ageing engine), collection-
first / vendor-pressure / growth-blocked warnings, highest-risk counterparties, a manual
entry form, and honest "manual/import-ready, not a live feed" labelling distinct from the
governed recommendation. Proven by 4 component + 5 runtime-RBAC route tests; 199/199
regression. Browser/E2E deferred (component+route proven, not browser-proven).

Added in Manual/Import-Ready Data Input Layer (`DYNAMIC_BUDGET_IMPORT_READINESS_DB_PROVEN`):
a single pure source-confidence classifier (`import-source.ts`) unifying how the manual/
import-ready surfaces (spend entries, working-capital items, archetype metrics) are judged —
MANUAL/IMPORT ≤ PARTIAL, only RECONCILED → VERIFIED, stale downgrades, missing/unknown →
data-insufficient; reused by the archetype-metric derivation for staleness. No new table (a
broad source registry would duplicate the per-domain models). Proven by 8 unit + existing
`[db]` reuse; 201/201 regression. No live-feed overclaim.

Added in Outcome Learning Loop (`DYNAMIC_BUDGET_OUTCOME_LEARNING_DB_PROVEN`): a pure
`classifyBudgetOutcome` (wrapping the existing initiative-outcome classifier) adds disposition
(repeat/modify/escalate/block) + confidence impact (raise/maintain/lower_recommendation/
lower_data) with prior-failure awareness, wired into the real `updateBudgetAction` completion
to record outcome/cause/disposition into FundedInitiativeOutcome + audit. Honest attribution:
missing data → lower DATA confidence; owner-override/external → not the recommendation's fault;
repeated failure → block (not blindly repeated); no-evidence completion refused. Proven by 9
unit + 8 `[db]` tests; 218/218 regression. No schema; reuses action-linkage (no duplicate engine).

Added in Final Hostile Audit (`DYNAMIC_BUDGET_OWNER_PILOT_READY_HEADLESS`): a deterministic
20-scenario adversarial `[db]` suite (`dynamic-budget-hostile-audit.db.test.ts`) probing the
whole module through real service paths — tenancy isolation, reassessment idempotency +
concurrency safety, override hard-blocks, evidence-gated completion, authority-transition
legality, adaptive mode flips, spend-governance thresholds, outcome-learning block-on-repeat,
data-confidence honesty, archetype input validation, audit emission, advisory cross-module
routing. 20/20 pass; 252/252 regression; `tsc` 0; `lint:ratchet` PASS. No source/schema change
(verification-only). See `DYNAMIC_BUDGET_FINAL_HOSTILE_AUDIT.md` and
`DYNAMIC_BUDGET_COMPLETION_CLOSEOUT.md`. **Pilot-ready headless only — NOT OWNER_MODE_READY.**

Added in Cross-Module Signal Wiring (`DYNAMIC_BUDGET_CROSS_MODULE_SIGNALS_PARTIAL`): a pure
routing map (`signal-routing.ts`) maps every `BudgetSignalType` to a consumption decision
(compile-time exhaustive via `satisfies Record<…>`), and a router service
(`signal-router.service.ts`, wired into `reassessBudget`) delivers them — financially-material
signals trigger a real finance re-diagnosis (latest snapshot, lazy import, reusing the finance
precedent) whose refreshed cycle feeds business-condition/health; governance/override/data-
quality signals are consumed by the audit ledger; all pull-model domains (sales, operations,
marketing, staffing, scale readiness, external procurement) get a safe budget-side audit signal
with the consumption gap recorded (not faked). Idempotent (no duplicate signals per
reassessment), workspace-scoped, advisory (never fails reassessment), loop-safe. Proven by 7
unit + 7 `[db]` tests; 232/232 regression. No schema, no new module. **PARTIAL** because only
the finance/health path is a real push consumer; the rest are documented gaps.

Not satisfied (blocks READY): live revenue-assurance / quote-benchmark source feeds
(POS/gateway/external/bank), archetype-metric entry UI form, the OWNER_VIEW-without-
OWNER_MANAGE RBAC gradient actor, a home-services budget pack, push-consumption interfaces in
the pull-model domains (sales/operations/marketing/staffing/scale), and Browser/E2E proof.

## Verification

```
npx prisma validate                     # valid
npx prisma migrate status               # up to date (local PostgreSQL 16)
npx tsc --noEmit                        # 0 errors
TEST_WITH_DB=true npx vitest run \
  src/__tests__/owner-budget src/__tests__/services/owner-budget  # all passed (incl. db proofs + action linkage)
npm run lint:ratchet                    # LINT_RATCHET_PASS (no new debt)
```

DB proof is genuine PostgreSQL (local `opsiq_dev`, all migrations incl. the new
budget migration applied). The configured Neon endpoint remains unreachable from the
container (pre-existing infra gap), so local PostgreSQL is used — not SQLite.
