import type { ServiceCapabilityContext } from '@/lib/auth-guard';
import type { UserRole } from "@/domain/auth/types";
import { requireWorkspaceContext } from "@/services/workspace/context";
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
    let workspaceId = params.workspaceId;

    if (!workspaceId) {
      // Try to get workspace from context if not provided
      const workspace = await requireWorkspaceContext();
      workspaceId = workspace.workspaceId;
    }

    if (!workspaceId) {
      throw new Error("Audit event workspaceId is required for workspace isolation");
    }

    await db.auditEvent.create({
      data: {
        id: randomUUID(),
        workspaceId,
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
