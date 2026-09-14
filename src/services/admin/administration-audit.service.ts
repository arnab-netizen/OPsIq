/**
 * Cross-workspace Administration audit log — read-only, capability-gated
 * (CUSTOMER_ACCESS_MANAGE/BETA_PROGRAM_MANAGE), NOT the tenant-isolated
 * single-workspace queryAuditLogForAdmin.
 *
 * Reuses the existing hash-chained AuditEvent infrastructure (never a
 * competing audit store): platform-level events (capacity/mode changes,
 * bootstrap, beta-request invite/revoke/reject/reopen, session revocation)
 * are pre-workspace (workspaceId: null, see infra/audit.ts's
 * createUnchainedPlatformEvent) and are queried via queryAuditEvents(null,
 * ...); suspend/restore events are workspace-scoped (real workspaceId, part
 * of the normal per-workspace hash chain) but this operator-facing view
 * deliberately reads them WITHOUT a single-workspace filter — a narrow,
 * intentional exception to the tenant-isolation pattern
 * queryAuditLogForAdmin enforces, justified because this endpoint is gated
 * to platform operators, not exposed to any workspace member.
 *
 * Never implies cryptographic verification for the unchained platform
 * events (see AdministrationAuditEntry's own doc comment).
 */
import { db } from "@/lib/db";
import { queryAuditEvents } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

const PLATFORM_EVENT_NAMES: string[] = [
  AUDIT_EVENTS.PLATFORM_SETTINGS_INITIALIZED,
  AUDIT_EVENTS.PLATFORM_ADMISSION_MODE_CHANGED,
  AUDIT_EVENTS.PLATFORM_CAPACITY_CHANGED,
  AUDIT_EVENTS.PLATFORM_CAPACITY_ALERT_SENT,
  AUDIT_EVENTS.BETA_REQUEST_MARKED_INVITED,
  AUDIT_EVENTS.BETA_REQUEST_REVOKED,
  AUDIT_EVENTS.BETA_REQUEST_REJECTED,
  AUDIT_EVENTS.BETA_REQUEST_REOPENED,
  AUDIT_EVENTS.SESSION_REVOKED,
  AUDIT_EVENTS.CUSTOMER_VERIFICATION_RESENT,
];

const WORKSPACE_SCOPED_EVENT_NAMES: string[] = [
  AUDIT_EVENTS.EMPLOYEE_SUSPENDED,
  AUDIT_EVENTS.EMPLOYEE_REACTIVATED,
];

export interface AdministrationAuditEntry {
  id: string;
  eventName: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  workspaceId: string | null;
  occurredAt: string;
  payload: Record<string, unknown> | null;
  /** False for every entry here — see this file's own doc comment. Never implies cryptographic verification. */
  chainVerified: false;
}

export async function getAdministrationAuditLog(limit = 50): Promise<AdministrationAuditEntry[]> {
  const cappedLimit = Math.min(Math.max(limit, 1), 100);

  const [platformEvents, workspaceEvents] = await Promise.all([
    queryAuditEvents({ workspaceId: null, limit: cappedLimit }).then((rows) =>
      rows.filter((r: { eventName: string }) => PLATFORM_EVENT_NAMES.includes(r.eventName))
    ),
    db.auditEvent.findMany({
      where: { eventName: { in: WORKSPACE_SCOPED_EVENT_NAMES } },
      orderBy: { occurredAt: "desc" },
      take: cappedLimit,
      select: {
        id: true,
        eventName: true,
        actorId: true,
        entityType: true,
        entityId: true,
        workspaceId: true,
        occurredAt: true,
        payload: true,
      },
    }),
  ]);

  const merged = [...platformEvents, ...workspaceEvents]
    .map(
      (e: {
        id: string;
        eventName: string;
        actorId: string | null;
        entityType: string | null;
        entityId: string | null;
        workspaceId: string | null;
        occurredAt: Date;
        payload: unknown;
      }): AdministrationAuditEntry => ({
        id: e.id,
        eventName: e.eventName,
        actorId: e.actorId,
        entityType: e.entityType,
        entityId: e.entityId,
        workspaceId: e.workspaceId,
        occurredAt: e.occurredAt.toISOString(),
        payload: (e.payload as Record<string, unknown>) ?? null,
        chainVerified: false,
      })
    )
    .sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());

  return merged.slice(0, cappedLimit);
}
