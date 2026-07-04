# Real-Business Constraint Simulation Report

**Test:** `src/__tests__/owner-mode/constraint-engine-simulation.db.test.ts` (DB-backed, no mocks).

## Scenario — "Sparkle Laundry" one workspace
Seeded a realistic day: an `ownerMetricSnapshot` with 12 complaints + 6 rework + weak repeat rate
(40 new / 8 repeat → churn), 4 overdue `PENDING_SUBMISSION` proofs (staff execution lag), and 2
`NEEDS_HUMAN_REVIEW` proofs (owner review queue).

## Result
- The live Owner Now View ran the Constraint Engine and returned **`QUALITY`** as the single binding
  constraint (12 complaints / 6 rework outrank the staff-lag and owner-review signals) — with evidence
  citing complaints/rework, a specific SOP-fix next action, a success metric, and a reassessment trigger.
- The Owner Workload Budget on the same read counted the 2 owner reviews.
- Deterministic across two consecutive live reads (same type + bindingScore).
- A clean workspace returned **`DATA_INSUFFICIENT`** with exact missing data (no fabricated constraint),
  and did not see the laundry's review queue (workspace isolation).

## Asserted
Specific diagnosis · specific next action · success metric · reassessment trigger · owner-visible ·
no generic advice · no fabricated data · workspace isolation.
