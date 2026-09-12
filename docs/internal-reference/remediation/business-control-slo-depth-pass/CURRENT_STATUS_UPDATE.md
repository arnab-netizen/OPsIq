# Current Status Update — Business-Control SLO depth pass

- **Consolidation:** Evidence Credibility Graph (PR #111) CI-green + fast-forward merged to main
  (`6a840314`); all prior depth passes remain on main.
- **Business-Control SLOs:** `BUSINESS_CONTROL_SLO_REAL_AND_OWNER_VISIBLE` — deterministic 15-SLI grading
  of OpsIQ's own control loop (PASS/WARN/FAIL/NOT_MEASURABLE), owner-callable + surfaced via
  `/api/owner/now-view` (`payload.businessControlHealth`), graded from the now-view's existing signals +
  proof counts, linked to constraint/profit-leak/gaming/credibility. No fake/always-green metrics;
  honest NOT_MEASURABLE with exact missing source. 17 tests (13 unit + 4 DB).
- **What Arnab can use now:** the Owner Now View now reports whether OpsIQ's control loop itself is
  healthy — the single top control risk (e.g. owner overload, anti-gaming/credibility risk, weak-proof
  rate) with a corrective action — and is honest about what it cannot yet measure.
- **Measurable now:** owner workload/bottleneck, anti-gaming risk, credibility risk, weak-proof rate,
  proof-review backlog, constraint/profit-leak freshness, opportunity/now-view completeness.
- **NOT_MEASURABLE (missing source):** audit durability (per-mutation correlation index),
  reassessment/shock latency (timestamp linkage), startup completeness (no active startup rec),
  isolation (test-backed only).
- **Next safest depth pass:** persist the timestamp/correlation linkages to make
  AUDIT_DURABILITY / REASSESSMENT_LATENCY / SHOCK_HANDLING_LATENCY measurable; then Process Intelligence.
