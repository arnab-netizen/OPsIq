# Owner Workload Reduction v2 — REPORT

## A. Files created
- `src/domain/owner-mode/owner-workload-reduction.ts` — pure engine (9 workload types, 20-field finding, safe reduction routing, risk guardrails).
- `src/__tests__/owner-mode/owner-workload-reduction.test.ts` — 14 domain tests.
- `src/__tests__/components/owner-workload-reduction-panel.test.tsx` — 5 component tests.
- `src/__tests__/execution/owner-workload-reduction-simulation.db.test.ts` — laundry DB simulation.
- `docs/remediation/owner-workload-reduction-v2-depth-pass/` — this pack.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `ownerWorkloadReduction` block + `deriveWorkloadSignals` helper + interface.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `OwnerWorkloadReductionPanel` (executive cockpit) + views.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — render "Reduce your workload".
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — assert the workload panel renders.
- `.github/workflows/db-verification.yml` — LANE_B/LANE_A run the workload DB simulation.

## C. Schema changes
**None.** Pure derivation over the existing findings/corrections/training + counted burden signals
(adjudication count, weak-proof count, owner-bottleneck items). No migration (backfill-safe).

## D. Backend logic implemented
`buildOwnerWorkloadReduction(signals, workspaceId, at)` — pure + deterministic. Emits the avoidable-owner-
burden findings (9 workload types) with a safe reduction recommendation and a risk guardrail. High-risk
correction backlogs recommend KEEP_OWNER_APPROVAL; low-risk repeats DELEGATE_TO_MANAGER / CONVERT_TO_POLICY.
`estimatedOwnerTouches` is set only when directly counted (never guessed). `deriveWorkloadSignals` maps the
now-view analyses + scalars into the signals (owner-approval corrections flagged high-risk by impact type).
Wired into `getOwnerNowView` as `ownerWorkloadReduction`.

## E. Frontend logic implemented
`OwnerWorkloadReductionPanel` — **Executive Cockpit standard**: the single top avoidable burden by default,
owner action first, business impact second, evidence collapsed in a `<details>`, extra items behind a
"N more" summary. Prop-driven; no business logic. High-risk items show owner approval + the guardrail.
Surfaced on `/owner/process-intelligence` under "Reduce your workload".

## F. Acceptance criteria checklist
- [x] Workload-finding logic exists; 9 workload types (>=6 required).
- [x] Owner-visible block + page integration (cockpit: top item, collapsed evidence).
- [x] Risk guardrail on every finding; high-risk decisions remain owner-controlled (KEEP_OWNER_APPROVAL).
- [x] Low-risk repeats recommend DELEGATE_TO_MANAGER / CONVERT_TO_POLICY.
- [x] No fabricated time saving (estimatedOwnerTouches only when counted); no fraud/negligence/firing/payroll/discipline; no hidden score.
- [x] Clean workspace fabricates nothing; workspace scoping preserved.
- [x] 14 domain + 5 component + 2 page tests; laundry DB simulation (CI LANE_B); tsc 0; governance 31/0; ratchet clean; next build compiled.

## G. Known limitations
- Recommendations are proposals; the owner (or a delegated manager) still acts.
- Burden signals use counted values available in the now-view; deeper touch-history is out of scope.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md`.

## I. Classification
`OWNER_WORKLOAD_REDUCTION_V2_REAL_AND_OWNER_VISIBLE`.

## J. Workload types supported
REPEATED_OWNER_ADJUDICATION, OWNER_REVIEW_BURDEN, OWNER_APPROVAL_BOTTLENECK, LOW_RISK_OWNER_INTERRUPT,
RECURRING_COMPLAINT_ESCALATION, MANAGER_ESCALATION_OVERUSE, MISSING_DATA_BURDEN, CORRECTION_APPROVAL_BACKLOG,
TRAINING_DELEGATION_OPPORTUNITY.

## K. Events emitted
None — read-model derivation on the now-view read path.

## L. Automated tests added
14 domain + 5 component + 2 page (jsdom) + 2 laundry DB-simulation cases.
