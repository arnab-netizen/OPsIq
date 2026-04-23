import { db } from "@/lib/db";

export interface MutationResponse<T = any> {
  data: T;
  meta: {
    id: string;
    version: number;
    timestamp: string;
    auditEventId: string;
    idempotencyKey?: string;
    replay?: boolean;
  };
}

export async function createMutationResponse<T extends { id: string; version: number }>(
  data: T,
  auditEventId: string,
  idempotencyKey?: string,
  replay?: boolean
): Promise<MutationResponse<T>> {
  return {
    data,
    meta: {
      id: data.id,
      version: data.version,
      timestamp: new Date().toISOString(),
      auditEventId,
      ...(idempotencyKey && { idempotencyKey }),
      ...(replay === true && { replay }),
    },
  };
}

export interface ListResponse<T = any> {
  items: T[];
  pagination: {
    limit: number;
    offset: number;
    total: number;
    hasMore: boolean;
  };
}

export function createListResponse<T>(
  items: T[],
  limit: number,
  offset: number,
  total: number
): ListResponse<T> {
  return {
    items,
    pagination: {
      limit,
      offset,
      total,
      hasMore: offset + limit < total,
    },
  };
}

export interface AuditQueryFilter {
  engagementId?: string;
  entityType?: string;
  entityId?: string;
  eventName?: string;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
}

export interface AuditEventResponse {
  id: string;
  eventName: string;
  actorId: string | null;
  entityType: string | null;
  entityId: string | null;
  payload: Record<string, unknown>;
  correlationId?: string;
  occurredAt: string;
}

export async function queryAuditEvents(
  filters: AuditQueryFilter
): Promise<{ events: AuditEventResponse[]; total: number }> {
  const limit = Math.min(filters.limit || 50, 200);
  const offset = filters.offset || 0;

  const where: any = {};

  if (filters.engagementId) {
    where.correlationId = { contains: filters.engagementId };
  }
  if (filters.entityType) {
    where.entityType = filters.entityType;
  }
  if (filters.entityId) {
    where.entityId = filters.entityId;
  }
  if (filters.eventName) {
    where.eventName = filters.eventName;
  }
  if (filters.startDate || filters.endDate) {
    where.createdAt = {};
    if (filters.startDate) {
      where.createdAt.gte = new Date(filters.startDate);
    }
    if (filters.endDate) {
      where.createdAt.lte = new Date(filters.endDate);
    }
  }

  const [events, total] = await Promise.all([
    db.auditEvent.findMany({
      where,
      orderBy: { occurredAt: "desc" },
      take: limit,
      skip: offset,
      select: {
        id: true,
        eventName: true,
        actorId: true,
        entityType: true,
        entityId: true,
        payload: true,
        correlationId: true,
        occurredAt: true,
      },
    }),
    db.auditEvent.count({ where }),
  ]);

  return {
    events: events.map((e) => ({
      id: e.id,
      eventName: e.eventName,
      actorId: e.actorId,
      entityType: e.entityType,
      entityId: e.entityId,
      payload: typeof e.payload === "string" ? JSON.parse(e.payload) : e.payload,
      correlationId: e.correlationId || undefined,
      occurredAt: e.occurredAt.toISOString(),
    })),
    total,
  };
}
