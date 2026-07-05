# Real-Business Anti-Gaming Simulation Report

**Test:** `src/__tests__/owner-mode/anti-gaming-analytics-simulation.db.test.ts` (DB-backed, no mocks).

## Scenario — "Sparkle Laundry" (multi-actor)
Owner + manager + two operators. Operator "OpWeak" submits 4 weak (NEEDS_HUMAN_REVIEW) proofs and
reuses 2 (duplicate-flagged); operator "OpOk" submits clean, manager-accepted proofs; the manager
self-reviews one item (reviewer == submitter).

## Result
- The live Owner Now View ran the analytics and returned **`SELF_REVIEW_ATTEMPT`** (manager) as the
  single highest-risk pattern — the most severe integrity breach outranks the weak-proof pattern — with
  reason code `SELF_REVIEW`, the event evidence, **owner action required**, a specific response
  (enforce different reviewer + audit affected items), and a reassessment trigger. No hidden score.
- The owner-callable `getGamingAnalysis` also flagged **OpWeak** by name with `REPEATED_WEAK_PROOF` and
  `REUSED_PROOF_PATTERN` (reason code `DUPLICATE_FILE_HASH`), plus `OWNER_REVIEW_BURDEN_CREATED_BY_STAFF`
  linked to the `OWNER_BOTTLENECK_COST` profit leak.
- Deterministic across two consecutive live reads.
- A clean workspace returned **`DATA_INSUFFICIENT`** (no fabricated blame) and did not see the laundry's
  actors (workspace isolation).

## Asserted
Top pattern identified · reason codes + evidence (no black-box) · owner vs manager action ·
training/process framing · reassessment trigger · owner-visible · workspace isolation · no fabricated data.
