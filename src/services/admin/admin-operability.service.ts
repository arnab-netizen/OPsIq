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
import type { Prisma } from "@/generated/prisma/client";
import { NotFoundError } from "@/infra/errors";
import { emitAuditEvent } from "@/infra/audit";
import type { AuditEventName } from "@/domain/constants/audit-events";
import { getEmailProvider } from "@/lib/integrations/email-provider";
import { getConfig } from "@/lib/config";
import { escapeHtml } from "@/lib/integrations/email-html";
import { INVITE_TTL_DAYS } from "@/lib/beta";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

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

// ---------------------------------------------------------------------------
// Phase D1-B: Admin member listing (read-only)
// Backs GET /api/admin/workspaces/[id]/members
// ---------------------------------------------------------------------------

const MEMBER_DEFAULT_LIMIT = 50;
const MEMBER_MAX_LIMIT = 100;

/** Clamp a requested member-listing limit into [MIN_LIMIT, MEMBER_MAX_LIMIT]. */
function clampMemberLimit(limit: number | undefined): number {
  if (limit === undefined || Number.isNaN(limit)) return MEMBER_DEFAULT_LIMIT;
  return Math.max(MIN_LIMIT, Math.min(MEMBER_MAX_LIMIT, Math.floor(limit)));
}

export interface AdminWorkspaceMemberSummary {
  userId: string;
  name: string | null;
  email: string | null;
  role: string;
  isActive: boolean;
  addedAt: string;
}

export interface AdminWorkspaceMemberListResult {
  workspaceId: string;
  members: AdminWorkspaceMemberSummary[];
  pagination: AdminPagination;
}

/**
 * List the active members of a single workspace for the admin operability view
 * (read-only).
 *
 * workspaceId is MANDATORY and is the only tenant scope: members of other
 * workspaces are never returned. Only active, non-removed memberships are
 * included. Ordering is (addedAt asc, id asc) for stable cursor pagination.
 *
 * Only safe identity fields are exposed (userId, name, email, role, isActive,
 * addedAt). Email is included because this surface is SYSTEM_ADMIN-gated and
 * needed for operator support; no secrets/tokens/password material is read.
 */
