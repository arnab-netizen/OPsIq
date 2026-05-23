/**
 * GET /api/admin/audit-log
 *
 * Query audit trail for a workspace.
 * Admin-only endpoint (enforces AUDIT_VIEW capability).
 * Workspace-scoped via x-workspace-id header.
 */

import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  AuditTrailQueryParamsSchema,
} from "@/domain/audit/audit-trail-contracts";
import {
  queryAuditTrail,
  getAuditStatistics,
} from "@/services/audit-trail";

export const GET = withCanonicalEnforcement(
  async (ctx) => {
    // Parse query parameters
    const url = new URL(ctx.request!.url);
    const params = {
      workspaceId: ctx.verifiedWorkspaceId,
      entityType: url.searchParams.get("entityType") || undefined,
      entityId: url.searchParams.get("entityId") || undefined,
      actorId: url.searchParams.get("actorId") || undefined,
      action: url.searchParams.get("action") || undefined,
      status: url.searchParams.get("status") || undefined,
      fromDate: url.searchParams.get("fromDate") || undefined,
      toDate: url.searchParams.get("toDate") || undefined,
      limit: parseInt(url.searchParams.get("limit") || "100"),
      cursor: url.searchParams.get("cursor") || undefined,
      includeTotalCount: url.searchParams.get("includeTotalCount") === "true",
    };

    // Validate query parameters
    const validationResult = AuditTrailQueryParamsSchema.safeParse(params);
    if (!validationResult.success) {
      throw new Error(`Invalid query parameters: ${validationResult.error.issues.map(i => `${i.path.join('.')}: ${i.message}`).join(', ')}`);
    }

    const queryParams = validationResult.data;

    // Convert query params to filter format
    const filter = {
      workspaceId: queryParams.workspaceId,
      entityType: queryParams.entityType,
      entityId: queryParams.entityId,
      actorId: queryParams.actorId,
      action: queryParams.action as any,
      status: queryParams.status as any,
      fromDate: queryParams.fromDate ? new Date(queryParams.fromDate) : undefined,
      toDate: queryParams.toDate ? new Date(queryParams.toDate) : undefined,
    };

    // Query audit trail
    const page = await queryAuditTrail(filter, queryParams.limit, queryParams.cursor);

    // Include statistics if requested
    const response: any = { ...page };

    if (queryParams.includeTotalCount) {
      const stats = await getAuditStatistics(ctx.verifiedWorkspaceId);
      response.statistics = {
        totalEvents: stats.totalEvents,
        successCount: stats.successCount,
        failureCount: stats.failureCount,
      };
    }

    return response;
  },
  {
    requireWorkspace: true,
    requireCapabilities: [CAPABILITIES.AUDIT_VIEW],
  }
);
