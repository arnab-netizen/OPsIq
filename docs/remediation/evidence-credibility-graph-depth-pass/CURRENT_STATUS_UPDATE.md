# Current Status Update — Evidence Credibility Graph depth pass

- **Consolidation:** the Anti-Gaming Analytics branch (PR #110) was CI-fixed (governance strict scan
  0-new) and fast-forward merged to main (`de63b786`); all prior depth passes remain on main.
- **Evidence Credibility Graph:** `EVIDENCE_CREDIBILITY_GRAPH_REAL_AND_OWNER_VISIBLE` — deterministic
  per-entity credibility from real Proof/review data (submitter/reviewer/proof-type/item level),
  owner-callable + surfaced via `/api/owner/now-view` (`payload.topCredibilityConcern`), linked to the
  Anti-Gaming Analytics + Profit-Leak Radar + Constraint Engine. Reason codes + evidence (no hidden
  score); RELIABLE only with no contradiction + disclosed outcome-linkage gap; DATA_INSUFFICIENT
  otherwise. 16 tests (12 unit + 4 DB).
- **What Arnab can use now:** the Owner Now View now names which proof/operator/reviewer/proof-type is
  least trustworthy right now (self-review, rubber-stamp, unreliable/reliable submitter, weak proof
  type, reused/stale/tamper) with reason codes and the events that prove it.
- **Still missing / partial:** accepted-proof↔complaint/rework/bad-outcome linkage (needs persisted
  events); Business-Control SLOs, Process Intelligence; authenticated browser E2E; APPR-01 breadth.
- **Next safest depth pass:** Business-Control SLOs (reliability metrics over the now-view signals),
  then Process Intelligence.