export async function listWorkspaceMembersForAdmin(
  workspaceId: string,
  opts: { limit?: number; cursor?: string | null } = {}
): Promise<AdminWorkspaceMemberListResult> {
  if (!workspaceId) {
    throw new Error("listWorkspaceMembersForAdmin requires a workspaceId for tenant isolation");
  }

  const limit = clampMemberLimit(opts.limit);
  const cursorId = decodeCursor(opts.cursor);

  const rows = await db.workspaceMembership.findMany({
    where: { workspaceId, isActive: true, removedAt: null },
    orderBy: [{ addedAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      userId: true,
      role: true,
      isActive: true,
      addedAt: true,
      user: { select: { name: true, email: true } },
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const members: AdminWorkspaceMemberSummary[] = page.map(
    (m: {
      id: string;
      userId: string;
      role: string;
      isActive: boolean;
      addedAt: Date;
      user: { name: string | null; email: string | null } | null;
    }) => ({
      userId: m.userId,
      name: m.user?.name ?? null,
      email: m.user?.email ?? null,
      role: m.role,
      isActive: m.isActive,
      addedAt: m.addedAt.toISOString(),
    })
  );

  // Cursor uses membership id; the last page row's membership id is encoded.
  const lastRowId = hasMore ? page[page.length - 1]?.id : undefined;
  const nextCursor = hasMore && lastRowId ? encodeCursor(lastRowId) : null;

  return {
    workspaceId,
    members,
    pagination: {
      limit,
      cursor: opts.cursor ?? null,
      nextCursor,
      hasMore,
    },
  };
}

// ---------------------------------------------------------------------------
// Phase D1-D: Admin workspace soft-disable (governed write)
// Backs POST /api/admin/workspaces/[id]/disable
// ---------------------------------------------------------------------------

export interface DisableWorkspaceInput {
  workspaceId: string;
  actorId: string;
  reason?: string | null;
  notifyMembers?: boolean;
}

export interface DisableWorkspaceResult {
  workspaceId: string;
  status: "disabled";
  isActive: false;
  reason: string | null;
  disabledAt: string;
}

/**
 * Soft-disable a workspace (set Workspace.isActive=false). Never hard-deletes.
 *
 * Governance:
 *   - Throws NotFoundError if the workspace does not exist.
 *   - Concurrency-safe, emit-once: the state transition is performed with a
 *     conditional update (only when currently active). A WORKSPACE_DISABLED
 *     audit event is emitted ONLY when an actual active→disabled transition
 *     occurs; an already-disabled workspace is an idempotent no-op with no new
 *     audit event.
 *   - Audit is emitted via the centralized, hash-chained `emitAuditEvent`
 *     helper using only schema-real columns (the event name string is bridged
 *     to AuditEventName; adding the constant is out of this slice's scope).
 *   - No member mutation, no notification side effects, no schema change.
 */
export async function disableWorkspaceForAdmin(
  input: DisableWorkspaceInput
): Promise<DisableWorkspaceResult> {
  const { workspaceId, actorId } = input;
  const reason = input.reason ?? null;
  const notifyMembers = input.notifyMembers ?? true;

  if (!workspaceId) {
    throw new Error("disableWorkspaceForAdmin requires a workspaceId");
  }

  const existing = await db.workspace.findUnique({
    where: { id: workspaceId },
    select: { id: true, isActive: true },
  });
  if (!existing) {
    throw new NotFoundError("Workspace", workspaceId);
  }

  const disabledAt = new Date().toISOString();

  // Atomic, concurrency-safe transition: only active → disabled flips a row.
  const updated = await db.workspace.updateMany({
    where: { id: workspaceId, isActive: true },
    data: { isActive: false },
  });

  // Emit the governed audit event exactly once, only on a real state change.
  if (updated.count === 1) {
    await emitAuditEvent({
      eventName: "WORKSPACE_DISABLED" as AuditEventName,
      workspaceId,
      actorId,
      actorType: "user",
      entityType: "workspace",
      entityId: workspaceId,
      visibility: "internal",
      payload: {
        reason,
        notifyMembers,
        before: { isActive: true },
        after: { isActive: false },
      },
    });
  }

  return {
    workspaceId,
    status: "disabled",
    isActive: false,
    reason,
    disabledAt,
  };
}

// ---------------------------------------------------------------------------
// Controlled-beta homepage capture — owner review (read + governed write)
// Backs GET /api/admin/beta-requests and POST /api/admin/beta-requests/[id]/invite
// ---------------------------------------------------------------------------

export interface AdminBetaRequestSummary {
  id: string;
  email: string;
  firstName: string | null;
  status: string;
  utmSource: string | null;
  utmMedium: string | null;
  utmCampaign: string | null;
  utmContent: string | null;
  utmTerm: string | null;
  landingPath: string | null;
  conversionPath: string | null;
  referrerHost: string | null;
  invitedAt: string | null;
  invitedBy: string | null;
  createdAt: string;
}

export interface AdminBetaRequestListResult {
  betaRequests: AdminBetaRequestSummary[];
  pagination: AdminPagination;
}

/**
 * List beta-access requests for the owner review surface (read-only).
 *
 * This is the minimum viable "HOW_OWNER_REVIEWS_REQUESTS" mechanism for the
 * controlled-beta homepage capture: no new UI dashboard, API-only, mirroring
 * listWorkspacesForAdmin's exact shape/pagination. Ordering is
 * (createdAt asc, id asc) for stable cursor pagination, oldest (first-come)
 * request first.
 */
export async function listBetaRequestsForAdmin(opts: {
  status?: string;
  limit?: number;
  cursor?: string | null;
}): Promise<AdminBetaRequestListResult> {
  const limit = clampLimit(opts.limit);
  const cursorId = decodeCursor(opts.cursor);

  const rows = await db.betaRequest.findMany({
    where: opts.status ? { status: opts.status } : undefined,
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    take: limit + 1,
    ...(cursorId ? { cursor: { id: cursorId }, skip: 1 } : {}),
    select: {
      id: true,
      email: true,
      firstName: true,
      status: true,
      utmSource: true,
      utmMedium: true,
      utmCampaign: true,
      utmContent: true,
      utmTerm: true,
      landingPath: true,
      conversionPath: true,
      referrerHost: true,
      invitedAt: true,
      invitedBy: true,
      createdAt: true,
    },
  });

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;

  const betaRequests: AdminBetaRequestSummary[] = page.map(
    (r: {
      id: string;
      email: string;
      firstName: string | null;
      status: string;
      utmSource: string | null;
      utmMedium: string | null;
      utmCampaign: string | null;
      utmContent: string | null;
      utmTerm: string | null;
      landingPath: string | null;
      conversionPath: string | null;
      referrerHost: string | null;
      invitedAt: Date | null;
      invitedBy: string | null;
      createdAt: Date;
    }) => ({
      id: r.id,
      email: r.email,
      firstName: r.firstName,
      status: r.status,
      utmSource: r.utmSource,
      utmMedium: r.utmMedium,
      utmCampaign: r.utmCampaign,
      utmContent: r.utmContent,
      utmTerm: r.utmTerm,
      landingPath: r.landingPath,
      conversionPath: r.conversionPath,
      referrerHost: r.referrerHost,
      invitedAt: r.invitedAt ? r.invitedAt.toISOString() : null,
      invitedBy: r.invitedBy,
      createdAt: r.createdAt.toISOString(),
    })
  );

  const nextCursor =
    hasMore && betaRequests.length > 0 ? encodeCursor(betaRequests[betaRequests.length - 1].id) : null;

  return {
    betaRequests,
    pagination: {
      limit,
      cursor: opts.cursor ?? null,
      nextCursor,
      hasMore,
    },
  };
}

export interface MarkBetaRequestInvitedInput {
  betaRequestId: string;
  actorId: string;
}

export interface MarkBetaRequestInvitedResult {
  id: string;
  status: string;
  invitedAt: string | null;
  invitedBy: string | null;
}

/**
 * Best-effort applicant email on the actual REQUESTED -> INVITED transition.
 * Reuses the same getEmailProvider() plumbing and NEXT_PUBLIC_APP_URL
 * mechanism already used for the verify-email/reset-password links (see
 * src/app/api/auth/signup/route.ts) — never a hardcoded host. Never throws:
 * the state mutation above is already durably committed, so a delivery
 * failure here must never surface as a failed invite.
 */
async function sendBetaApprovalEmail(email: string): Promise<void> {
  try {
    const provider = getEmailProvider();
    if (!provider) return;
    const signupUrl = `${getConfig().NEXT_PUBLIC_APP_URL}/signup`;
    await provider.send({
      to: email,
      subject: "Your OpsIQ beta access is ready",
      html: `<p>Your OpsIQ beta access is ready.</p><p><a href="${signupUrl}">Sign up now</a> using this same email address (${escapeHtml(email)}) to activate your account.</p>`,
      text: `Your OpsIQ beta access is ready. Sign up now using this same email address (${email}): ${signupUrl}`,
    });
  } catch (emailError) {
    console.error(
      "[BETA_REQUEST_INVITE] Approval email dispatch failed",
      emailError instanceof Error ? emailError.constructor.name : "UnknownError"
    );
  }
}

/**
 * Mark a beta-access request as invited (owner has decided to grant this
 * requester access; they receive the existing /signup flow out-of-band —
 * this function never creates a User/Workspace itself).
 *
 * This is BOTH the "Invite" action (from REQUESTED) AND the routine
 * "Re-invite" action (from REVOKED, or from an INVITED request whose invite
 * has expired — see isInviteExpired in @/lib/beta) — the same transition,
 * exposed as one button, since all three source states mean "this person is
 * not currently able to sign up" and the operator's intent (grant access
 * now) is identical. REJECTED is deliberately NOT one of the source states
 * here — reopening a rejected request is a separate, explicitly-labeled
 * action (reopenAndInviteBetaRequest) so an operator can't casually undo a
 * deliberate rejection via the routine re-invite button.
 *
 * Governance:
 *   - Throws NotFoundError if the request does not exist.
 *   - Concurrency-safe, emit-once, ATOMIC: the conditional transition and its
 *     audit event run inside one db.$transaction (same AUDIT-01 pattern as
 *     PR #473's grantBetaRequestOperator — see
 *     scripts/provision-beta-request-operator.ts and
 *     src/infra/audit.ts's AuditClient), so a thrown error anywhere in that
 *     transaction (including from emitAuditEvent) rolls the state mutation
 *     back too. An already-INVITED, non-expired request is an idempotent
 *     no-op with no new audit event and no re-sent email — the response
 *     reflects the row's real, current state (never fabricates a new
 *     invitedAt/invitedBy on a no-op).
 *   - The approval email is deliberately OUTSIDE the transaction and sent
 *     only after a successful commit, and only when this call performed the
 *     actual transition: best-effort delivery must never roll back an
 *     already-durable state change, and a replay must never re-send it.
 */
export async function markBetaRequestInvited(
  input: MarkBetaRequestInvitedInput
): Promise<MarkBetaRequestInvitedResult> {
  const { betaRequestId, actorId } = input;

  const existing = await db.betaRequest.findUnique({
    where: { id: betaRequestId },
    select: { id: true, email: true },
  });
  if (!existing) {
    throw new NotFoundError("BetaRequest", betaRequestId);
  }

  const invitedAt = new Date();
  const expiredThreshold = new Date(invitedAt.getTime() - INVITE_TTL_DAYS * 24 * 60 * 60 * 1000);
  const transitioned = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.betaRequest.updateMany({
      where: {
        id: betaRequestId,
        OR: [
          { status: "REQUESTED" },
          { status: "REVOKED" },
          { status: "INVITED", invitedAt: { lte: expiredThreshold } },
        ],
      },
      data: {
        status: "INVITED",
        invitedAt,
        invitedBy: actorId,
        revokedAt: null,
        revokedBy: null,
      },
    });

    if (updated.count === 1) {
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.BETA_REQUEST_MARKED_INVITED,
          actorId,
          entityType: "beta_request",
          entityId: betaRequestId,
          visibility: "internal",
        },
        tx
      );
    }

    return updated.count === 1;
  });

  if (transitioned) {
    // Only on the actual transition, and only after the transaction above
    // has successfully committed — never on an idempotent replay, and
    // never able to roll back the already-durable state change.
    await sendBetaApprovalEmail(existing.email);
  }

  const finalRow = await db.betaRequest.findUnique({
    where: { id: betaRequestId },
    select: { id: true, status: true, invitedAt: true, invitedBy: true },
  });
  if (!finalRow) {
    throw new NotFoundError("BetaRequest", betaRequestId);
  }

  return {
    id: finalRow.id,
    status: finalRow.status,
    invitedAt: finalRow.invitedAt ? finalRow.invitedAt.toISOString() : null,
    invitedBy: finalRow.invitedBy,
  };
}

