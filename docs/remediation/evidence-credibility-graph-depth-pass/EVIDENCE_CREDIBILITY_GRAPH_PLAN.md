# Evidence Credibility Graph — Plan

**Branch:** `claude/evidence-credibility-graph-depth-pass` · **Base/main:** `de63b786`.

## Goal (one depth capability)
Track which proof/staff/reviewer/proof-type can be trusted over time, owner-visibly, with reason codes
(no hidden score), honest thresholds, missing-data handling, and no fabricated outcome linkage.

## Approach (mirrors the proven engine pattern)
1. Pure `buildEvidenceCredibility(input)` over per-entity aggregates (deterministic single top concern).
2. Pure `aggregateCredibility(rows)` turns real Proof rows (+ reviewedAt/proofType) into aggregates.
3. `getCredibilityGraph` service = owner-callable DB entry point.
4. Surface one `topCredibilityConcern` via `/api/owner/now-view` (shared proof query, DI-safe).
5. Link anti-gaming signal + profit leak + constraint; reason codes + events, secondary explained score.
6. Unit tests per signal + DB multi-actor simulation + workspace isolation.

## Out of scope
Business-Control SLOs, Process Intelligence, public SaaS, billing, report cleanup.
