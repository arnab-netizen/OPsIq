# Anti-Gaming Analytics — Plan

**Branch:** `claude/anti-gaming-analytics-depth-pass` · **Base/main:** `59c85033` (post-consolidation).

## Goal (one depth capability)
Detect staff/manager/operator gaming patterns across events, owner-visibly, with transparent reason
codes (no black-box score), honest thresholds, and missing-data handling.

## Approach (mirrors the proven engine pattern)
1. Pure `identifyGamingSignals(input)` over per-actor aggregates (deterministic single top signal).
2. Pure `aggregateProofEvents(rows)` turns real Proof rows into those aggregates.
3. `getGamingAnalysis` service = owner-callable DB entry point.
4. Surface one `topGamingSignal` via `/api/owner/now-view` (DI-safe optional proof.findMany).
5. Link current constraint + top profit leak; reason codes + events, never a hidden score.
6. Unit tests per pattern + DB multi-actor simulation + workspace isolation.

## Out of scope
Evidence credibility graph, SLOs, process mining, public SaaS, billing, report cleanup.
