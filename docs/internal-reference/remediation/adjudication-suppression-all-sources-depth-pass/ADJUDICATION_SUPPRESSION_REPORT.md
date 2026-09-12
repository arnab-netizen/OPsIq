# Adjudication Suppression Across All Sources — REPORT

**Classification:** `ADJUDICATION_SUPPRESSION_ALL_SOURCES_REAL_AND_OWNER_VISIBLE`
(+ `ANTI_GAMING_ANALYTICS_STRENGTHENED`, `EVIDENCE_CREDIBILITY_STRENGTHENED`, `BUSINESS_CONTROL_SLO_STRENGTHENED`, `OWNER_MODE_EXCELLENCE_DEEPENED`).

## A. Files created
- `src/__tests__/execution/adjudication-suppression-simulation.db.test.ts` — 7 DB simulation tests.
- Docs under `docs/remediation/adjudication-suppression-all-sources-depth-pass/`.

## B. Files changed
- `src/domain/execution/proof-risk-adjudication.ts` — `CLEARING_OUTCOMES` narrowed to accept/dismiss
  (training now stays visible); `isFindingSuppressed(supportingProofIds, clearedSet)` (all-cleared →
  suppressed; new proof → visible; unknown → fail visible).
- `src/domain/owner-mode/anti-gaming-analytics.ts` — `supportingProofIds` on `GamingSignal`, populated
  in the fake/reused/tamper/manager branches.
- `src/domain/owner-mode/evidence-credibility-graph.ts` — `supportingProofIds` on `CredibilityFinding`,
  populated in the reused-hash concern.
- `src/services/owner-guidance/owner-now-view.service.ts` — per-source `clearedBySource` index;
  suppress `topGamingSignal` / `topCredibilityConcern` / reused findings / dispute-derived aggregates;
  `proofRiskAdjudicationSummary`; `recomputeDisputeAggregates` (filtered dispute risks).
- `src/__tests__/execution/proof-risk-adjudication.test.ts` — `isFindingSuppressed` + training-reclassification tests.

## C. Schema changes
**None** — this pass is pure logic over the existing `proof_risk_adjudications` records.

## D. Backend logic
Adjudications indexed per source type → each proof-risk signal carries its supporting proof IDs →
now-view suppresses a signal only when every supporting proof is cleared for its source → summary +
SLO reflect cleared vs active; integrity SLO stays audit-derived.

## E. Frontend logic
None (now-view payload only; no UI this pass).

## F. Suppression / visibility behavior
- Clearing (accept/dismiss) suppresses the exact source signal; retains evidence + audit.
- Active outcomes (require-fresh / confirm / training / owner-review / inconclusive) stay visible.
- New supporting proof re-surfaces the risk (per-proof suppression, not a permanent hide).
- Per-source scope: clearing one source does not ease another.
- PROOF_DISPUTE: dispute-derived profit/constraint noise drops; `PROOF_OUTCOME_INTEGRITY` + `proof.disputed` audit never erased.

## G. Acceptance criteria
- All 4 source types handled. ✓
- Clearing suppresses exact old risk; active-risk stays visible. ✓
- New evidence after clearing re-surfaces. ✓
- Now-view reflects adjudication state (summary + suppression). ✓
- SLOs ease on cleared / stay on confirmed; integrity never falsely PASSes. ✓
- Cross-workspace isolation; no hidden score; no fraud/theft label. ✓

## H. Known limitations
- A gaming/credibility signal with **no** known supporting proof IDs (e.g. a self-review or rubber-stamp
  pattern with no per-proof list) is never suppressed (fail visible) — those sources need a per-proof
  evidence list before they can be adjudication-suppressed.
- PROOF_DISPUTE suppression eases the derived profit/constraint noise; it does not (and must not) change
  the integrity SLO.
- No UI.

## I. Trigger map
adjudicate(accept/dismiss, source, proofIds) → now-view indexes cleared proofIds per source →
suppresses only signals whose every supporting proof is cleared → new proof / confirm keeps it visible.

## J. Failure modes covered
Over-suppression (guarded: all-cleared required; new proof re-surfaces); cross-source bleed (per-source
index); integrity erasure (audit-derived, untouched); cross-workspace suppression (per-workspace
adjudications); clean workspace (no state).

## K. Events emitted
None new (suppression is read-time; the adjudication audit from the prior pass is unchanged).

## L. Automated tests
8 new (1 `isFindingSuppressed` domain + 7 DB simulation) + updated the training-classification test.
Changed-area suites green.
