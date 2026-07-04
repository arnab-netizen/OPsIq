import { db } from "@/lib/db";
import { Prisma } from "@/generated/prisma/client";
import { logger } from "@/infra/logger";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { createHash } from "crypto";
import { v4 as uuidv4 } from "uuid";

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

function computeEventHash(eventId: string, workspaceId: string, eventName: string, timestamp: Date): string {
  const hashInput = `${eventId}|${workspaceId}|${eventName}|${timestamp.toISOString()}`;
  return createHash("sha256").update(hashInput).digest("hex");
}

/**
 * Minimal Prisma-client surface used by emitAuditEvent. Both `db` and a
 * `$transaction` tx client satisfy this, so audit writes can participate in a
 * caller's transaction (AUDIT-01: atomic mutation + audit that rolls back together).
 */
type AuditClient = Pick<Prisma.TransactionClient, "auditEvent">;

export async function emitAuditEvent(
  input: AuditEventInput,
  client: AuditClient = db
): Promise<string> {
  if (!input.workspaceId) {
    logger.warn("Audit event emitted without workspaceId - fail-safe activated", {
      eventName: input.eventName,
      entityType: input.entityType,
      entityId: input.entityId,
      reason: "workspaceId is required for workspace isolation",
    });
    return "fail-safe-no-workspace-id";
  }

  // Fetch the last audit event for this workspace to chain hashes.
  // Fetch eventName and occurredAt so the hash binds to actual event content
  // (using only the eventId twice was incorrect — fixed here).
  const lastEvent = await client.auditEvent.findFirst({
    where: { workspaceId: input.workspaceId },
    orderBy: { occurredAt: "desc" },
    select: { id: true, previousHash: true, eventName: true, occurredAt: true },
  });

  const eventId = uuidv4();
  const event = await client.auditEvent.create({
    data: {
      id: eventId,
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
      previousHash: lastEvent
        ? computeEventHash(lastEvent.id, input.workspaceId, lastEvent.eventName, lastEvent.occurredAt)
        : null,
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

export async function verifyAuditChainIntegrity(
  workspaceId: string,
  opts: { since?: Date } = {}
): Promise<{ isValid: boolean; tamperedAt?: number; eventsChecked: number }> {
  const events = await db.auditEvent.findMany({
    where: {
      workspaceId,
      ...(opts.since ? { occurredAt: { gte: opts.since } } : {}),
    },
    orderBy: { occurredAt: "asc" },
    // Fetch eventName and occurredAt so hash recomputation uses the same inputs
    // that were used when the chain was written. Using `new Date()` at verify
    // time was non-deterministic and always-failing — fixed here.
    select: { id: true, previousHash: true, eventName: true, occurredAt: true },
  });

  for (let i = 1; i < events.length; i++) {
    const currentEvent = events[i];
    const previousEvent = events[i - 1];
    const expectedHash = computeEventHash(
      previousEvent.id,
      workspaceId,
      previousEvent.eventName,
      previousEvent.occurredAt
    );

    if (currentEvent.previousHash !== expectedHash) {
      return { isValid: false, tamperedAt: i, eventsChecked: i };
    }
  }

  return { isValid: true, eventsChecked: Math.max(0, events.length - 1) };
}
