# Current Status Update — Runtime Control Correlation depth pass

- **Base:** `origin/main` @ `47a7741d` (Business-Control SLO depth pass, PR #112, merged).
- **Branch:** `claude/opsiq-hostile-audit-jye6h4`.
- **Classification:** `RUNTIME_CONTROL_CORRELATION_REAL_AND_OWNER_VISIBLE` (audit-durability partial, disclosed).

## Converted NOT_MEASURABLE → measured
- `REASSESSMENT_LATENCY` — from `OwnerReassessmentEvent` createdAt→closed.
- `SHOCK_HANDLING_LATENCY` — from `ShockEvent` recorded→`CONDITION_CHANGED` audit.
- `AUDIT_DURABILITY` — from `ShockEvent`→`SHOCK_EVENT_RECORDED` audit coverage (PARTIAL: shock class).

## Still NOT_MEASURABLE (documented, not faked)
- `PROOF_TO_OUTCOME_CORRELATION` — no persisted proof↔outcome join key; complaint/rework are period aggregates.
- `AUDIT_DURABILITY` for non-shock mutation classes — atomic-audit-guaranteed, not yet independently metered.
- `STARTUP_VALIDATION_COMPLETENESS`, `CROSS_WORKSPACE_ISOLATION_PROOF` (runtime) — unchanged from prior pass.

## New capability persisted
- `Proof.tamperSuspected` (backfill-safe column + index) — set atomically on precheck `POSSIBLE_TAMPER_RISK`,
  consumed by the Evidence Credibility Graph (`TAMPER_SUSPECTED_PROOF`) and surfaced in the now-view.

## Owner surface
`/api/owner/now-view` payload now carries `controlCorrelations` (the full correlation report) and the three
now-measured SLOs inside `businessControlHealth`.

## Verification
tsc 0 · prisma valid · governance strict 0-new · changed-area 79 files/667 tests green · 23 new tests.
Repo-wide: 14454 pass; 45 fail in 14 files all outside changed area, verified pre-existing on clean `47a7741d`.

## Not done (out of scope, per instructions)
Process Intelligence; public SaaS/billing; broad report cleanup; authenticated browser E2E.
