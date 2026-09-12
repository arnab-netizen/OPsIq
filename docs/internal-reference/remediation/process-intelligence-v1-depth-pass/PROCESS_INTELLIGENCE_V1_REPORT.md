# Process Intelligence v1 — REPORT

## A. Files created
- `src/domain/owner-mode/process-intelligence.ts` — pure `buildProcessIntelligence` + the 20-field
  `ProcessFinding`, the 10 `ProcessFindingType`s, stages, severities, impact/approval enums.
- `src/__tests__/owner-mode/process-intelligence.test.ts` — 15 unit tests.
- `src/__tests__/execution/process-intelligence-simulation.db.test.ts` — 2 laundry DB-sim tests.
- `docs/remediation/process-intelligence-v1-depth-pass/` — this pack (6 docs).

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — compute + expose the `processIntelligence`
  block (live path only) from the post-suppression signals + event health + counts.

## C. Schema changes
None. Pure read model over existing data.

## D. Code logic
- `buildProcessIntelligence(input)` — deterministic mapping of the now-view chain to process findings:
  REWORK_LOOP, QUALITY_FAILURE_LOOP, DELIVERY_HANDOFF_DELAY, REVIEW_BOTTLENECK, OWNER_APPROVAL_BOTTLENECK,
  PROOF_QUALITY_BREAKDOWN, ESCALATION_RESPONSE_BREAKDOWN, STAFF_TRAINING_GAP, MANAGER_REVIEW_GAP; else
  DATA_INSUFFICIENT with the exact missing data. Each finding carries its evidence ids, related
  leak/constraint/SLO, a specific correction, an impact TYPE (never an amount), and the required
  approval level. Sorted highest-severity-first; DATA_INSUFFICIENT never on top when a real finding exists.
- Now-view: passes the already-suppressed `topGamingSignal` / `topCredibilityConcern`, the timing
  signals, reused-hash, complaint/rework + event health, proof counts, owner workload, top leak/constraint.

## E. Frontend logic
None (payload block only; no UI in this pass).

## F. Acceptance criteria checklist
- [x] Real domain/service logic over the trusted event chains.
- [x] ≥ 5 high-value failure types implemented (9 real + DATA_INSUFFICIENT).
- [x] Owner now-view exposes the top process breakdown (`processIntelligence.topFinding`).
- [x] Findings link to evidence (proof / operational-event / escalation / adjudication ids).
- [x] Findings link to profit leak / constraint / SLO where applicable.
- [x] Cleared adjudications respected (suppressed top signal → no finding); confirm/require-fresh contributes.
- [x] Tests pass (15 unit + 2 DB-sim); realistic DB simulation passes.
- [x] Cross-workspace isolation tested; clean workspace → DATA_INSUFFICIENT, no bleed.
- [x] No fake financial impact; no fraud/negligence label; no hidden staff score.
- [x] tsc 0 · governance 31 frozen/0 new · `next build` exit 0.

## G. Known limitations
- v1 surfaces the single top breakdown from the now-view's top signals + event health — not every
  historical process failure. No stage-duration mining (uses linked-event + signal evidence).
- No process-intelligence UI (payload block only).
- Owner-workload SLO influence is via the existing `OWNER_WORKLOAD_BURDEN` SLO; no new SLO added.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Trigger map
New complaint/rework/escalation/proof activity → the now-view recomputes → `processIntelligence` reflects
the top breakdown on next load. Adjudicating a proof-risk finding (dismiss) removes its process finding;
confirm/require-fresh keeps it.

## J. Failure modes covered
Cleared-adjudication (no finding); confirm/require-fresh (contributes); clean workspace
(DATA_INSUFFICIENT + missing data); cross-workspace isolation; no fabricated impact/label/score;
highest-severity-first ordering.

## K. Events emitted
None (read model).

## L. Automated tests added
15 unit + 2 DB simulation.
