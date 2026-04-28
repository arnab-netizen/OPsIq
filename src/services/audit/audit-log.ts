import type { UserRole } from "@/domain/auth/types";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export interface AuditEventParams {
  eventName: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  role: UserRole | null;
  before: unknown;
  after: unknown;
  metadata?: Record<string, unknown>;
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    await db.auditEvent.create({
      data: {
        id: randomUUID(),
        eventName: params.eventName,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId: params.actorId,
        role: params.role,
        before: JSON.stringify(params.before),
        after: JSON.stringify(params.after),
        metadata: JSON.stringify(params.metadata),
        timestamp: new Date(),
      },
    });
  } catch (error) {
    console.error("Audit logging failed:", error);
    throw error;
  }
}
