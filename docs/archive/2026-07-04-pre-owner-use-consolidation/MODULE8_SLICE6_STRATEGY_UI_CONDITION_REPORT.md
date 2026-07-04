# Module 8 (Strategy & Scenario Planning) — Slice 6: UI + Command-Center Integration — Report

Status: **BUILT + LOCALLY VERIFIED + MERGED TO MAIN.** Owner strategy dashboard
page (`/owner/strategy`) over the Slice-5 API + the strategy `DomainScore` wired
into the cross-domain Business Condition Profile. The command center now rolls up
finance + recovery + cashflow + sales + operations + sop + marketing + **strategy**.
Migration already applied (Module 8 Strategy Migration #1, staging), so the
`owner_strategy_*` command-center read is safe. Module 1 + all proven modules
untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Slice 5 (API + services) is proven and the migration is applied. Per the 8-slice
contract, Slice 6 is the UI + command-center integration — the owner-facing
scenario evaluator plus the cross-domain rollup, which is where the
`owner_strategy_*` command-center read is introduced (now safe because the tables
exist).

## 2. Files created / changed

- `src/app/(authenticated)/owner/strategy/page.tsx` — owner strategy/scenario
  dashboard (business create/select, scenario form with option name + risk-level
  select + 8 numeric fields where revenue/cost/staff deltas may be negative,
  evaluate scenario, action status transitions via the shared Module 1 machine,
  before/after verification, evaluation history; 5-state ladder badge
  STRONG_GO/GO/MARGINAL/RISKY/AVOID). No business logic in the page — canonical
  `/api/owner/strategy/*` only.
- `src/services/owner-condition/business-condition.service.ts` — pure
  `strategyCycleToDomainScore` + `strategyActionRowToOwnerAction` mappers + an
  `ownerStrategyCycle` read in the existing Promise.all. Strategy is
  decision-support — its risk scores the option, not survival/execution; a strong
  strategic action can still be the cross-domain next action.
- `src/app/(authenticated)/owner/page.tsx` — Strategy header link + `strategy →
  /owner/strategy` in `DOMAIN_LINK`.
- `src/__tests__/owner-condition/business-condition.test.ts` — strategy → spine
  mapper block (clamping, schema validity, decision-support rollup proof).

## 3. Honesty / governance

- No business logic in the page; command-center read is read-only; no Module 1 /
  other-domain table or route modified.
- The strategy `DomainScore` validates against the spine schema; the rollup is
  proven (strategy risk does not raise survival risk).

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run owner-condition + owner-strategy` | 83 passed / 8 [db]-skipped |
| `npx eslint` (service + owner page + strategy page + condition test) | clean |
| `npm run build` | REAL_EXIT=0; `/owner/strategy` page + 9 strategy API routes registered |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (changed_file_lint_errors 0) |
| `npm test` (full suite) | 5914 passed / 199 skipped / 0 failed |

## 5. Gate status

**No gate reached by this slice** (UI + read integration). Merged to `main` (the
command-center read is safe because the migration is applied). Next is **Slice 7 —
deployed runtime proof** (HTTP smoke script + manual workflow → create and stop),
then Slice 8 (audit). Public/SaaS stays frozen.
