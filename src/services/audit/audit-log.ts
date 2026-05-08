import type { UserRole } from "@/domain/auth/types";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { randomUUID } from "crypto";
import { db } from "@/lib/db";

export interface AuditEventParams {
  eventName: string;
  entityType: string;
  entityId: string;
  actorId: string | null;
  actorType?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
  visibility?: string;
  workspaceId?: string; // Optional in interface, but required at runtime
}

export async function logAuditEvent(params: AuditEventParams): Promise<string> {
  try {
    // Workspace isolation: fail closed if no workspace ID provided
    let workspaceId = params.workspaceId;

    if (!workspaceId) {
      // Try to get workspace from context if not provided
      const workspace = await requireWorkspaceContext();
      workspaceId = workspace.workspaceId;
    }

    if (!workspaceId) {
      throw new Error("Audit event workspaceId is required for workspace isolation");
    }

    const event = await db.auditEvent.create({
      data: {
        workspaceId,
        eventName: params.eventName,
        entityType: params.entityType,
        entityId: params.entityId,
        actorId: params.actorId,
        actorType: params.actorType || "user",
        payload: params.payload || null,
        correlationId: params.correlationId,
        visibility: params.visibility || "internal",
        occurredAt: new Date(),
      },
    });
    return event.id;
  } catch (error) {
    console.error("Audit logging failed:", error);
    throw error;
  }
}
