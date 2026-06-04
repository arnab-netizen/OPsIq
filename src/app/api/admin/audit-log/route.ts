/**
 * GET /api/admin/audit-log
 *
 * Query the persisted audit trail for the caller's workspace (read-only).
 * Admin-only endpoint (enforces AUDIT_VIEW capability).
 * Workspace-scoped: the workspace is server-derived (ctx.verifiedWorkspaceId),
 * never trusted from request input.
 *
 * Phase D1-A: backed by a real database query against the persisted
 * audit_events table via the admin operability service (no in-memory store).
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { queryAuditLogForAdmin } from "@/services/admin/admin-operability.service";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const limitParam = url.searchParams.get("limit");

    const result = await queryAuditLogForAdmin({
      // Tenant scope is the verified workspace only.
      workspaceId: ctx.verifiedWorkspaceId,
      eventName: url.searchParams.get("eventName") || undefined,
      entityType: url.searchParams.get("entityType") || undefined,
      entityId: url.searchParams.get("entityId") || undefined,
      actorId: url.searchParams.get("actorId") || undefined,
      limit: limitParam !== null ? parseInt(limitParam, 10) : undefined,
      cursor: url.searchParams.get("cursor"),
      includeTotalCount: url.searchParams.get("includeTotalCount") === "true",
    });

    return result;
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.AUDIT_VIEW],
  }
);
