/**
 * Phase D1-A: Admin Read Operability Service
 *
 * Real, database-backed read queries for the admin operability surface.
 * These replace the previously stubbed/in-memory admin read paths.
 *
 * Scope (read-only):
 *   - listWorkspacesForAdmin  → backs GET /api/admin/workspaces
 *   - queryAuditLogForAdmin   → backs GET /api/admin/audit-log
 *
 * Governance:
 *   - No writes. These functions never mutate any record.
 *   - Audit-log reads are strictly workspace-scoped (workspaceId is mandatory).
 *   - Only safe, schema-real fields are exposed (raw audit payload is NOT
 *     returned, to avoid leaking internal/sensitive event detail).
 *   - Authorization is enforced upstream by the canonical route wrapper;
 *     this service receives only verified inputs.
 */

import { db } from "@/lib/db";

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const MIN_LIMIT = 1;

/** Clamp a requested limit into the safe [MIN_LIMIT, MAX_LIMIT] range. */
function clampLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MAX_LIMIT, Math.floor(limit)));
}

/** Encode an opaque, id-based pagination cursor. */
function encodeCursor(id: string): string {
  return Buffer.from(JSON.stringify({ id }), "utf-8").toString("base64");
}

/** Decode an opaque pagination cursor; returns null if malformed. */
function decodeCursor(cursor: string | null | undefined): string | null {
  if (!cursor) return null;
  try {
    const decoded = JSON.parse(Buffer.from(cursor, "base64").toString("utf-8"));
    return typeof decoded?.id === "string" ? decoded.id : null;
  } catch {
    return null;
  }
}

export interface AdminPagination {
  limit: number;
  cursor: string | null;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface AdminWorkspaceSummary {
  id: string;
  name: string;
  slug: string;
  isActive: boolean;
  createdAt: string;
  memberCount: number;
}

export interface AdminWorkspaceListResult {
  workspaces: AdminWorkspaceSummary[];
  pagination: AdminPagination;
}

/**
 * List workspaces for the admin operability view (read-only).
 *
 * Deterministic ordering by (createdAt, id) for stable cursor pagination.
 * memberCount counts only active memberships.
 */
export async function listWorkspacesForAdmin(opts: {
  limit?: number;
  cursor?: string | null;
}): Promise<AdminWorkspaceListResult> {
  const limit = clampLimit(opts.limit);
  const cursorId = decodeCursor(opts.cursor);

  // Fetch one extra row to determine hasMore without a second count query.
  const rows = await db.workspace.findMany({
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      name: true,
      slug: true,
      isActive: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  // Active-member counts for the page, in a single grouped query.
  const ids: string[] = page.map((w: { id: string }) => w.id);
  const countsByWorkspace = new Map<string, number>();
  if (ids.length > 0) {
    const grouped = await db.workspaceMembership.groupBy({
      by: ["workspaceId"],
      where: { workspaceId: { in: ids }, isActive: true },
      _count: { _all: true },
    });
    for (const g of grouped as Array<{ workspaceId: string; _count: { _all: number } }>) {
      countsByWorkspace.set(g.workspaceId, g._count._all);
    }
  }

  const workspaces: AdminWorkspaceSummary[] = page.map(
    (w: { id: string; name: string; slug: string; isActive: boolean; createdAt: Date }) => ({
      id: w.id,
      name: w.name,
      slug: w.slug,
      isActive: w.isActive,
      createdAt: w.createdAt.toISOString(),
      memberCount: countsByWorkspace.get(w.id) ?? 0,
    })
  );

  const nextCursor =
    hasMore && workspaces.length > 0
      ? encodeCursor(workspaces[workspaces.length - 1].id)
      : null;

  return {
    workspaces,
    pagination: {
      limit,
      cursor: opts.cursor ?? null,
      nextCursor,
      hasMore,
    },
  };
}

export interface AdminAuditEventSummary {
  id: string;
  workspaceId: string | null;
  eventName: string;
  entityType: string | null;
  entityId: string | null;
  actorId: string | null;
  actorType: string;
  visibility: string;
  correlationId: string | null;
  occurredAt: string;
}

export interface AdminAuditLogResult {
  events: AdminAuditEventSummary[];
  pagination: AdminPagination;
  statistics?: {
    totalEvents: number;
  };
}

/**
 * Query the persisted audit trail for a single workspace (read-only).
 *
 * workspaceId is MANDATORY and is the only tenant scope: events from other
 * workspaces are never returned. Ordering is (occurredAt desc, id desc) for
 * stable, newest-first cursor pagination.
 *
 * Raw event payload is intentionally NOT exposed; only safe metadata fields
 * are returned.
 */
export async function queryAuditLogForAdmin(opts: {
  workspaceId: string;
  eventName?: string;
  entityType?: string;
  entityId?: string;
  actorId?: string;
  limit?: number;
  cursor?: string | null;
  includeTotalCount?: boolean;
}): Promise<AdminAuditLogResult> {
  if (!opts.workspaceId) {
    throw new Error("queryAuditLogForAdmin requires a workspaceId for tenant isolation");
  }

  const limit = clampLimit(opts.limit);
  const cursorId = decodeCursor(opts.cursor);

  const where: Record<string, unknown> = { workspaceId: opts.workspaceId };
  if (opts.eventName) where.eventName = opts.eventName;
  if (opts.entityType) where.entityType = opts.entityType;
  if (opts.entityId) where.entityId = opts.entityId;
  if (opts.actorId) where.actorId = opts.actorId;

  const rows = await db.auditEvent.findMany({
    where,
    orderBy: [{ occurredAt: "desc" }, { id: "desc" }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      workspaceId: true,
      eventName: true,
      entityType: true,
      entityId: true,
      actorId: true,
      actorType: true,
      visibility: true,
      correlationId: true,
      occurredAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const events: AdminAuditEventSummary[] = page.map(
    (e: {
      id: string;
      workspaceId: string | null;
      eventName: string;
      entityType: string | null;
      entityId: string | null;
      actorId: string | null;
      actorType: string;
      visibility: string;
      correlationId: string | null;
      occurredAt: Date;
    }) => ({
      id: e.id,
      workspaceId: e.workspaceId,
      eventName: e.eventName,
      entityType: e.entityType,
      entityId: e.entityId,
      actorId: e.actorId,
      actorType: e.actorType,
      visibility: e.visibility,
      correlationId: e.correlationId,
      occurredAt: e.occurredAt.toISOString(),
    })
  );

  const nextCursor =
    hasMore && events.length > 0 ? encodeCursor(events[events.length - 1].id) : null;

  const result: AdminAuditLogResult = {
    events,
    pagination: {
      limit,
      cursor: opts.cursor ?? null,
      nextCursor,
      hasMore,
    },
  };

  if (opts.includeTotalCount) {
    const totalEvents = await db.auditEvent.count({ where: { workspaceId: opts.workspaceId } });
    result.statistics = { totalEvents };
  }

  return result;
}
