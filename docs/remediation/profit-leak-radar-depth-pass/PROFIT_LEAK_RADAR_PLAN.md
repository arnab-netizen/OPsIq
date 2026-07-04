# Profit-Leak Radar — Plan

**Branch:** `claude/profit-leak-radar-depth-pass` · **Base/main:** `0438927c`.

## Goal (one depth capability)
Identify the highest-value profit leak (cash/margin/retention/quality/owner-leverage), integrated into
existing owner flows, honest about missing data, never fabricating ROI or margin.

## Approach (mirrors the proven Constraint Engine pattern)
1. Pure `identifyProfitLeaks(signals)` (deterministic, single top leak).
2. Fed by the SAME live now-view signals (reuse; added discount/b2bRevenue to the metric read).
3. Surface one `topProfitLeak` via `/api/owner/now-view`.
4. Link the current constraint; feed OWNER_BOTTLENECK_COST from the Workload Budget; gate the
   Opportunity envelope on active cash/margin leaks.
5. Real figures only; NEEDS_DATA / DATA_INSUFFICIENT where data is absent.
6. Unit tests per leak type + DB discount-abuse simulation + workspace isolation.

## Out of scope
Anti-gaming analytics, credibility graph, SLOs, process mining, public SaaS, billing, report cleanup.
