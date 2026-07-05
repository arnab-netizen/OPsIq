# Dispute Category → Profit-Leak + Constraint Wiring — REPORT

**Classification:** `DISPUTE_PROFIT_CONSTRAINT_WIRING_REAL_AND_OWNER_VISIBLE`
(+ `PROFIT_LEAK_RADAR_STRENGTHENED`, `CONSTRAINT_ENGINE_STRENGTHENED`)
**Branch:** `claude/dispute-profit-constraint-wiring-depth-pass` · **Base:** `origin/main` @ `dc18ca6e`

## A. Files created
- `src/domain/owner-mode/dispute-risk.ts` — pure category→profit/constraint mapping + signals + aggregates + topRisk.
- `src/services/owner-mode/dispute-risk.service.ts` — DB-backed `getDisputeRiskAnalysis` (proof.disputed audit trail, 90-day window).
- `src/__tests__/owner-mode/dispute-risk.test.ts` (6 unit), `dispute-risk-simulation.db.test.ts` (3 DB).
- The six docs in this folder.

## B. Files changed
- `src/domain/owner-mode/profit-leak-radar.ts` — dispute count inputs + dispute-attributed REWORK_REDO_COST / COMPLAINT_REVENUE_RISK / WEAK_PROOF_REWORK_RISK leaks.
- `src/domain/owner-mode/constraint-engine.ts` — dispute count inputs + dispute-attributed QUALITY / STAFF / MANAGER constraints.
- `src/services/owner-guidance/owner-now-view.service.ts` — optional `disputeRisk` dep; feed aggregates into both engines; `disputeRisk` on the payload.
- `src/__tests__/owner-mode/profit-leak-radar.test.ts`, `constraint-engine.test.ts` — dispute-driven cases.
- `docs/CURRENT_OPSIQ_STATUS.md`.

## C. Schema changes
**None.** Reads the existing `proof.disputed` audit trail.

## D. Backend logic
- Read `proof.disputed` audits → dispute records (category + reason + audit id).
- Map each category → a `DisputeRiskSignal` (full shape) + increment profit/constraint aggregate buckets.
- Feed aggregates into the radar + constraint engines, which fire dispute-attributed findings that compete in the existing top selection.
- Financial impact NEEDS_DATA (no per-event complaint/rework model → no fabricated number); OTHER not overclassified.

## E. Frontend logic
None. Surfaced on `/api/owner/now-view`: `topProfitLeak` / `topConstraint` (now can be dispute-derived) + the new `disputeRisk` block.

## F. Acceptance criteria
- [x] real service/domain logic; live dispute data can affect Profit-Leak Radar + Constraint Engine.
- [x] owner now-view exposes the effect (dispute-derived topProfitLeak/topConstraint + `disputeRisk`).
- [x] tests + realistic simulation pass.
- [x] honest missing-data (NEEDS_DATA, missing complaint/rework model disclosed).
- [x] cross-workspace isolation tested.
- [x] no fake complaint/rework/revenue/churn record invented.
- [x] existing credibility + PROOF_OUTCOME_INTEGRITY unchanged (not duplicated); reassessment not duplicated.

## G. Known limitations
- Per-event complaint/rework models still absent — dispute financial impact stays qualitative (NEEDS_DATA).
- Anti-Gaming Analytics is not directly re-fired from disputes this pass (the fake/reuse category feeds STAFF constraint + weak-proof leak; a dedicated gaming-signal link is future work).
- No UI; browser E2E unchanged.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Trigger map
dispute (PR #115) → `proof.disputed` audit → `getDisputeRiskAnalysis` → aggregates → radar/constraint engines → now-view `topProfitLeak`/`topConstraint` + `disputeRisk`.

## J. Failure modes covered
No disputes (no fabricated leak/constraint), OTHER (not overclassified), customer-facing (revenue impact disclosed as unmeasured), repeated category (HIGH severity), cross-workspace (isolated), absent table (P2021 → empty).

## K. Events emitted
None new (read-only over `proof.disputed`).

## L. Automated tests added
6 dispute-risk unit + 4 radar cases + 4 constraint cases + 3 DB simulation = **17 new tests**.
