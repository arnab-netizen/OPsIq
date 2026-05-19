import { randomUUID } from "crypto";
import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { createHash } from "crypto";

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
  capability?: string;
  decision?: string;
  requestId?: string;
}

export interface MutationAuditEventInput extends AuditEventInput {
  actorId: string;
  workspaceId: string;
  capability: string;
  entityType: string;
  entityId: string;
  requestId: string;
}

function computeEventHash(eventId: string, workspaceId: string, eventName: string, timestamp: Date): string {
  const hashInput = `${eventId}|${workspaceId}|${eventName}|${timestamp.toISOString()}`;
  return createHash("sha256").update(hashInput).digest("hex");
}

export async function emitAuditEvent(input: AuditEventInput): Promise<string> {
  if (!input.workspaceId) {
    logger.warn("Audit event emitted without workspaceId - fail-safe activated", {
      eventName: input.eventName,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: "workspaceId is required for workspace isolation",
    capability: 'mutation',
    decision: 'input',
    requestId: randomUUID(),
    };
    return "fail-safe-no-workspace-id";
  }

  // Fetch the last audit event for this workspace to chain hashes
  const lastEvent = await db.auditEvent.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { occurredAt: "desc" },
    select: { id: true, previousHash: true },
  });

  const enrichedPayload = {
    ...input.payload,
    ...(input.capability && { capability: input.capability }),
    ...(input.decision && { decision: input.decision }),
    ...(input.requestId && { requestId: input.requestId }),
  };

  const event = await db.auditEvent.create({
    data: {
      workspaceId: input.workspaceId,
      eventName: input.eventName,
      actorId: input.actorId ?? null,
      actorType: input.actorType ?? "user",
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      payload: Object.keys(enrichedPayload).length > 0
        ? (enrichedPayload as Prisma.InputJsonValue)
        : Prisma.DbNull,
      correlationId: input.correlationId ?? null,
      visibility: input.visibility ?? "internal",
      previousHash: lastEvent ? computeEventHash(lastEvent.id, input.workspaceId, lastEvent.id, new Date()) : null,
    },
  });

  logger.info("Audit event emitted with hash chain", {
    eventName: input.eventName,
    entityType: input.entityType,
    entityId: input.entityId,
    auditEventId: event.id,
    hashChainLinked: !!lastEvent,
  });

  return event.id;
}

export async function emitMutationAuditEvent(input: MutationAuditEventInput): Promise<string> {
  if (!input.actorId || !input.workspaceId || !input.capability || !input.entityType || !input.entityId || !input.requestId) {
    logger.error("Mutation audit event missing required fields - rejecting", {
      missing: {
        actorId: !input.actorId,
        workspaceId: !input.workspaceId,
        capability: !input.capability,
        entityType: !input.entityType,
        entityId: !input.entityId,
        requestId: !input.requestId,
      },
      eventName: input.eventName,
    });
    throw new Error("Mutation audit event missing required fields: actorId, workspaceId, capability, entityType, entityId, requestId");
  }
  return emitAuditEvent(input);
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

export async function verifyAuditChainIntegrity(workspaceId: string): Promise<{ isValid: boolean; tamperedAt?: number }> {
  const events = await db.auditEvent.findMany({
    where: { workspaceId },
    orderBy: { occurredAt: "asc" },
    select: { id: true, previousHash: true },
  });

  for (let i = 1; i < events.length; i++) {
    const currentEvent = events[i];
    const previousEvent = events[i - 1];
    const expectedHash = computeEventHash(previousEvent.id, workspaceId, previousEvent.id, new Date());

    if (currentEvent.previousHash !== expectedHash) {
      return { isValid: false, tamperedAt: i };
    }
  }

  return { isValid: true };
}
