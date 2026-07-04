# Module 8 (Strategy & Scenario Planning) — Slice 1: Engine — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic scenario engine: given one
strategic option's inputs (revenue change, cost change, investment, time-to-impact,
risk level, cash available), it computes the option's economics (base/best/worst
profit delta, ROI, payback, affordability, break-even) + bounded health/risk/
opportunity/data-confidence scores + a 5-state attractiveness ladder. No DB/API/UI.
Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Seven owner domains are proven (recovery/finance/cashflow/sales/operations/sop/
marketing). Per execution.md §15 / §22 Phase 9 the next module is **Strategy &
Scenario Planning** (domain `strategy`, already reserved in the spine). Per the
8-slice contract, Slice 1 is the deterministic engine — the foundation the detector
(Slice 2) and planner (Slice 3) build on. It improves consultant-level
decision-support: choosing between options on numbers + risk, not vibes.

## 2. Files created

`src/domain/owner-strategy/`:
- `types.ts` — `StrategySnapshotInput` (one option), `StrategyDerivedMetrics`,
  states `STRONG_GO/GO/MARGINAL/RISKY/AVOID`, risk levels `low/medium/high`, tiers.
- `thresholds.ts` — ROI/payback/affordability thresholds (generic + industry
  overrides) + risk-level spread/base-score tables.
- `data-confidence.ts` — currency validation + missing-critical detection
  (expectedRevenueChange, costChange, investmentRequired) + staleness.
- `metrics.ts` — `computeStrategyMetrics` orchestrator + pure functions:
  base/best/worst monthly profit delta, `roiAnnualPct`, `paybackMonths` (0 for
  no-capital moves, null when it never pays back), `affordabilityRatio`,
  `breakEvenRevenueDelta`; deterministic risk/opportunity/health scoring and the
  state/tier ladder.
- `index.ts` — barrel.

Test: `src/__tests__/owner-strategy/metrics.test.ts` (16 tests).

## 3. Honesty / governance

- Deterministic, no LLM. Negative deltas are valid inputs (a loss-making option is
  not hidden); ROI may be negative; `paybackMonths` is null when an investment
  never recovers (never faked as a number).
- Missing/invalid inputs → `null` outputs + an explicit missing-critical list;
  nothing invented. Scores clamped to [0,100]; `num()` fail-closed on NaN/Infinity.
- New isolated domain — no existing file modified.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-strategy/` | 16 passed |
| `npx eslint src/domain/owner-strategy src/__tests__/owner-strategy` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 2 — detector**
(scenario risk/opportunity findings → ranking → `diagnoseStrategySnapshot` → spine
`DomainScore { domain: "strategy" }`). Migration gate is Slice 4. Public/SaaS stays
frozen.