export interface BetaRequestActionInput {
  betaRequestId: string;
  actorId: string;
  reason?: string;
}

export interface BetaRequestActionResult {
  id: string;
  status: string;
}

/**
 * Revoke an invite: INVITED -> REVOKED. The applicant can no longer complete
 * signup even if they still have the invite link/email (isBetaRequestInvited
 * only admits status === "INVITED" — see @/lib/beta). Idempotent: replaying
 * on an already-REVOKED (or otherwise non-INVITED) row is a no-op, no
 * duplicate audit event. Same atomic tx+audit pattern as
 * markBetaRequestInvited.
 */
export async function revokeBetaRequestInvite(
  input: BetaRequestActionInput
): Promise<BetaRequestActionResult> {
  const { betaRequestId, actorId, reason } = input;
  const existing = await db.betaRequest.findUnique({ where: { id: betaRequestId }, select: { id: true } });
  if (!existing) throw new NotFoundError("BetaRequest", betaRequestId);

  const revokedAt = new Date();
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.betaRequest.updateMany({
      where: { id: betaRequestId, status: "INVITED" },
      data: { status: "REVOKED", revokedAt, revokedBy: actorId },
    });
    if (updated.count === 1) {
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.BETA_REQUEST_REVOKED,
          actorId,
          entityType: "beta_request",
          entityId: betaRequestId,
          payload: { reason: reason ?? null },
          visibility: "internal",
        },
        tx
      );
    }
  });

  const finalRow = await db.betaRequest.findUniqueOrThrow({ where: { id: betaRequestId }, select: { id: true, status: true } });
  return finalRow;
}

