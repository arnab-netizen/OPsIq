import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import type { AuditEventName } from "@/domain/constants/audit-events";

export type Visibility = "internal" | "client_visible";

export interface AuditEventInput {
  eventName: AuditEventName;
  workspaceId?: string;
  actorId?: string;
  actorType?: string;
  entityType?: string;
  entityId?: string;
  payload?: Record<string, unknown>;
  correlationId?: string;
  visibility?: Visibility;
}

export async function emitAuditEvent(input: AuditEventInput): Promise<string> {
  if (!input.workspaceId) {
    throw new Error("workspaceId is required for audit events");
  }

  const event = await db.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      eventName: input.eventName,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? "user",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: input.payload
        ? (input.payload as Prisma.InputJsonValue)
        : Prisma.DbNull,
      correlationId: input.correlationId ?? null,
      visibility: input.visibility ?? "internal",
    },
  });

  logger.info("Audit event emitted", {
    eventName: input.eventName,
    entityType: input.entityType,
    entityId: input.entityId,
    auditEventId: event.id,
  });

  return event.id;
}

export async function queryAuditEvents(filter: {
  workspaceId: string;
  entityType?: string;
  entityId?: string;
  eventName?: string;
  actorId?: string;
  from?: Date;
  to?: Date;
  visibility?: Visibility;
  limit?: number;
  offset?: number;
}) {
  return db.auditEvent.findMany({
    where: {
      workspaceId: filter.workspaceId,
      ...(filter.entityType && { entityType: filter.entityType }),
      ...(filter.entityId && { entityId: filter.entityId }),
      ...(filter.eventName && { eventName: filter.eventName }),
      ...(filter.actorId && { actorId: filter.actorId }),
      ...(filter.visibility && { visibility: filter.visibility }),
      ...(filter.from || filter.to
        ? {
            occurredAt: {
              ...(filter.from && { gte: filter.from }),
              ...(filter.to && { lte: filter.to }),
            },
          }
        : {}),
    },
    orderBy: { occurredAt: "desc" },
    take: Math.min(filter.limit ?? 50, 100),
    skip: filter.offset ?? 0,
  });
}
