/**
 * GET /api/admin/audit-log
 *
 * Query audit trail for a workspace.
 * Admin-only endpoint (enforces AUDIT_VIEW capability).
 * Workspace-scoped via x-workspace-id header.
 */

import { NextRequest } from "next/server";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  AuditTrailQueryParamsSchema,
} from "@/domain/audit/audit-trail-contracts";
import {
  queryAuditTrail,
  getAuditStatistics,
} from "@/services/audit-trail";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  // Auth enforcement (AUDIT_VIEW capability)
  const { session, policy } = await withAuth({ capability: CAPABILITIES.AUDIT_VIEW });
  if (!session || !policy) {
    throw new UnauthorizedError("Unauthorized");
  }

  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    throw new Error("Workspace ID required");
  }

  // Parse query parameters
  const url = new URL(request.url);
  const params = {
    workspaceId,
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
  let response: any = { ...page };

  if (queryParams.includeTotalCount) {
    const stats = await getAuditStatistics(workspaceId);
    response.statistics = {
      totalEvents: stats.totalEvents,
      successCount: stats.successCount,
      failureCount: stats.failureCount,
    };
  }

  return response;
});
