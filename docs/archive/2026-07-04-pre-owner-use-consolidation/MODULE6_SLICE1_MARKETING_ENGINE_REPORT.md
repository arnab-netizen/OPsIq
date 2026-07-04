# Module 6 (Marketing & Growth Intelligence) — Slice 1: Engine — Report

Status: **BUILT + LOCALLY VERIFIED.** Pure deterministic marketing engine
(types → thresholds → data-confidence → metrics) producing bounded composite
scores, a 5-state growth ladder, and honest missing-data accounting. No DB/API/UI.
Module 1 + all proven modules untouched. Public/SaaS frozen.

## 1. Why this is the correct next slice

Six owner domains are proven (recovery + finance + cashflow + sales + operations +
sop). Per execution.md §13 / §22 Phase 8 the next owner module is **Marketing &
Growth Intelligence** — the growth lens that decides *which marketing action to
take*, not vanity metrics. Per the 8-slice contract, Slice 1 is the deterministic
engine the detector/planner/persistence build on.

## 2. Files created

`src/domain/owner-marketing/`:
- `types.ts` — `MarketingSnapshotInput` (spend, revenue, leads, inquiries, orders,
  newCustomers, paid/organic leads, campaigns run/with-followup, content, coupons,
  referrals, walk-ins), `MarketingDerivedMetrics`, `MARKETING_STATES`
  (COMPOUNDING/GROWING/FLAT/LEAKING/WASTING), tiers.
- `thresholds.ts` — generic ROI/conversion/referral/follow-up/organic-share bars +
  per-industry-template overrides (generic fallback).
- `data-confidence.ts` — currency validation + critical (`marketingSpend`,
  `leads`, `orders`) / important field accounting; stale-period penalty.
- `metrics.ts` — `num()` fail-closed helper; cost-per-lead, cost-per-order,
  campaign ROI (may be negative — wasted spend not hidden), lead/inquiry
  conversion, referral rate, organic share, campaign follow-up; composite
  health/risk/opportunity/dataConfidence (0..100); 5-state ladder + tier;
  `computeMarketingMetrics` orchestrator.
- `index.ts` — barrel.

Test: `src/__tests__/owner-marketing/metrics.test.ts` (17 tests).

## 3. Honesty / governance

- Pure + deterministic (no LLM, no I/O). Ratio metrics return `null` when not
  computable; nothing invented. Missing critical inputs are listed; confidence
  drops accordingly.
- Composite scores clamped to [0,100]; ROI is allowed negative so wasted spend is
  visible, not masked. Marketing is a GROWTH domain (its risk does not threaten
  survival/execution; its opportunity feeds growthOpportunityScore in later
  slices). Models only business-operational marketing variables.

## 4. Verification (local)

| Gate | Result |
|---|---|
| `npx vitest run src/__tests__/owner-marketing/` | 17 passed |
| `npx eslint src/domain/owner-marketing src/__tests__/owner-marketing` | clean |
| `npm run lint:ratchet` | LINT_RATCHET_PASS (1500/1153 — no increase) |

## 5. Gate status

**No gate reached** (pure domain code + tests). Next: **Slice 2 — detector**
(risk/opportunity findings → ranking → `diagnoseMarketingSnapshot` → spine
`DomainScore { domain: "marketing" }`). Public/SaaS stays frozen.
