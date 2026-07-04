# OpsIQ Runtime-Readiness — P2-B Margin-Constants Report

> Second P2 slice. Closes major **M3** (CLAUDE.md "no placeholders in the live path"): a negative-margin business had
> **hardcoded** `consideredRate=18; fullyLoadedCost=22; paymentTermsDays=30` injected into the live plan path, so the
> below-margin gate — and any contract-margin figure — derived from planted constants rather than the owner's real
> numbers. This slice replaces the injection with the owner's **real** revenue/cost and omits payment terms entirely
> (no owner snapshot stores them), so the below-margin constraint resolves from actual data with nothing fabricated.

## Branch & base
- Branch: `claude/runtime-readiness-p2b-margin-constants`
- Base HEAD: `a6c5f99` (main; after P2-A #82 merged).

## The gap (M3)
`src/services/owner-mode/owner-context-derivation.ts` (old lines 143–148): when `belowMargin` (a REAL signal —
`grossMargin < 0` from real `revenue`/`costOfGoods`), it planted `consideredRate=18`, `fullyLoadedCost=22`,
`paymentTermsDays=30`. Those three fake numbers were the ONLY thing that let the below-margin constraint bind
(`arbitration.ts:58` requires `contractMarginAfterTerms <= 0`, which needs a rate AND a cost), and they also fed the
`contractMarginAfterTerms` trace. That is a placeholder in the live path — the exact CLAUDE.md violation.

## What was implemented (real data, no fabrication)
- **`owner-context-derivation.ts`**: the injection is replaced by the owner's **real** figures. Because `belowMargin`
  by construction means `costOfGoods > revenue > 0`, both real numbers are present, so:
  ```ts
  if (belowMargin && finance?.revenue != null && finance.costOfGoods != null) {
    numbers.consideredRate = finance.revenue;      // real realised rate basis
    numbers.fullyLoadedCost = finance.costOfGoods; // real cost basis
  }
  ```
  `contractMarginAfterTerms = revenue − costOfGoods < 0` ⇔ `belowMargin`, so the constraint binds exactly as before —
  now from actual data. **Payment terms are omitted** (no owner snapshot stores them); the gate relies on the real
  negative margin, not a fabricated financing leg.

## Why this is safe (traced before editing)
- The below-margin binding (`arbitration.ts:58`) uses only the **sign** of `contractMarginAfterTerms`; real
  `revenue − costOfGoods` is negative for every below-margin business, so the constraint still binds.
- Rate/cost stay **present**, so `deriveCalcs.missingForDecision` does NOT switch the case onto a missing-data path
  (disposition unchanged), and the `margin_pricing` / `opportunity_contract` domain flags stay on (they also key on
  `decisionCategory`).
- Dropping `paymentTermsDays` only affects advice-quality validation checks (`working_capital_terms_ignored`) and the
  `working_capital` context flag — neither feeds `unsafeCount` or the dominant constraint.
- The contract-margin figure is **not** surfaced to the owner (P2-A deliberately excluded it), so no misleading number
  reaches the UI.

## Files changed
- CHANGED `src/services/owner-mode/owner-context-derivation.ts` (real revenue/cost, no planted constants)
- CHANGED `src/__tests__/services/owner-mode/owner-context-derivation.test.ts` (M3 assertions)
- NEW `OPSIQ_RUNTIME_READINESS_P2B_MARGIN_CONSTANTS_REPORT.md`

## DB / migration changes
**None.** **API:** none. **UI:** none.

## Tests / checks run (local, Postgres)
- **M3 unit tests** (added to `owner-context-derivation.test.ts`) — **8/8** file total: a below-margin business feeds
  real `consideredRate=200000` / `fullyLoadedCost=240000` (never 18/22), plants no `paymentTermsDays`, and keeps
  `revenue < fully-loaded cost`; a profitable business plants no rate/cost/terms at all.
- **Binding preserved**: `owner-scenario-constraints.test.ts` — **11/11** (the `bad_contract` scenario, whose rows carry
  only `revenue: 200000, costOfGoods: 240000`, still resolves `dominantConstraint === "below_margin"`, `unsafeCount 0`).
- No-regression (Postgres): `behavioral-validation` + `owner-mode` + `services/owner-mode` → **1092/1092** (no scenario
  disposition changes).
- `tsc --noEmit` ✓ · eslint (changed files) 0/0 ✓ · `lint:ratchet` PASS (2155 = 2155; warnings 1263→1261).
- Grep-verified no residual `18/22/30` margin injection remains in `src/services` or `src/domain` live paths.

## Honest scope (not overclaimed)
- Removes the placeholder margin constants from the live plan path; the below-margin gate now resolves from real
  revenue vs cost. Owner snapshots have no per-unit rate or payment-terms field, so those are honestly omitted rather
  than planted (per-unit derivation from `orderCount` is possible later but unnecessary — the aggregate sign is the gate
  signal and is correct today).
- With M3 closed, surfacing a real contract-margin figure to the owner is now unblocked, but that is a **separate later
  slice** — this PR does not add it.

## Classification
**`P2_LIVE_PATH_PLACEHOLDER_MARGIN_REMOVED`** (DB-backed no-regression + unit proof): no hardcoded margin constants
remain in the live path; below-margin still binds from real data; no gate weakened; no disposition changed.

## Merge recommendation
Open PR; drive CI green (unit + DB lanes) before merge. No new browser spec, so no new `owner-pilot-e2e` surface. After
merge, next is **P3-A (B6 + M7 + M9 — learning store write-only / duplicate subsystem / outcome loop)**. Public SaaS /
billing / launch / integrations remain out of scope and blocked.
