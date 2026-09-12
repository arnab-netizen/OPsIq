# Opportunity Validation Experiment Engine — Depth Pass

Classification: `OPPORTUNITY_VALIDATION_EXPERIMENT_ENGINE_REAL_AND_OWNER_VISIBLE`

The governed bridge between "this looks worth testing" (External Opportunity Intelligence, PASS 7) and
"allocate real capital" (Opportunity Portfolio, PASS 9): every promoted candidate becomes the **cheapest
bounded, falsifiable experiment** that would confirm or refute its riskiest assumption — and nothing scales
until an experiment has actually passed.

## A. Files created
- `src/domain/owner-mode/opportunity-validation-experiment-engine.ts` — the pure select→bound→falsify→govern loop.
- `src/__tests__/owner-mode/opportunity-validation-experiment-engine.test.ts` — 18 unit tests.
- `src/__tests__/components/validation-panel.test.tsx` — 9 jsdom component tests.
- `src/__tests__/execution/opportunity-validation-experiment-simulation.db.test.ts` — DB-backed laundry sim + multi-shape plan proof.
- `docs/remediation/opportunity-validation-experiment-engine-depth-pass/REPORT.md` — this file.

## B. Files changed
- `src/services/owner-guidance/owner-now-view.service.ts` — `opportunityValidation` added to `OwnerNowViewPayload`; `buildOpportunityValidationPlan` run over the promoted external-opportunity candidates with the same cash/profit + capability context. No candidates → null.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `ValidationPanel` + view types.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — the "Next validation experiment to run" subsection inside the Grow cockpit group.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock extended; asserts the validation panel renders.
- `.github/workflows/db-verification.yml` — new DB sim added to LANE_B and LANE_A file lists.

## C. Schema changes
None. The engine consumes the already-derived opportunity candidates; the experiment plan is a pure derivation.

## D. Backend logic implemented (a real experiment designer, not an enum shell)
- **`selectExperimentType`** — picks the cheapest credible probe by opportunity shape: B2B → outreach test, retention → hand-run message/call script (never a mass blast), pricing → reversible controlled test, marketing → simple form, new service → tiny real batch (if locally feasible) else customer-interest test, segment → survey; **unknown economics / a data-collection next step / any missing data → `DATA_COLLECTION_ONLY`** (collect first, spend never).
- **9 experiment types**: CUSTOMER_INTEREST_TEST, B2B_OUTREACH_TEST, PRICING_TEST, LANDING_OR_FORM_TEST, WHATSAPP_OR_CALL_SCRIPT_TEST, MANUAL_SURVEY, SMALL_BATCH_TRIAL, PARTNERSHIP_TEST, DATA_COLLECTION_ONLY.
- **`designValidationExperiment`** — turns one candidate into a ~24-field bounded experiment (hypothesis, riskiest assumption, method, success metric + threshold, failure metric + threshold, stop-loss, cost cap, owner-time cap, duration, sample size, data-to-collect, approval, do-not-scale note) — or **defers** it with an explicit reason (PARKED / REJECTED / OWNER_DECISION_FIRST). Parked/rejected candidates are never fabricated into experiments; a candidate with material cash/legal exposure defers to an owner decision first.
- **`buildOpportunityValidationPlan`** — orchestrates; owner sees only the single top experiment (owner-approval-free and cheapest first), the rest retained for audit.
- **Guarantees**: every experiment has a success threshold AND a failure threshold AND a stop-loss (falsifiable); positive owner-time/duration/sample caps; `DATA_COLLECTION_ONLY` spends nothing (cost cap 0); cost caps otherwise reported only when a real estimate is supplied (never fabricated); design-time `validationStatus` is always `NOT_STARTED`; a do-not-scale note is always present; material cash/workload/legal exposure or an active cash risk forces owner approval.

## E. Frontend logic implemented
`ValidationPanel` (Executive Cockpit standard): the single next experiment (type, hypothesis, method), a pass
threshold and a fail threshold, hard caps ("≤N min owner time · D days · ~S sample · no spend / spend ≤ cap"),
the stop-loss, an always-present "not permission to scale" note, an owner-approval badge where material, a
collapsed "why this experiment" (riskiest assumption + cheaper alternative rejected + data to collect), and an
ingest/deferred summary — never a raw dump. Rendered under the Grow cockpit group beneath the top candidate.

## F. Acceptance criteria checklist
- [x] Pure engine, ≥5 experiment types (9 implemented).
- [x] ~24-field experiment shape incl. cost cap, owner-time cap, success/failure metric, stop-loss.
- [x] Data-first when economics unknown; parked/rejected/high-risk candidates deferred with a reason.
- [x] Owner approval on material cash/workload/legal exposure or active cash risk.
- [x] No result ever ready-to-scale; no fabricated money; no hidden score.
- [x] Wired into the Owner Now View + owner cockpit panel + page.
- [x] 18 domain + 9 component + page assertions + DB sim (multi-shape).
- [x] DB sim wired into LANE_B/LANE_A.
- [x] `tsc` 0 · governance 31 frozen / 0 new · lint:ratchet PASS.

## G. Known limitations
- The engine designs experiments; it does not (yet) **run** them or record live results — capturing an
  experiment's actual outcome (PASSED / FAILED / INCONCLUSIVE) is a persistence path consumed by PASS 9's
  scaling gate and is out of this slice's scope. Design-time status is `NOT_STARTED` by construction.
- Cost caps appear only when the upstream candidate supplied a real `validationCostEstimate`; money is never invented.

## H. Manual verification steps
1. `npx vitest run src/__tests__/owner-mode/opportunity-validation-experiment-engine.test.ts` → 18 passed.
2. `npx vitest run src/__tests__/components/validation-panel.test.tsx` → 9 passed.
3. `npx vitest run src/__tests__/app/owner-process-intelligence-page.test.tsx` → passes with the validation panel asserted.
4. LANE_B/LANE_A run `opportunity-validation-experiment-simulation.db.test.ts` against real Postgres.
5. Load `/owner/process-intelligence` → open "Grow: opportunities to validate" → "Next validation experiment to run".

## I. Trigger map
Promoted external-opportunity candidates (PASS 7) → `buildOpportunityValidationPlan` → `opportunityValidation`
in the Owner Now View → `ValidationPanel`.

## J. Failure modes covered
Unknown economics → data-collection-only (no spend); parked/rejected → deferred, never fabricated; material
cash/legal → owner decision first; high cash/workload/legal or active cash risk → owner approval; clean
workspace → null; no fabricated money, no profit guarantee, no ready-to-scale, no hidden score, no
fraud/HR-discipline language.

## K. Events emitted
None (read/derivation path; no mutation).

## L. Automated tests added
18 pure + 9 component + 1 page assertion + 3 DB-sim checks (2 DB-backed + 1 multi-shape plan) = 31 new checks.
