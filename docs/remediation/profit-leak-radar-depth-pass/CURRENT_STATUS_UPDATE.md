# Current Status Update — Profit-Leak Radar depth pass

- **Profit-Leak Radar:** `PROFIT_LEAK_RADAR_REAL_AND_OWNER_VISIBLE` — deterministic top-leak detection,
  live-signal-fed, surfaced via `/api/owner/now-view` (`payload.topProfitLeak`), linked to the
  Constraint Engine, feeding the Opportunity envelope + Owner Workload Budget, honest DATA_INSUFFICIENT
  and no fabricated ROI/margin. 19 tests (16 unit + 3 DB).
- **What Arnab can use now:** the Owner Now View now names the single biggest place money is leaking
  (discounting / underpricing / low-margin B2B / complaints / rework / churn / delivery / owner queue /
  idle capacity / cash-risk growth), with a specific fix and owner-approval where price/cash is touched;
  and it stops the opportunity engine from scaling volume through an active cash/margin leak.
- **Still missing / partial:** Anti-Gaming Analytics, Evidence Credibility Graph, Business-Control SLOs,
  Process Intelligence; delivery/major-client-loss/startup event-signal ingestion; authenticated browser
  E2E; APPR-01 breadth; multi-actor throughput.
- **Next safest depth pass:** cross-event Anti-Gaming Analytics (over the proof/audit log), then Evidence
  Credibility Graph.
