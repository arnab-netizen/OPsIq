# Runtime Control Correlation + Measurement Linkage — REPORT

**Classification:** `RUNTIME_CONTROL_CORRELATION_REAL_AND_OWNER_VISIBLE` (partial-measurement disclosed)
**Branch:** `claude/opsiq-hostile-audit-jye6h4` · **Base:** `origin/main` @ `47a7741d`

## A. Files created
- `src/domain/owner-mode/control-correlation.ts` — pure correlation domain (reassessment/shock/audit
  linkage + latency + coverage, full correlation shape, honest MISSING/FAILED/NOT_MEASURABLE).
- `src/services/owner-mode/control-correlation.service.ts` — DB-backed `getControlCorrelations`,
  workspace-scoped, 90-day rolling window.
- `prisma/migrations/20260705000000_proof_tamper_suspected/migration.sql` — additive tamper column + index.
- `src/__tests__/owner-mode/control-correlation.test.ts` — 14 pure unit tests.
- `src/__tests__/owner-mode/control-correlation-simulation.db.test.ts` — 3-scenario DB simulation.
- The six docs in this folder.

## B. Files changed
- `prisma/schema.prisma` — `Proof.tamperSuspected Boolean @default(false)` + `@@index([workspaceId, tamperSuspected])`.
- `src/services/execution/proof-precheck.service.ts` — persist `tamperSuspected=true` atomically on `POSSIBLE_TAMPER_RISK`.
- `src/domain/owner-mode/evidence-credibility-graph.ts` — `CredibilityProofRow.tamperSuspected`; count it into `itemCounts.tamperSuspected`.
- `src/domain/owner-mode/business-control-slo.ts` — measured grading for `AUDIT_DURABILITY`, `REASSESSMENT_LATENCY`, `SHOCK_HANDLING_LATENCY` (replaces the old boolean NOT_MEASURABLE flags); new `latencySlo`/`fmtDur` helpers.
- `src/services/owner-guidance/owner-now-view.service.ts` — optional `correlations` dep wired to the service; proof select adds `tamperSuspected`; measured stats feed the SLO input; `controlCorrelations` on the payload.
- `src/__tests__/owner-mode/business-control-slo.test.ts` — measured-grading cases.
- `src/__tests__/services/execution/proof-precheck.service.test.ts` — tamper-persistence cases.
- `docs/CURRENT_OPSIQ_STATUS.md`.

## C. Schema changes
One additive, backfill-safe, non-destructive column: `proofs.tamper_suspected BOOLEAN NOT NULL DEFAULT false`
(+ `(workspace_id, tamper_suspected)` index). Existing rows backfill to `false`. No column drop, no type change.

## D. Backend logic
- Reassessment latency: `updatedAt − createdAt` for `closed_*` rows → LINKED; open past 7d → FAILED; open within → MISSING_TARGET.
- Shock handling latency: `AuditEvent(CONDITION_CHANGED).occurredAt − ShockEvent.createdAt` (server record time, **never** the user-supplied `happenedAt`) → LINKED; no handling audit past 1-min grace → FAILED.
- Audit durability (partial, shock class): fraction of shocks with a `SHOCK_EVENT_RECORDED` audit → coverage %; any gap → FAILED durability link + `AUDIT_DURABILITY` FAIL.
- Tamper: precheck sets `tamperSuspected` atomically with the status transition; credibility graph raises `TAMPER_SUSPECTED_PROOF`.

## E. Frontend logic
None (server/domain pass). The correlation report and the three now-measured SLOs are surfaced verbatim on the existing `/api/owner/now-view` payload (`controlCorrelations`, `businessControlHealth`).

## F. Acceptance criteria
- [x] ≥1 previously-NOT_MEASURABLE SLO becomes measured: **three** (`AUDIT_DURABILITY`, `REASSESSMENT_LATENCY`, `SHOCK_HANDLING_LATENCY`).
- [x] Real persisted/DB-backed correlations (two timestamps each; no fabrication).
- [x] Owner-visible via the now-view payload.
- [x] Honest missing-data behaviour (clean workspace stays NOT_MEASURABLE; proof→outcome stays NOT_MEASURABLE with exact missing model).
- [x] Cross-workspace isolation tested (clean workspace sees zero laundry correlations).
- [x] No fake timestamps / correlations / green.
- [x] Governance strict 0-new; changed-area suites green.

## G. Known limitations
- `AUDIT_DURABILITY` is metered over the **shock mutation class only** (the class with a queryable
  row↔audit key). Other classes remain atomic-audit-guaranteed but not independently metered — disclosed
  in the SLO `ownerExplanation` and `measurementWindow`.
- `PROOF_TO_OUTCOME_CORRELATION` stays NOT_MEASURABLE (no persisted proof↔outcome join key).
- `OwnerReassessmentEvent` has no creation service wired yet in the app; the correlation reads whatever
  rows exist. Latency uses `updatedAt` as the close time (Prisma `@updatedAt`), which equals the last
  write — accurate for the closed transition.

## H. Manual verification
See `RUNTIME_CONTROL_CORRELATION_TEST_EVIDENCE_LEDGER.md` for exact commands.

## I. Trigger map
Shock create → `SHOCK_EVENT_RECORDED` (durability) + `triggerReEvaluation` → `CONDITION_CHANGED`
(handling). Proof precheck `POSSIBLE_TAMPER_RISK` → `Proof.tamperSuspected=true`. Now-view read →
`getControlCorrelations` → measured SLOs.

## J. Failure modes covered
Unhandled shock (FAILED), unaudited mutation (durability breach FAIL), overdue-open reassessment
(FAILED), no events (NOT_MEASURABLE), user-backdated `happenedAt` (ignored — server `createdAt` used),
cross-workspace bleed (isolated), absent optional table (P2021 → empty, not a crash).

## K. Events emitted
No new event types. Reuses `shock.event_recorded`, `condition.changed`, `ai_proof_precheck.recorded`.

## L. Automated tests added
14 pure unit (control-correlation) + 4 SLO measured-grading cases + 2 precheck tamper cases + 3 DB
simulation scenarios = **23 new tests**.
