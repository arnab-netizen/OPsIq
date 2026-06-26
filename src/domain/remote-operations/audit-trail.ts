/**
 * R21 — Audit trail (§104 #14, §34). Pure.
 *
 * Every governed remote action — state transition, access-code view, owner override,
 * dispatch, approval, rejection, offline sync, harm event — must emit an immutable audit
 * event carrying workspace, actor, type and timestamp. An event missing those is not
 * auditable (fail-closed). This is the shape + rules; persistence reuses the existing
 * Owner Mode audit/event layer.
 */

export type AuditEventType =
  | "STATE_TRANSITION" | "ACCESS_CODE_VIEW" | "OWNER_OVERRIDE" | "DISPATCH" | "APPROVAL"
  | "REJECTION" | "OFFLINE_SYNC" | "HARM_EVENT" | "REPLAN" | "ESCALATION" | "MANAGER_ACTION";

export interface AuditEvent {
  workspaceId: string;
  locationId?: string;
  actor: string;
  actorRole?: string;
  type: AuditEventType;
  timestampMs: number;
  detail: string;
  /** Linked governed object (taskId / planId / proofId / issueId). */
  subjectId?: string;
}

function blank(s: string | undefined | null): boolean {
  return typeof s !== "string" || s.trim().length === 0;
}

/** Returns violations; empty = auditable. */
export function validateAuditEvent(e: AuditEvent): string[] {
  const v: string[] = [];
  if (blank(e.workspaceId)) v.push("missing_workspace_id");
  if (blank(e.actor)) v.push("missing_actor");
  if (blank(e.type)) v.push("missing_type");
  if (!(e.timestampMs > 0)) v.push("missing_timestamp");
  return v;
}

export class UnauditableActionError extends Error {
  readonly code = "UNAUDITABLE_ACTION";
  readonly violations: string[];
  constructor(violations: string[]) { super(`Action is not auditable: ${violations.join(", ")}.`); this.name = "UnauditableActionError"; this.violations = violations; }
}

export function assertAuditable(e: AuditEvent): void {
  const v = validateAuditEvent(e);
  if (v.length > 0) throw new UnauditableActionError(v);
}

/** An append-only audit log (immutable entries; no edit/delete). */
export class AuditLog {
  private readonly events: AuditEvent[] = [];
  append(e: AuditEvent): void {
    assertAuditable(e);
    this.events.push(Object.freeze({ ...e }));
  }
  all(): readonly AuditEvent[] { return this.events; }
  forSubject(subjectId: string): AuditEvent[] { return this.events.filter((e) => e.subjectId === subjectId); }
  ofType(type: AuditEventType): AuditEvent[] { return this.events.filter((e) => e.type === type); }
}
