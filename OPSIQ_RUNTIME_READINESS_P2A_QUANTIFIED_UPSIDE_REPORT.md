# OpsIQ Runtime-Readiness — P2-A Quantified-Upside Report

> First P2 slice. Closes blocker **B3** (the "highly profitable" gap): the runtime already computed real financial
> figures — cash runway, monthly net, receivables risk — inside `deriveCalcs`, then **dropped** them at
> `runOwnerAdvice`'s return boundary, so the owner only ever saw canned qualitative strings. This slice threads the
> already-computed numbers through to a **read-only "Supporting figures"** block on the owner supervisor summary. It
> invents no math and surfaces a number ONLY when it was derived from real persisted inputs.

## Branch & base
- Branch: `claude/runtime-readiness-p2a-quantified-upside`
- Base HEAD: `b793792` (main; after P1-A #81 merged).

## The gap (B3)
- `deriveCalcs` (`business-math.ts`) runs in the LIVE owner path (via `advise` inside `runOwnerAdvice`) and produces
  real runway / net-burn / receivables numbers from persisted `OwnerFinancialSnapshot` / `OwnerCashflowSnapshot` data.
- But `OwnerAdviceResult` never returned those numbers and `WholeBusinessPlan` had no field for them, so they were
  discarded before the view/`SupervisorSummary` were built. The owner received only `financeCashImpact` /
  `marginPricingImpact` prose — never a quantified figure.

## What was implemented (thread-through only — no new engine, no fabrication)
- **`business-math.ts`**: `CaseCalcs` now also carries `monthlyRevenue` and `monthlyCost` (both already computed as
  locals). `monthlyCost` is `null` when NO cost component was supplied, so a bare `0` can never masquerade as real data.
- **`supervisor-summary.ts`** (pure domain): new `SupportingFigure` type + `buildSupportingFigures(calc)` — maps only
  real, non-null numbers to owner-facing figures (cash runway, monthly net [needs BOTH revenue and cost], receivables
  ratio, capacity utilization). It **deliberately excludes** contract-margin and net-ROAS: those are
  placeholder/default-contaminated in the live path today (the margin constants are the separate **M3 / P2-B** concern),
  so surfacing them would fabricate a number. `SupervisorInput` gained an optional `calcs`; `SupervisorSummary` gained
  `supportingFigures` (empty for every pre-existing caller — behaviour otherwise identical).
- **`owner-advice-runtime.service.ts`**: `OwnerAdviceResult` now returns `supportingCalcs: CaseCalcs` (the numbers the
  runtime already computed for the live case).
- **`owner-whole-business-plan.service.ts`**: maps `result.supportingCalcs` into the `buildSupervisorSummary` input's
  `calcs`, so the figures flow into the view's `supervisor` block.
- **`SupervisorSummary.tsx`**: renders a read-only **"Supporting figures (computed from your real records)"** list
  under Expected impact, each line labelled with value, unit, and the plain basis. Shown only when at least one real
  figure exists.

## Files changed
- CHANGED `src/behavioral-validation/expert/business-math.ts` (expose `monthlyRevenue`/`monthlyCost`)
- CHANGED `src/domain/owner-mode/supervisor-summary.ts` (`SupportingFigure` + builder + pass-through)
- CHANGED `src/services/owner-mode/owner-advice-runtime.service.ts` (`supportingCalcs` on result)
- CHANGED `src/services/owner-mode/owner-whole-business-plan.service.ts` (map calcs into supervisor input)
- CHANGED `src/components/owner/SupervisorSummary.tsx` (render read-only figures)
- NEW `src/__tests__/owner-mode/supporting-figures.test.ts`
- CHANGED `src/__tests__/components/owner-supervisor-summary.test.tsx` (render + omit assertions)
- NEW `OPSIQ_RUNTIME_READINESS_P2A_QUANTIFIED_UPSIDE_REPORT.md`

## DB / migration changes
**None.** **API:** none (data already in the plan result). **UI:** renders the threaded numbers.

## Tests / checks run (local)
- **NEW** `supporting-figures.test.ts` — **4/4**: builder surfaces every real figure with correct value/unit and only
  allowed keys; omits any figure whose input is absent (null / non-finite / one-sided monthly-net → nothing);
  `buildSupervisorSummary` threads `calcs` and emits none when absent; **live** `runOwnerAdvice(A1)` surfaces the real
  `monthly_net` (₹205,000 = 320,000 − 115,000), honestly leaves runway `null` (A1 runs a paper surplus), and never
  emits contract-margin / net-ROAS.
- **Component** `owner-supervisor-summary.test.tsx` — **5/5** (added: renders the supporting-figures block with values;
  omits the block when empty).
- No-regression (Postgres): `behavioral-validation` + `owner-mode` + `services/owner-mode` → **1090/1090** (no scenario
  disposition changes).
- `tsc --noEmit` ✓ · eslint (all changed files) 0/0 ✓ · `lint:ratchet` PASS (2155 = 2155; warnings 1263→1261).

## Honest scope (not overclaimed)
- Surfaces figures the runtime **already computed from real data**; fabricates nothing. When the inputs are absent, no
  number appears — the block simply does not render.
- **Not** surfaced (by design, this slice): break-even (computed nowhere live — a genuine gap noted for a later slice),
  contract-margin and net-ROAS (placeholder/default-contaminated until **M3 / P2-B** removes the hardcoded 18/22/30
  constants). Wiring the orphaned in-memory growth engines is explicitly out of scope (would be a duplicate engine).

## Classification
**`P2_QUANTIFIED_UPSIDE_SURFACED`** (DB-backed no-regression + unit/live/component proof): the owner now receives
quantified, real-data-derived supporting numbers alongside the qualitative plan; missing inputs yield no fabricated
figure; no gate weakened, no engine duplicated.

## Merge recommendation
Open PR; drive CI green (unit + DB lanes) before merge. No new browser spec ships, so there is no new
`owner-pilot-e2e` surface to observe. After merge, next is **P2-B (M3 — remove the hardcoded 18/22/30 margin
constants)**, which unlocks honestly surfacing contract-margin later. Public SaaS / billing / launch / integrations
remain out of scope and blocked.
