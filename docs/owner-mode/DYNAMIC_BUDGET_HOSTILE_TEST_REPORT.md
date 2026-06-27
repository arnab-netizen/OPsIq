# Dynamic Budget — Hostile Test Report

Adversarial (not happy-path) tests. All assert exact classifications + key
recommendations, not merely that a function returns something.

## Test files & results

| File | Layer | Tests | Result |
|---|---|---|---|
| `src/__tests__/owner-budget/engine.test.ts` | pure logic + hostile fixtures | 26 | PASS |
| `src/__tests__/owner-budget/routes.test.ts` | route enforcement | 2 | PASS |
| `src/__tests__/services/owner-budget/budget.service.db.test.ts` | `[db]` service + dynamic proof | 5 | PASS |

Commands:
```
npx vitest run src/__tests__/owner-budget/engine.test.ts          # 26 passed
npx vitest run src/__tests__/owner-budget/routes.test.ts          # 2 passed
TEST_WITH_DB=true npx vitest run \
  src/__tests__/services/owner-budget/budget.service.db.test.ts   # 5 passed (PostgreSQL)
```

## Hostile fixture pack (`tests/fixtures/owner-mode/budget-hostile-scenarios.ts`)

| Scenario | Expected mode | Key proof |
|---|---|---|
| revenue_up_profit_down | PROFIT_INCREASE | does not celebrate revenue; surfaces leakage fix |
| cash_safe_but_committed_shortfall | EMERGENCY | committed obligation makes "safe" cash unsafe → freeze |
| owner_wants_scale_early | STABILIZE | refuses to scale when cash weak / owner-dependent |
| discount_kills_margin | PROFIT_INCREASE | recommends pricing/discount fix, not more spend (anti-blind-cost-cut) |
| low_data_quality | DATA_INSUFFICIENT | cautious; high-risk recommendations blocked |
| healthy_growth_ready | GROW | funds capped test with kill rule |
| scale_ready_verified | SCALE | only at VERIFIED confidence + repeatable demand |
| control_breach_forces_emergency | EMERGENCY | control breach overrides healthy cash |
| growth_blocked_when_overloaded | STABILIZE | refuses growth when workload/quality strained |

## Targeted hostile unit assertions

- Confidence gate blocks scale/hiring/capex/new-branch/major-marketing below VERIFIED;
  allows capped tests at PARTIAL but not controlled growth.
- Capital allocation funds statutory/survival before growth and defers offensive
  spend in STABILIZE; blocks scale spend below VERIFIED.
- Spend governance flags self-approval (SOD → CRITICAL), holds vendor-bank-change
  even under emergency, detects split-spend, auto-logs trusted small recurring spend.
- DATA_INSUFFICIENT plan sets `highRiskBlocked` and decision `COLLECT_EVIDENCE`.

## Mandatory dynamic proof scenario (Section 43) — PASS

`[db]` test "MANDATORY DYNAMIC PROOF":
1. Healthy finance snapshot + growth budget line → **GROW**, referral spend **FUND**ed.
2. A committed payroll obligation (₹420k due 5d) recorded via the real
   `recordSpendEntry` mutation path.
3. Reassessment triggers **automatically** from that mutation.
4. Mode flips **GROW → EMERGENCY**; decision **BLOCK**.
5. Prior growth spend is now **DEFER/BLOCK**.
6. A **cash-protection action** is generated.
7. The previous plan snapshot is **preserved** (GROW, `isCurrent=false`); exactly one
   current snapshot remains.
8. The owner guidance adapter exposes the updated next-best-action ("freeze…") and a
   higher version number.

## Coverage notes (honest)

The §42D list enumerates 30 hostile scenarios. This slice implements 9 deterministic
fixtures + targeted unit assertions covering the core governance behaviours (mode
flips, confidence gating, SOD/split/self-approval/vendor-bank, anti-blind-cost-cut,
data-insufficient caution, scale gating, dynamic reassessment). The remaining
scenarios (e.g. duplicate-invoice proof hashing, collusion-pair clustering, B2B
45-day working-capital gating, revenue-leakage matching) require the PARTIAL surfaces
(working-capital line items, revenue assurance, vendor/collusion detectors) and are
tracked in the Implementation Status as not-yet-operational. They are NOT claimed.
