# Runtime Control Correlation + Measurement Linkage — PLAN

**Branch:** `claude/opsiq-hostile-audit-jye6h4`
**Base:** `origin/main` @ `47a7741d` (Business-Control SLO depth pass merged).

## Objective
Persist and wire the minimum safe runtime correlation linkages needed to convert critical
Business-Control SLOs from `NOT_MEASURABLE` into measured `PASS/WARN/FAIL` — using **real persisted
timestamps only**, no fake correlations, no disconnected event model, no over-built event-sourcing.

## What is measurable from EXISTING models (no schema change)
| Correlation | Source (persisted) | Target (persisted) | SLO converted |
|---|---|---|---|
| `TRIGGER_TO_REASSESSMENT_CORRELATION` | `OwnerReassessmentEvent.createdAt` | `.updatedAt` on a `closed_*` status | `REASSESSMENT_LATENCY` |
| `SHOCK_TO_HANDLING_CORRELATION` | `ShockEvent.createdAt` (server record time) | `AuditEvent(CONDITION_CHANGED)` for `entityId=shock.id` | `SHOCK_HANDLING_LATENCY` |
| `GOVERNED_MUTATION_AUDIT_CORRELATION` | `ShockEvent` (a governed mutation) | `AuditEvent(SHOCK_EVENT_RECORDED)` for `entityId=shock.id` | `AUDIT_DURABILITY` (partial: shock class) |

These reuse the audit key already written by `createShockEvent` (atomic `SHOCK_EVENT_RECORDED`) and by
`triggerReEvaluation` (`CONDITION_CHANGED` with `entityType="ShockEvent"`, `entityId=shock.id`).

## What needs one minimal, backfill-safe schema field
- `PROOF_TAMPER_SIGNAL_PERSISTENCE` — `Proof.tamperSuspected Boolean @default(false)`. Set atomically
  by `runProofPrecheck` when the deterministic precheck returns `POSSIBLE_TAMPER_RISK`. Consumed by the
  Evidence Credibility Graph (`itemCounts.tamperSuspected` → `TAMPER_SUSPECTED_PROOF` concern).
  Migration adds the column (`NOT NULL DEFAULT false`, so all existing rows backfill to `false` — no fake
  signal) + a `(workspace_id, tamper_suspected)` index for queryability.

## What stays NOT_MEASURABLE (documented, not faked)
- `PROOF_TO_OUTCOME_CORRELATION` — accepted-proof ↔ complaint/rework/bad-outcome. Delegated-task `Proof`
  and recommendation/action `OwnerActionOutcome` are disjoint entity trees with **no persisted join key**;
  complaint/rework are period aggregates (`ownerMetricSnapshot`), not per-proof. Emitted as
  `NOT_MEASURABLE` with the exact missing model.
- `AUDIT_DURABILITY` for non-shock mutation classes — architecturally guaranteed by atomic audit
  (AUDIT-01) but not yet independently metered as a runtime rate (disclosed as PARTIAL).

## Correlation record shape (every record)
`workspaceId, correlationType, sourceEntityType, sourceEntityId, targetEntityType, targetEntityId,
sourceTimestamp, targetTimestamp, correlationKey, actorId, status
(LINKED/MISSING_TARGET/MISSING_SOURCE/FAILED/NOT_MEASURABLE), latencyMs, evidence[], missingData[],
evaluatedAt`. No fabricated source/target timestamp; an absent target is `MISSING_TARGET` (within grace)
or `FAILED` (past grace), never a fake `LINKED`.

## Layering
1. `src/domain/owner-mode/control-correlation.ts` — pure, deterministic (no DB/clock).
2. `src/services/owner-mode/control-correlation.service.ts` — DB-backed, workspace-scoped, 90-day window.
3. `business-control-slo.ts` — grades the measured stats (thresholds centralized here).
4. `owner-now-view.service.ts` — live wiring; correlation report surfaced on the owner payload; measured
   stats feed the SLO input (fake-DI unit path omits it → stays honestly NOT_MEASURABLE).

## Cross-workspace isolation
Every query is workspace-scoped (shocks via `engagement.workspaceId`). A `CROSS_WORKSPACE_ISOLATION_RUNTIME_SIGNAL`
record asserts the scope. Proven by a DB simulation whose clean workspace sees zero of the laundry's
correlations and stays NOT_MEASURABLE.
