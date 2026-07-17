/**
 * STAGE 17 Slice 3: Audit Trail Query Service
 *
 * Handles querying, filtering, and paginating audit events.
 * Mock-backed in-memory store (ready for database persistence later).
 *
 * All queries are workspace-scoped and enforce admin capability.
 */

import {
  AuditEvent,
  validateAuditEvent,
} from "@/domain/event-audit/event-audit-contracts";
import {
  AuditTrailFilter,
  AuditTrailPage,
  AuditStatistics,
  validateAuditTrailQuery,
  formatAuditEventForExport,
  auditEventMatchesFilter,
  sortAuditEventsForPagination,
} from "@/domain/audit/audit-trail-contracts";

/**
 * In-memory audit event store (mock-backed until database available)
 * In production, this would query the audit_events table
 */
class MockAuditEventStore {
  private events: AuditEvent[] = [];

  addEvent(event: AuditEvent): void {
    const errors = validateAuditEvent(event);
    if (errors.length > 0) {
      throw new Error(`Invalid audit event: ${errors.join(", ")}`);
    }
    this.events.push(event);
  }

  getAllEvents(): AuditEvent[] {
    return [...this.events];
  }

  clear(): void {
    this.events = [];
  }
}

const auditEventStore = new MockAuditEventStore();

/**
 * Query audit trail with filtering and pagination
 *
 * Returns paginated results with next cursor if more events exist.
 * All queries enforce workspace scope via filter.workspaceId.
 */
export async function queryAuditTrail(
  filter: AuditTrailFilter,
  limit: number = 100,
  cursor?: string
): Promise<AuditTrailPage> {
  // Validate query
  const errors = validateAuditTrailQuery(filter);
  if (errors.length > 0) {
    throw new Error(`Invalid audit trail query: ${errors.join(", ")}`);
  }

  // Get all matching events
  const allEvents = auditEventStore.getAllEvents();
  const matchingEvents = allEvents.filter((event) => auditEventMatchesFilter(event, filter));
  const sortedEvents = sortAuditEventsForPagination(matchingEvents);

  // Apply pagination
  let startIndex = 0;
  if (cursor) {
    const decodedCursor = JSON.parse(Buffer.from(cursor, "base64").toString());
    startIndex = sortedEvents.findIndex((e) => e.id === decodedCursor.id) + 1;
  }

  const pageEvents = sortedEvents.slice(startIndex, startIndex + limit);
  const hasMore = startIndex + limit < sortedEvents.length;

  const nextCursor = hasMore
    ? Buffer.from(
        JSON.stringify({
          id: pageEvents[pageEvents.length - 1]?.id,
          timestamp: pageEvents[pageEvents.length - 1]?.recordedAt,
        })
      ).toString("base64")
    : undefined;

  return {
    events: pageEvents.map((e) => ({
      id: e.id,
      workspaceId: e.workspaceId,
      entityType: e.entityType,
      entityId: e.entityId,
      actorId: e.actorId,
      actorRole: e.actorRole,
      action: e.action,
      status: e.status,
      reason: e.reason,
      occurredAt: e.occurredAt,
      recordedAt: e.recordedAt,
    })),
    pagination: {
      hasMore,
      nextCursor: nextCursor
        ? {
            id: pageEvents[pageEvents.length - 1].id,
            timestamp: pageEvents[pageEvents.length - 1].recordedAt,
          }
        : undefined,
      pageSize: pageEvents.length,
    },
  };
}

/**
 * Get audit trail for a specific entity
 */
export async function getAuditTrailForEntity(
  workspaceId: string,
  entityId: string,
  limit: number = 50
): Promise<AuditEvent[]> {
  const filter: AuditTrailFilter = {
    workspaceId,
    entityId,
  };

  const page = await queryAuditTrail(filter, limit);
  return page.events;
}

/**
 * Get audit trail for a specific actor (user/service)
 */
export async function getAuditTrailForActor(
  workspaceId: string,
  actorId: string,
  limit: number = 50
): Promise<AuditEvent[]> {
  const filter: AuditTrailFilter = {
    workspaceId,
    actorId,
  };

  const page = await queryAuditTrail(filter, limit);
  return page.events;
}

/**
 * Get audit statistics for workspace
 */
export async function getAuditStatistics(workspaceId: string): Promise<AuditStatistics> {
  const allEvents = auditEventStore.getAllEvents();
  const workspaceEvents = allEvents.filter((e) => e.workspaceId === workspaceId);

  const eventsByType: Record<string, number> = {};
  const eventsByAction: Record<string, number> = {};
  const eventsByActor: Record<string, number> = {};

  for (const event of workspaceEvents) {
    eventsByType[event.entityType] = (eventsByType[event.entityType] || 0) + 1;
    eventsByAction[event.action] = (eventsByAction[event.action] || 0) + 1;
    eventsByActor[event.actorId] = (eventsByActor[event.actorId] || 0) + 1;
  }

  const successCount = workspaceEvents.filter((e) => e.status === "success").length;
  const failureCount = workspaceEvents.filter((e) => e.status === "failure").length;

  const dates = workspaceEvents.map((e) => e.occurredAt.getTime());
  const oldestEventDate = dates.length > 0 ? new Date(Math.min(...dates)) : undefined;
  const newestEventDate = dates.length > 0 ? new Date(Math.max(...dates)) : undefined;

  return {
    workspaceId,
    totalEvents: workspaceEvents.length,
    successCount,
    failureCount,
    eventsByType,
    eventsByAction,
    eventsByActor,
    oldestEventDate,
    newestEventDate,
  };
}

/**
 * Export audit trail as array of rows (ready for CSV formatting)
 */
export async function exportAuditTrail(
  workspaceId: string,
  fromDate?: Date,
  toDate?: Date
): Promise<Array<Record<string, unknown>>> {
  const filter: AuditTrailFilter = {
    workspaceId,
    fromDate,
    toDate,
  };

  const allEvents = auditEventStore.getAllEvents();
  const matchingEvents = allEvents
    .filter((event) => auditEventMatchesFilter(event, filter))
    .sort((a, b) => a.occurredAt.getTime() - b.occurredAt.getTime());

  return matchingEvents.map((event) => formatAuditEventForExport(event));
}

/**
 * Add audit event to store (called by auditEvent emitter)
 * In production, this would insert into database
 */
export function addAuditEvent(event: AuditEvent): void {
  auditEventStore.addEvent(event);
}

/**
 * Clear all audit events (test helper)
 */
export function clearAuditTrail(): void {
  auditEventStore.clear();
}

/**
 * Get all audit events (test helper)
 */
export function getAllAuditEvents(): AuditEvent[] {
  return auditEventStore.getAllEvents();
}
