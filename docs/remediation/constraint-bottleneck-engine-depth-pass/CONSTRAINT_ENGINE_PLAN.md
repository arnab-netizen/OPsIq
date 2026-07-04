# Constraint / Bottleneck Engine — Plan

**Branch:** `claude/constraint-bottleneck-engine-depth-pass` · **Base/main:** `394427e7`.

## Goal (depth pass)
Build one real capability: identify the single binding constraint limiting profit/throughput/quality/
cash/growth/owner-leverage, integrated into existing owner flows — not a shallow pass over everything.

## Approach
1. Pure `identifyConstraints(signals)` domain fn (deterministic, ToC-style single binding constraint).
2. Feed it the SAME live signals the Owner Now View already assembles (reuse, no new data source).
3. Surface exactly one `topConstraint` via the existing `/api/owner/now-view` payload.
4. Integrate with Owner Workload Budget (OWNER signal) and the Opportunity envelope (gate expansion into
   a bottleneck).
5. Honest missing-data → `DATA_INSUFFICIENT` with exact gaps; fabricate nothing.
6. Unit tests for every constraint type + a DB laundry simulation + workspace isolation.

## Out of scope (per instruction)
Profit-leak radar, credibility graph, SLOs, process mining, public SaaS, billing, report cleanup.
