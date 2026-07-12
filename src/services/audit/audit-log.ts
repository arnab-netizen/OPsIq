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
  workspaceId?: string; // Optional in interface, but required at runtime
}

export async function logAuditEvent(params: AuditEventParams): Promise<void> {
  try {
    // Workspace isolation: fail closed if no workspace ID provided
    const workspaceId = params.workspaceId;

    if (!workspaceId) {
      throw new Error("Audit event workspaceId is required for workspace isolation");
    }

    const auditData: any = {
      id: randomUUID(),
      workspaceId,
      eventName: params.eventName,
      entityType: params.entityType,
      entityId: params.entityId,
      before: JSON.stringify(params.before),
      after: JSON.stringify(params.after),
      payload: JSON.stringify({
        ...params.metadata,
        role: params.role,
      }),
      occurredAt: new Date(),
    };

    if (params.actorId) {
      auditData.actor = { connect: { id: params.actorId } };
    }

    await db.auditEvent.create({
      data: auditData,
    });
  } catch (error) {
    console.error("Audit logging failed:", error);
    throw error;
  }
}
