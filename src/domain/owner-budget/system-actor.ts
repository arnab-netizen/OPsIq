/**
 * P0-09 — system-actor representation for scheduler-initiated budget reassessment.
 *
 * Root cause fixed: `SCHEDULER_SYSTEM_ACTOR` ("00000000-…-0000") is a sentinel
 * used as `actorId` by scheduler-initiated reassessment (due-reassessment.service.ts),
 * but every `emitAuditEvent` call reached from `reassessBudget`'s call graph
 * (budget.service.ts, action-link.service.ts, signal-router.service.ts) passed
 * it straight through as `actorId` with no `actorType`, which defaults to
 * "user". `AuditEvent.actorId` has a real FK to `users.id`
 * (`audit_events_actor_id_fkey`); this sentinel has never corresponded to a
 * real row, so every one of those writes raised P2003. The write inside
 * `reassessBudget`'s own `$transaction` rolled back the entire reassessment
 * (plan snapshot + reassessment row + its own audit event) it was meant to
 * persist atomically — meaning the scheduler-driven path was silently
 * producing zero real reassessments, with the failure swallowed by
 * `scanDueReassessments`'s per-business try/catch as an ordinary "skipped".
 *
 * Fix: map the sentinel to `{actorType: "system"}` with `actorId` omitted.
 * `AuditEvent.actorId` is nullable and its FK is skipped for NULL — this is
 * the same pattern already proven safe by the P0-08 scheduler's own lifecycle
 * audit (`auditTaskEvent` in src/infra/scheduler.ts). A real human actorId is
 * returned unchanged with `actorType: "system"` normalized to "user" so this
 * is a no-op for every non-scheduled (human-initiated) reassessment caller.
 */
export const SCHEDULER_SYSTEM_ACTOR = "00000000-0000-0000-0000-000000000000";

export interface AuditActor {
  actorId?: string;
  actorType: "user" | "system";
}

export function toAuditActor(actorId: string): AuditActor {
  return actorId === SCHEDULER_SYSTEM_ACTOR ? { actorType: "system" } : { actorId, actorType: "user" };
}
