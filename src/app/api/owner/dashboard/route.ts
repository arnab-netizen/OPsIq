/**
 * GET /api/owner/dashboard
 * Retrieve owner dashboard with workspace health, action queue summary, and KPIs
 * Owner-only access (requires workspace owner capability)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { calculateWorkspaceHealth, summarizeActionQueue, buildOwnerDashboardView, DashboardServiceError } from "@/services/owner-mode/dashboard.service";
import { OwnerDashboardConfig, HealthStatus, ActionQueuePriority } from "@/domain/owner-mode/owner-dashboard";
import { z } from "zod/v4";

const querySchema = z.object({
  includeKPIs: z.enum(["true", "false"]).optional().default("true"),
  daysOfHistory: z.string().optional().default("30"),
});

function toOwnerDashboardDTO(data: any) {
  return {
    workspaceId: data.workspaceId,
    assessedAt: data.config?.createdAt || new Date().toISOString(),
    overallStatus: data.health?.overallStatus || HealthStatus.HEALTHY,
    engagementCount: data.health?.engagementCount || 0,
    healthyEngagements: data.health?.healthyEngagements || 0,
    atRiskEngagements: data.health?.atRiskEngagements || 0,
    criticalEngagements: data.health?.criticalEngagements || 0,
    actionQueueSize: data.actionQueue?.totalCount || 0,
    overdueActionCount: data.actionQueue?.overdueCount || 0,
    actionsByStatus: data.actionQueue?.byStatus || {},
    actionsByPriority: data.actionQueue?.byPriority || {},
    topRisks: data.health?.topRisks || [],
    recommendedActions: data.health?.recommendedActions || [],
    criticalActions: data.actionQueue?.criticalActions || [],
    dueThisWeek: data.actionQueue?.dueThisWeek || [],
  };
}

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  if (!ctx.request) {
    throw new Error("Request object not available");
  }

  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  const membership = await enforceWorkspaceScoping(ctx.request, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  try {
    const url = new URL(ctx.request.url);
    const queryParams = querySchema.parse({
      includeKPIs: url.searchParams.get("includeKPIs"),
      daysOfHistory: url.searchParams.get("daysOfHistory"),
    });

    const context = { workspaceId, userId };

    const mockEngagementSnapshots = [
      {
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        status: "healthy" as const,
        kpiOnTrackCount: 8,
        kpiTotalCount: 10,
      },
    ];

    const mockActions = [
      {
        id: "550e8400-e29b-41d4-a716-446655440001",
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Complete market analysis",
        status: "in_progress",
        priority: "high",
        dueDate: new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString(),
        assignee: "john@example.com",
        blockerCount: 0,
      },
      {
        id: "550e8400-e29b-41d4-a716-446655440002",
        engagementId: "550e8400-e29b-41d4-a716-446655440000",
        name: "Implement pricing strategy",
        status: "pending",
        priority: "critical",
        dueDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        assignee: "jane@example.com",
        blockerCount: 1,
      },
    ];

    const health = await calculateWorkspaceHealth(context, mockEngagementSnapshots);
    const actionQueue = await summarizeActionQueue(context, mockActions);

    const config: OwnerDashboardConfig = {
      workspaceId,
      ownerId: userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      showCompletedActions: true,
      daysOfHistoryVisible: parseInt(queryParams.daysOfHistory),
      actionPriorityThreshold: ActionQueuePriority.MEDIUM,
      healthStatusThreshold: HealthStatus.AT_RISK,
      enableBulkActions: true,
      enableAdvancedFiltering: true,
    };

    const mockKPIs = [
      {
        id: "kpi-001",
        name: "Revenue Growth",
        currentValue: 120000,
        targetValue: 150000,
        direction: "increase" as const,
        trend: "improving" as const,
        percentOfTarget: 80,
        lastUpdated: new Date().toISOString(),
      },
    ];

    const dashboard = await buildOwnerDashboardView(context, config, health, actionQueue, queryParams.includeKPIs === "true" ? mockKPIs : []);

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.OWNER_DASHBOARD_VIEWED,
      workspaceId,
      actorId: userId,
      entityType: "dashboard",
      entityId: workspaceId,
      payload: {
        engagementCount: health.engagementCount,
        criticalCount: health.criticalEngagements,
        actionQueueSize: actionQueue.totalCount,
      },
    });

    return Response.json(toOwnerDashboardDTO(dashboard), { status: 200 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json(
        { error: "Validation error", details: error.issues },
        { status: 400 }
      );
    }
    if (error instanceof DashboardServiceError) {
      return Response.json(
        { error: error.code, message: error.message },
        { status: 400 }
      );
    }
    if (error instanceof Error) {
      return Response.json({ error: error.message }, { status: 400 });
    }
    return Response.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}, { requireCapabilities: ["OWNER_VIEW"] });