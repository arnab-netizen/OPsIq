/**
 * STAGE 17 Slice 3: Audit Trail Queryability Contracts
 *
 * Domain contracts for querying and filtering audit events.
 * Contracts define the shape of audit trail queries, filtering, pagination.
 * Mock-backed implementation until database available.
 *
 * Design principles:
 * 1. Fail-closed: Missing audit record = operation not permitted
 * 2. Tenant-scoped: All queries enforce workspaceId
 * 3. Queryable: Support filtering by entity, actor, action, date range, status
 * 4. Paginated: Support cursor-based and offset pagination
 * 5. Searchable: Support entity type and action filtering for compliance
 */

import { z } from "zod";
import { AuditEvent } from "@/domain/event-audit/event-audit-contracts";

/**
 * Audit trail filtering options for queries
 */
export const AuditTrailFilterSchema = z.object({
  workspaceId: z.string().uuid().describe("Workspace scope (required)"),
  entityType: z.string().optional().describe("Filter by entity type (engagement, action, etc)"),
  entityId: z.string().uuid().optional().describe("Filter by specific entity"),
  actorId: z.string().uuid().optional().describe("Filter by who performed action"),
  actorRole: z.enum(["user", "service", "admin"]).optional().describe("Filter by actor role"),
  action: z.enum(["create", "read", "update", "delete", "export"]).optional().describe("Filter by operation"),
  status: z.enum(["success", "failure"]).optional().describe("Filter by success/failure"),
  fromDate: z.date().optional().describe("Start of date range"),
  toDate: z.date().optional().describe("End of date range"),
});

export type AuditTrailFilter = z.infer<typeof AuditTrailFilterSchema>;

/**
 * Pagination cursor format
 */
export const AuditTrailCursorSchema = z.object({
  id: z.string().uuid().describe("Event ID (sort key)"),
  timestamp: z.date().describe("Event timestamp (sort key)"),
});

export type AuditTrailCursor = z.infer<typeof AuditTrailCursorSchema>;

/**
 * Paginated audit trail query result
 */
export const AuditTrailPageSchema = z.object({
  events: z.array(z.object({
    id: z.string().uuid(),
    workspaceId: z.string().uuid(),
    entityType: z.string(),
    entityId: z.string().uuid(),
    actorId: z.string().uuid(),
    actorRole: z.enum(["user", "service", "admin"]),
    action: z.enum(["create", "read", "update", "delete", "export"]),
    status: z.enum(["success", "failure"]),
    reason: z.string().optional(),
    occurredAt: z.date(),
    recordedAt: z.date(),
  })),
  pagination: z.object({
    hasMore: z.boolean().describe("Whether more events exist"),
    totalCount: z.number().int().min(0).optional().describe("Total event count (if requested)"),
    nextCursor: AuditTrailCursorSchema.optional().describe("Cursor for next page"),
    pageSize: z.number().int().min(1).max(1000),
  }),
});

export type AuditTrailPage = z.infer<typeof AuditTrailPageSchema>;

/**
 * Query parameters for audit trail endpoint
 */
export const AuditTrailQueryParamsSchema = z.object({
  workspaceId: z.string().uuid().describe("Workspace scope"),
  entityType: z.string().optional(),
  entityId: z.string().uuid().optional(),
  actorId: z.string().uuid().optional(),
  action: z.enum(["create", "read", "update", "delete", "export"]).optional(),
  status: z.enum(["success", "failure"]).optional(),
  fromDate: z.string().datetime().optional().describe("ISO 8601 datetime"),
  toDate: z.string().datetime().optional().describe("ISO 8601 datetime"),
  limit: z.number().int().min(1).max(1000).default(100),
  cursor: z.string().optional().describe("Opaque cursor from previous page"),
  includeTotalCount: z.boolean().optional().default(false),
});

export type AuditTrailQueryParams = z.infer<typeof AuditTrailQueryParamsSchema>;

/**
 * Audit trail export format (CSV-compatible structure)
 */
export const AuditTrailExportRowSchema = z.object({
  id: z.string().uuid(),
  timestamp: z.string().describe("ISO 8601 datetime"),
  entityType: z.string(),
  entityId: z.string().uuid(),
  actorId: z.string().uuid(),
  actorRole: z.string(),
  action: z.string(),
  status: z.string(),
  reason: z.string().optional(),
  changedFields: z.string().optional().describe("Comma-separated list"),
  ipAddress: z.string().optional(),
});

export type AuditTrailExportRow = z.infer<typeof AuditTrailExportRowSchema>;

/**
 * Audit event statistics for a workspace (summary view)
 */
export const AuditStatisticsSchema = z.object({
  workspaceId: z.string().uuid(),
  totalEvents: z.number().int().min(0),
  successCount: z.number().int().min(0),
  failureCount: z.number().int().min(0),
  eventsByType: z.record(z.string(), z.number().int().min(0)),
  eventsByAction: z.record(z.string(), z.number().int().min(0)),
  eventsByActor: z.record(z.string().uuid(), z.number().int().min(0)),
  oldestEventDate: z.date().optional(),
  newestEventDate: z.date().optional(),
});

export type AuditStatistics = z.infer<typeof AuditStatisticsSchema>;

/**
 * Validate audit trail query has required fields
 */
export function validateAuditTrailQuery(query: AuditTrailFilter): string[] {
  const errors: string[] = [];

  if (!query.workspaceId) {
    errors.push("Workspace ID is required (tenant scope)");
  }

  if (query.fromDate && query.toDate && query.fromDate > query.toDate) {
    errors.push("From date cannot be after to date");
  }

  if (query.entityType && query.entityType.trim().length === 0) {
    errors.push("Entity type cannot be empty");
  }

  return errors;
}

/**
 * Format audit event for export (CSV-compatible row)
 */
export function formatAuditEventForExport(event: AuditEvent): AuditTrailExportRow {
  return {
    id: event.id,
    timestamp: event.occurredAt.toISOString(),
    entityType: event.entityType,
    entityId: event.entityId,
    actorId: event.actorId,
    actorRole: event.actorRole,
    action: event.action,
    status: event.status,
    reason: event.reason,
    changedFields: event.changedFields?.join(", "),
    ipAddress: event.ipAddress,
  };
}

/**
 * Check if audit event matches filter criteria
 */
export function auditEventMatchesFilter(event: AuditEvent, filter: AuditTrailFilter): boolean {
  // Workspace scope (required)
  if (event.workspaceId !== filter.workspaceId) {
    return false;
  }

  // Entity type filter
  if (filter.entityType && event.entityType !== filter.entityType) {
    return false;
  }

  // Entity ID filter
  if (filter.entityId && event.entityId !== filter.entityId) {
    return false;
  }

  // Actor ID filter
  if (filter.actorId && event.actorId !== filter.actorId) {
    return false;
  }

  // Actor role filter
  if (filter.actorRole && event.actorRole !== filter.actorRole) {
    return false;
  }

  // Action filter
  if (filter.action && event.action !== filter.action) {
    return false;
  }

  // Status filter
  if (filter.status && event.status !== filter.status) {
    return false;
  }

  // Date range filter
  if (filter.fromDate && event.occurredAt < filter.fromDate) {
    return false;
  }

  if (filter.toDate && event.occurredAt > filter.toDate) {
    return false;
  }

  return true;
}

/**
 * Sort audit events for pagination (most recent first)
 */
export function sortAuditEventsForPagination(events: AuditEvent[]): AuditEvent[] {
  return [...events].sort((a, b) => b.recordedAt.getTime() - a.recordedAt.getTime());
}
