import { db } from "@/lib/db";
import type { UserRole } from "@/domain/auth/types";

export interface AuditEventParams {
  eventName: string; // CREATE, UPDATE, DELETE, OVERRIDE, COMPLETE, etc.
  entityType: string; // OperatorItem, Override, Entity, etc.
  entityId: string;
  actorId: string | null; // from session
  role: UserRole | null; // from resolveServerRole()
  before?: unknown; // snapshot before change (null for CREATE)
  after: unknown; // snapshot after change
  metadata?: Record<string, unknown>;
  visibility?: "internal" | "client_visible";
}

/**
 * Log an audit event for a mutation.
 *
 * - Writes to database
 * - Includes actor, role, before/after snapshots
 * - Throws if write fails (fail-closed)
 */
export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  const {
    eventName,
    entityType,
    entityId,
    actorId,
    role,
    before,
    after,
    metadata,
    visibility = "internal",
  } = params;

  try {
    await db.auditEvent.create({
      data: {
        eventName,
        entityType,
        entityId,
        actorId,
        actorType: "user",
        visibility,
        payload: {
          role,
          before,
          after,
          ...metadata,
        },
      },
    });
  } catch (error) {
    // Fail-closed: if audit fails, the operation fails
    throw new Error(
      `Audit log failed for ${eventName} on ${entityType} ${entityId}: ${
        error instanceof Error ? error.message : String(error)
      }`
    );
  }
}
