/**
 * GET /api/admin/audit-log
 *
 * Query audit trail for a workspace.
 * Admin-only endpoint (enforces AUDIT_VIEW capability).
 * Workspace-scoped via x-workspace-id header.
 */

import { NextRequest, NextResponse } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { withErrorHandling } from "@/infra/error-handler";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import {
  AuditTrailQueryParamsSchema,
} from "@/domain/audit/audit-trail-contracts";
import {
  queryAuditTrail,
  getAuditStatistics,
} from "@/services/audit-trail";

export const GET = withErrorHandling(async (request: NextRequest) => {
  // Auth enforcement (AUDIT_VIEW capability)
  const { session, policy } = await withAuth({ capability: CAPABILITIES.AUDIT_VIEW });
  if (!session || !policy) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const workspaceId = request.headers.get("x-workspace-id");
  if (!workspaceId) {
    return NextResponse.json({ error: "Workspace ID required" }, { status: 400 });
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
    return NextResponse.json(
      { error: "Invalid query parameters", details: validationResult.error.issues.map(i => ({ path: i.path.join('.'), message: i.message })) },
      { status: 400 }
    );
  }

  const queryParams = validationResult.data;

  try {
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

    return NextResponse.json(response);
  } catch (error) {
    console.error("Audit log query failed:", error);
    return NextResponse.json(
      { error: "Failed to query audit log" },
      { status: 500 }
    );
  }
});