/**
 * Reject/archive a request: REQUESTED -> REJECTED. Terminal for the routine
 * "Invite/Re-invite" action (REJECTED is deliberately not one of that
 * function's source states) — reversing a rejection requires the separate,
 * explicitly-labeled reopenAndInviteBetaRequest action below. No email is
 * sent (unlike Invite/Re-invite): a rejection is a quiet archive, not a
 * notification-worthy event for the applicant. Idempotent, same atomic
 * tx+audit pattern.
 */
export async function rejectBetaRequest(
  input: BetaRequestActionInput
): Promise<BetaRequestActionResult> {
  const { betaRequestId, actorId, reason } = input;
  const existing = await db.betaRequest.findUnique({ where: { id: betaRequestId }, select: { id: true } });
  if (!existing) throw new NotFoundError("BetaRequest", betaRequestId);

  const rejectedAt = new Date();
  await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.betaRequest.updateMany({
      where: { id: betaRequestId, status: "REQUESTED" },
      data: { status: "REJECTED", rejectedAt, rejectedBy: actorId },
    });
    if (updated.count === 1) {
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.BETA_REQUEST_REJECTED,
          actorId,
          entityType: "beta_request",
          entityId: betaRequestId,
          payload: { reason: reason ?? null },
          visibility: "internal",
        },
        tx
      );
    }
  });

  const finalRow = await db.betaRequest.findUniqueOrThrow({ where: { id: betaRequestId }, select: { id: true, status: true } });
  return finalRow;
}

