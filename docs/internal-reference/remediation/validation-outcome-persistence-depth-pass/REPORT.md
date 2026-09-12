# Validation Outcome Persistence — Depth Pass

Classification: `VALIDATION_OUTCOME_PERSISTENCE_REAL_AND_OWNER_VISIBLE`

Persists what actually happened when an opportunity's validation experiment ran, so the **live** Opportunity
Portfolio moves past NOT_STARTED and makes real kill / park / scale-candidate decisions on evidence instead
of only under injected statuses.

## A. Files created
- `src/domain/owner-mode/validation-outcome.ts` — the evidence-gated recording (no-fake-win / stop-loss / scale-gate) + `resultToValidationStatus`.
- `src/services/owner-mode/validation-outcome.service.ts` — governed record (persist + audit + idempotent) + `getActiveValidationOutcomes`.
- `src/app/api/owner/opportunities/validation-outcome/route.ts` — `POST` (OWNER_MANAGE, workspace-scoped, validated).
- `src/__tests__/owner-mode/validation-outcome.test.ts` — 13 domain + portfolio-consumption tests.
- `src/__tests__/owner-mode/validation-outcome.service.test.ts` — 4 service tests (in-memory DB).
- `src/__tests__/components/validation-outcome-panel.test.tsx` — 6 jsdom component tests.
- `src/__tests__/execution/validation-outcome-persistence-simulation.db.test.ts` — DB-backed laundry sim.
- `prisma/migrations/20260706010000_opportunity_validation_outcome/migration.sql` — new table.
- this report.

## B. Files changed
- `prisma/schema.prisma` — `OpportunityValidationOutcome` model (25 fields).
- `src/domain/constants/audit-events.ts` — `OWNER_OPPORTUNITY_VALIDATION_OUTCOME_RECORDED`.
- `src/services/owner-guidance/owner-now-view.service.ts` — persisted outcomes override each experiment's design-time NOT_STARTED status by `opportunityKey` before the portfolio runs; `opportunityValidationOutcomes` in the payload; new optional `validationOutcomes` dep.
- `src/components/owner/ProcessIntelligencePanel.tsx` — `ValidationOutcomePanel` + view type.
- `src/app/(authenticated)/owner/process-intelligence/page.tsx` — "What the test proved" subsection in the Grow group.
- `src/__tests__/app/owner-process-intelligence-page.test.tsx` — mock + assertion.
- `.github/workflows/db-verification.yml` — new DB sim wired into LANE_B and LANE_A.

## C. Schema changes
New table `opportunity_validation_outcomes` (workspace-scoped, `UNIQUE(workspace_id, idempotency_key)`, indexed on `(workspace_id, opportunity_key)`). Additive, backfill-safe, non-destructive.

## D. Outcome statuses/results supported
`status`: NOT_STARTED / RUNNING / COMPLETED / CANCELLED / NEEDS_DATA. `result`: PASSED / FAILED / INCONCLUSIVE / NOT_EVALUATED. `nextRecommendedDecision`: KILL / PARK / MODIFY / RETEST / SCALE_CANDIDATE / NEEDS_DATA.

## E. Governance (enforced in the pure domain)
- **PASSED requires evidence** (leads / responses / conversions / a success-metric result / proof refs) — a PASSED claim with no evidence is downgraded to **INCONCLUSIVE** (no fake wins).
- **A stop-loss trigger can never PASS** — it forces FAILED → KILL.
- **Scale gate**: SCALE_CANDIDATE is reachable only from PASSED **with cost + margin evidence**, and still requires owner approval. Missing cost/margin on a PASS → NEEDS_DATA (cannot scale yet). INCONCLUSIVE / NOT_EVALUATED / RUNNING can never scale.
- No fabricated revenue/conversion/profit; numbers are the recorder's own results, carried verbatim; no fraud/HR-discipline language (fail-closed).

## F. Portfolio integration
`getActiveValidationOutcomes` maps each result onto the portfolio's `ValidationStatus`; the now-view overrides each validation experiment's status by `opportunityKey` (`${signalSourceType}:${opportunityType}`) before `buildOpportunityPortfolio` runs. So a recorded PASSED (with evidence) makes the live portfolio a SCALE_CANDIDATE (owner-approved), a FAILED/stop-loss makes it a KILL, and an un-run NOT_STARTED still cannot scale — the PASS 9 scale gate is unchanged; it now consumes real outcomes.

## G. Owner cockpit integration
`ValidationOutcomePanel` under the Grow group ("What the test proved"): top result, next decision, why scale is/ isn't allowed, approval level, stop-loss flag — no fake money/percent, no hidden score.

## H. Tests added
13 domain/integration + 4 service + 6 component + page assertion + 5 DB-sim checks = 29 new checks.

## I. DB sim result
`validation-outcome-persistence-simulation.db.test.ts`: submits a real B2B opportunity (PASS 10 intake) that promotes to a portfolio candidate; asserts through `getOwnerNowView` that with no outcome the candidate cannot scale; recording a PASSED outcome (cost + margin) makes the portfolio a SCALE_CANDIDATE (owner approval) + persists an audit + exposes `opportunityValidationOutcomes`; re-recording a stop-loss flips it to KILL; idempotent re-record; workspace isolation + clean-workspace-null. Against real Postgres.

## J. DB sim CI execution proof
To be taken at the merge gate from the LANE_B log (expect Test Files 37 with the `validation-outcome-persistence-simulation.db.test.ts ✓` line + `LANE_B_DB_VERIFIED`). A green lane alone is not accepted.

## K. Commands run
`prisma validate` ✅ · `prisma generate` ✅ · `tsc --noEmit` 0 · governance 31 frozen / 0 new · lint:ratchet PASS · all opportunity + page suites green (62 non-DB tests).

## L. Commands failed/blocked
None. (DB sim runs only under `TEST_WITH_DB=true`.)

## Known limitations
- Outcomes are keyed to opportunities by `opportunityKey = ${signalSourceType}:${opportunityType}` (the same key the portfolio already uses to match candidate↔experiment). A per-experiment durable id link is a natural future refinement.
- Rich per-experiment result history is retained (newest per opportunity wins for the live decision); a full timeline UI is out of scope.

## Exact next safest pass
Opportunity execution & delegation tracking (turn a promoted/validated opportunity's prep checklist + next-action owner into governed, trackable delegated tasks with completion evidence) — additive, evidence-backed, no new external surface. (Not started; the two-pass loop stops here per the prompt.)
