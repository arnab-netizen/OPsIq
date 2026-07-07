# Crisis Fixture Report — PASS 32

**Date:** 2026-07-07 · **Method:** controlled multi-failure crisis fixtures → survival/recovery plan → governed bridge. Controlled fixtures only.

## Scenarios (10)
laundry, housekeeping, property, franchise, SaaS, tender, B2B, collective collapse, unrecoverable/near-insolvent, clean control. Each crisis carries multiple simultaneous failures (cash, revenue, customer, quality, operations/vendor, staff/capacity, owner overload, missing data, capacity constraint, a growth temptation, and legal/reputation/tender risk where applicable).

## Survival decision per scenario (deterministic)
- laundry → CASH_PROTECTION_REQUIRED; B2B growth blocked; unit-economics data task; owner-gated discount.
- housekeeping → CUSTOMER_RECOVERY_REQUIRED; inspection/SOP + capacity data before the commercial lead.
- property → CUSTOMER_RECOVERY_REQUIRED (maintenance/reputation); legal/high-spend owner-gated; vacancy marketing blocked.
- franchise → CUSTOMER_RECOVERY_REQUIRED; branch audit/SOP; marketing blocked until brand/quality stabilised.
- SaaS → CUSTOMER_RECOVERY_REQUIRED; product/support/onboarding stabilization; **launch frozen**; no fake MRR.
- tender → VALIDATION_BEFORE_GROWTH (owner-gated); eligibility/docs/cost data; **no auto-submit / no spend**.
- B2B → CUSTOMER_RECOVERY_REQUIRED; capacity/cost validation before any outreach (draft-only, owner-approved).
- collective collapse → CASH_PROTECTION_REQUIRED; stop-loss/cash/customer/quality first; growth blocked.
- unrecoverable → **UNRECOVERABLE_UNDER_CURRENT_CONSTRAINTS**; restructure / controlled-shutdown review + urgent owner/expert decision; no fake optimism.
- clean → null (nothing fabricated).

## Recovery ladder
Every crisis produces ordered recovery milestones (stop-loss → measure cash → correct customer/quality with proof → resolve operations → reduce owner load → stabilization gate) each with evidence + reassessment, and a thrive gate that stays **BLOCKED** until stabilization is proven, cost/capacity data exists, and the owner approves.

## Safety
No fabricated financials/optimism; survival outranks growth everywhere; owner/evidence gates hold; staff→training not blame; unsafe external actions blocked; no hidden score. See `CRISIS_PRIVACY_AND_SAFETY_NOTES.md`.

## Continuing to DB simulation?
**Yes.** Drives `worst-case-business-survival-recovery.db.test.ts` (13 tests, LANE_B + LANE_A).
