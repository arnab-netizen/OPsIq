# Completion / Escalation Timing Evidence — REPORT

## A. Files created
- `src/domain/owner-mode/timing-evidence.ts` — pure evaluators `evaluateFastCompletion`,
  `evaluateEscalationTiming`, `isActiveTimingSignal`; the 16-field `TimingSignal`; the status unions.
- `prisma/migrations/20260705170000_completion_escalation_timing_evidence/migration.sql` — additive columns.
- `src/__tests__/owner-mode/timing-evidence.test.ts` — 18 unit tests (every status + integration).
- `src/__tests__/execution/completion-escalation-timing-simulation.db.test.ts` — 5 laundry DB-sim tests.
- `docs/remediation/completion-escalation-timing-evidence-depth-pass/` — this pack (6 docs).

## B. Files changed
- `prisma/schema.prisma` — `Proof.workStartedAt`; `Escalation.acknowledgedAt` + `Escalation.acknowledgedBy`.
- `src/domain/owner-mode/anti-gaming-analytics.ts` — optional `fastCompletion` / `escalationTiming`
  inputs; `mapTimingSignalToGaming`; active timing signals pushed as gaming signals.
- `src/services/owner-guidance/owner-now-view.service.ts` — proof timing fields in the select; optional
  `escalation` delegate; evaluate both timing signals; expose `timingEvidence`; feed the gaming pipeline.

## C. Schema changes
Three nullable, backfill-safe columns (see the migration). No existing column/index/row altered.
`work_started_at` + existing `submitted_at` = trusted completion duration. `acknowledged_at` +
existing `due_at`/`resolved_at` = trusted escalation ack/resolution timing.

## D. Backend logic
- **Fast-completion**: per-proof-type baseline = median of the workspace's own accepted, timed
  completions (`baselineSource` / `baselineConfidence` reported); a job under 20% of its type baseline is
  fast; ≥ 2 by one operator = pattern. Null timing → `TIMING_MISSING`; thin history → `BASELINE_MISSING`.
- **Ignores-escalation**: unacknowledged-past-due or acknowledged-but-unresolved-past-window, attributed
  per assigned manager; ≥ 2 unacknowledged = pattern. No due time → `ESCALATION_TIMING_MISSING`; no
  assignment → `NO_MANAGER_ASSIGNMENT`.
- Both map into anti-gaming keeping their evidence ids (proof ids / escalation ids) as the suppression key.

## E. Frontend logic
None. No owner UI in this pass (out of scope). Signals are exposed on the now-view API
(`topGamingSignal` + `timingEvidence`) for a later UI.

## F. Acceptance criteria checklist
- [x] `SUSPICIOUS_FAST_COMPLETION` produced from persisted trusted timing + a derived baseline.
- [x] `MANAGER_IGNORES_ESCALATION` produced from persisted trusted escalation ack timing.
- [x] All six fast-completion statuses + all seven escalation statuses reachable and tested.
- [x] 16-field output shape incl. `timingEvidence`, `baselineSource`, `baselineConfidence`, `sourceCompleteness`.
- [x] No fabricated timestamps/baselines; missing data fail-visible (`BLOCKED_BY_DATA` / named blocked status).
- [x] Signals adjudication-suppressible on their exact evidence ids; new evidence re-surfaces.
- [x] No fraud/theft/negligence label; no hidden score; completion time never inferred from user text.
- [x] `tsc` 0 · `prisma validate` valid · governance 31 frozen / 0 new.
- [x] 18 unit + 5 DB-sim tests pass; changed-area DB suite 849/849 green.

## G. Known limitations
- `work_started_at` / `acknowledged_at` are captured going forward; legacy rows read as
  `TIMING_MISSING` / unacknowledged until write paths populate them (fail-visible by design).
- Baseline needs ≥ 3 accepted timed completions per proof type before it engages (else `BASELINE_MISSING`).
- No owner UI; browser E2E untouched.

## H. Manual verification
See `TEST_EVIDENCE_LEDGER.md` for exact commands.

## I. Trigger map
- New proof with `work_started_at` + `submitted_at` → fast-completion re-evaluated on next now-view.
- New escalation past `due_at` without `acknowledged_at` → ignores-escalation re-evaluated.
- Owner adjudication (accept/dismiss) on a timing signal's ids → suppression; new id → re-surface.

## J. Failure modes covered
Null work-start (`TIMING_MISSING`); thin history (`BASELINE_MISSING`); no escalation due time
(`ESCALATION_TIMING_MISSING`); unassigned overdue escalation (`NO_MANAGER_ASSIGNMENT`); clean workspace
(`DATA_INSUFFICIENT`, no bleed); sub-second clock artefacts ignored; per-type baseline isolation.

## K. Events emitted
No new audit event type. Timing signals are read-model analytics over existing persisted rows; the
adjudication path (unchanged) still emits `proof_risk.adjudicated`.

## L. Automated tests added
18 unit (`timing-evidence.test.ts`) + 5 DB simulation (`completion-escalation-timing-simulation.db.test.ts`).
