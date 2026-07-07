# Timeline Run Report — Long-Running Business Timeline (PASS 47)

**Date:** 2026-07-07 · **Archetype:** laundry/local service · **Span:** 8 simulated weeks, 32 events,
7 reassessment cycles.

Every decision below is computed by the **real** governed engines (`planBusinessSurvivalRecovery`,
`assessGrowthReadiness` → progression engine, `evaluateConditionTransition`, `evaluateDoNotRepeat`)
composed by the pure driver `src/domain/execution/business-timeline-simulation.ts`. The per-tick outputs
are in `LONG_RUNNING_TIMELINE_EXPECTATIONS.json`.

## Narrative → governed decision (highlights)

| Week | What happens | Governed top action / behaviour |
|---|---|---|
| 1 | Baseline messy; cash figure unknown | `UNKNOWN_NEEDS_DATA` → collect missing internal data first |
| 2 | Complaints rise (customer→HIGH) | top action shifts to `CUSTOMER_RECOVERY_REQUIRED` |
| 3 | Cash pressure appears (cash→HIGH) | top action shifts to `CASH_PROTECTION_REQUIRED`; missing cash data recurs → escalates |
| 3 | Owner declines an expensive marketing push | recorded in decision memory (never re-suggested unchanged) |
| 4 | Owner approves stop-loss; staff task done **with evidence** | cash/quality ease; reassessment runs |
| 5 | Quality improves, **operations worsen**; first ops fix **fails** | ops fix is remembered as failed and **not repeated without new evidence** |
| 6 | A **tender opportunity appears during instability** | growth stays **BLOCKED**; owner declines the bid (remembered); tender data recurs |
| 7 | SOP/training runs; **owner load delegated**; **real cash data collected**; ops resolved **with evidence** | new evidence **unblocks** the previously-failed ops fix; recovery advances |
| 8 | **Regression** (complaints spike again) → OpsIQ **loops back** to correction, not fake success | a **weak proof is not accepted**; re-correction with evidence; **stabilization proven only after evidence**; **thrive gate opens only then** — still owner-gated |
| — | Clean control (a business with no events) | **no crisis, nothing fabricated** |

## Coherence & maturity properties observed
- **Top action tracks the facts**: `data → customer → cash → customer → ops → validate → customer → reassess`.
- **Finance-first / growth-gated**: growth is `growthAllowed = false` on every tick until the thrive gate
  opens at the final week, and only after stabilization is proven **and** the SOP/manager layer is proven working.
- **Strategy phase**: `stabilize → survive → … → recover → grow`, and `grow` never appears before the real
  growth gate opens.
- **Decision memory**: the failed ops fix is repeat-blocked until new evidence arrives; the owner-declined
  marketing/tender actions stay blocked.
- **Missing data never becomes a fact**: recurring gaps escalate; unknowns stay unknown.
- **Regression is caught**, not hidden: the week-8 spike loops back to correction.

## Verification
- Unit proof: `src/__tests__/execution/business-timeline-simulation.test.ts` — **14/14**.
- DB proof (LANE_B): `src/__tests__/execution/long-running-business-timeline.db.test.ts` — **8/8** on real
  Postgres (drives `recordDoNotRepeat`, `markFactUnknown`, `submitProof`/`reviewProof`, audit events,
  workspace isolation). Logs `LANE_B_TIMELINE_DB_SIM_EXECUTED`.
