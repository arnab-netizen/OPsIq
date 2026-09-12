# Real-Business Profit-Leak Simulation Report

**Test:** `src/__tests__/owner-mode/profit-leak-radar-simulation.db.test.ts` (DB-backed, no mocks).

## Scenario — "Sparkle Laundry"
Seeded a day with heavy discounting (5000 of 20000 revenue = 25%), 4 complaints, weak repeat rate
(40 new / 10 repeat), and 2 owner reviews pending.

## Result
- The live Owner Now View ran the radar and returned **`DISCOUNT_LEAK`** as the top profit leak,
  reporting the **real 5000 discount figure** (range 0..5000) with the note that the recoverable
  portion is owner judgment — **no fabricated saving**. It is **owner-approval-required**, with a
  specific corrective action (cap discretionary discounts + reprice the most-discounted line), a
  success metric (discount-to-revenue ratio falls without losing key volume), a stop-loss, and a
  reassessment trigger.
- Deterministic across two consecutive live reads (same type + leakScore).
- A clean workspace returned **`DATA_INSUFFICIENT`** with exact missing data (no fabricated leak) and
  did not see the laundry's review queue (workspace isolation).

## Asserted
Top leak identified · specific corrective action · correct owner-approval · success metric ·
stop-loss · reassessment trigger · owner-visible · no generic advice · no fabricated margin/ROI ·
workspace isolation.