/**
 * "Re-open & invite": REJECTED -> INVITED. Deliberately a SEPARATE function
 * (and a separately labeled UI action) from the routine Invite/Re-invite
 * button — reopening a deliberate rejection must never be one click away
 * from a routine resend. Emits a distinct BETA_REQUEST_REOPENED audit event
 * (in addition to the same effect as an invite) so the audit trail shows
 * this was a reopen, not an ordinary invite. Sends the same approval email
 * as a normal invite, since the applicant is now genuinely admitted.
 */
export async function reopenAndInviteBetaRequest(
  input: BetaRequestActionInput
): Promise<MarkBetaRequestInvitedResult> {
  const { betaRequestId, actorId, reason } = input;
  const existing = await db.betaRequest.findUnique({ where: { id: betaRequestId }, select: { id: true, email: true } });
  if (!existing) throw new NotFoundError("BetaRequest", betaRequestId);

  const invitedAt = new Date();
  const transitioned = await db.$transaction(async (tx: Prisma.TransactionClient) => {
    const updated = await tx.betaRequest.updateMany({
      where: { id: betaRequestId, status: "REJECTED" },
      data: { status: "INVITED", invitedAt, invitedBy: actorId, rejectedAt: null, rejectedBy: null },
    });
    if (updated.count === 1) {
      await emitAuditEvent(
        {
          eventName: AUDIT_EVENTS.BETA_REQUEST_REOPENED,
          actorId,
          entityType: "beta_request",
          entityId: betaRequestId,
          payload: { reason: reason ?? null },
          visibility: "internal",
        },
        tx
      );
    }
    return updated.count === 1;
  });

  if (transitioned) {
    await sendBetaApprovalEmail(existing.email);
  }

  const finalRow = await db.betaRequest.findUniqueOrThrow({
    where: { id: betaRequestId },
    select: { id: true, status: true, invitedAt: true, invitedBy: true },
  });
  return {
    id: finalRow.id,
    status: finalRow.status,
    invitedAt: finalRow.invitedAt ? finalRow.invitedAt.toISOString() : null,
    invitedBy: finalRow.invitedBy,
  };
}
