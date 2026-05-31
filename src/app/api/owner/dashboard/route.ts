/**
 * GET /api/owner/dashboard
 * Retrieve owner dashboard with workspace health, action queue summary, and KPIs
 * Owner-only access (requires workspace owner capability)
 */

import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { ForbiddenError, BadRequestError, AppError } from "@/infra/errors";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { calculateWorkspaceHealth, summarizeActionQueue, buildOwnerDashboardView, DashboardServiceError } from "@/services/owner-mode/dashboard.service";
import { OwnerDashboardConfig, HealthStatus, ActionQueuePriority } from "@/domain/owner-mode/owner-dashboard";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";

const querySchema = z.object({
  includeKPIs: z.enum(["true", "false"]).optional().default("true"),
  daysOfHistory: z.string().optional().default("30"),
});

type DashboardEngagement = {
  id: string;
  workspaceId: string;
  title: string;
  status: string;
  healthStatus: string | null;
  createdAt: Date;
  updatedAt: Date;
  kpis: DashboardKpi[];
  actions: DashboardAction[];
};

type DashboardKpi = {
  id: string;
  engagementId: string;
  name: string;
  status: string;
  currentValue: number | null;
  targetValue: number | null;
  direction: string | null;
  trend: string | null;
  updatedAt: Date;
  engagement?: { id: string };
};

type DashboardAction = {
  id: string;
  engagementId: string | null;
  title: string;
  status: string | null;
  priority: string | null;
  dueAt: Date | null;
  assignedTo: { id: string; name: string | null; email: string } | null;
  engagement?: { id: string; title: string };
};

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

    // QUERY 1: Get real engagements for workspace
    const { db } = await import("@/lib/db");
    const engagements = await db.engagement.findMany({
      where: { workspaceId },
      include: {
        kpis: true,
        actions: true,
      },
    });

    // QUERY 2: Get real actions for workspace
    const engagementIds = engagements.map((e: DashboardEngagement) => e.id);
    const actions = await db.action.findMany({
      where: { engagementId: { in: engagementIds } },
      include: {
        engagement: { select: { id: true, title: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });

    // QUERY 3: Get real KPIs for workspace
    const kpis = await db.kpi.findMany({
      where: { engagementId: { in: engagementIds } },
      include: {
        engagement: { select: { id: true } },
      },
    });

    // Transform real data into expected format for health calculation
    const engagementSnapshots = engagements.map((engagement: DashboardEngagement) => {
      const engagementKPIs = kpis.filter((k: DashboardKpi) => k.engagementId === engagement.id);
      const onTrackCount = engagementKPIs.filter((k: DashboardKpi) => k.status === "on_track").length;
      return {
        engagementId: engagement.id,
        status: (engagement.healthStatus?.toLowerCase() || "healthy") as
          | "healthy"
          | "at_risk"
          | "critical"
          | "improving",
        kpiOnTrackCount: onTrackCount,
        kpiTotalCount: engagementKPIs.length,
      };
    });

    // Transform real actions into expected format
    const actionData = actions.map((action: DashboardAction) => ({
      id: action.id,
      engagementId: action.engagementId,
      name: action.title,
      status: action.status || "draft",
      priority: action.priority || "medium",
      dueDate: action.dueAt?.toISOString(),
      assignee: action.assignedTo?.email,
      blockerCount: 0, // Would query separately if needed
    }));

    // Calculate health from REAL data (empty if no engagements)
    const health = await calculateWorkspaceHealth(context, engagementSnapshots);
    const actionQueue = await summarizeActionQueue(context, actionData);

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

    // Transform real KPIs into dashboard format
    const realKPIs = kpis.map((kpi: DashboardKpi) => ({
      id: kpi.id,
      name: kpi.name,
      currentValue: kpi.currentValue || 0,
      targetValue: kpi.targetValue || 0,
      direction: (kpi.direction as "increase" | "decrease") || "increase",
      trend: (kpi.trend as "improving" | "stable" | "declining") || "stable",
      percentOfTarget:
        kpi.targetValue && kpi.targetValue > 0
          ? Math.round((((kpi.currentValue || 0) / kpi.targetValue) * 100))
          : 0,
      lastUpdated: kpi.updatedAt?.toISOString() || new Date().toISOString(),
    }));

    const dashboard = await buildOwnerDashboardView(
      context,
      config,
      health,
      actionQueue,
      queryParams.includeKPIs === "true" ? realKPIs : []
    );

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

    return toOwnerDashboardDTO(dashboard);
  } catch (error) {
    if (error instanceof z.ZodError) {
      throw new BadRequestError("Validation error: " + error.issues.map((i) => i.message).join(", "));
    }
    if (error instanceof DashboardServiceError) {
      const governed = classifyOperatorError(error, { context: "load" });
      throw new BadRequestError(governed.operatorMessage);
    }
    if (error instanceof Error) {
      const governed = classifyOperatorError(error, { context: "load" });
      throw new BadRequestError(governed.operatorMessage);
    }
    throw new AppError(
      "INTERNAL_ERROR",
      "Internal server error",
      500,
      {
        telemetryClass: "INTERNAL_ERROR",
        auditClass: "INTERNAL_ERROR",
        severity: "HIGH",
        retryable: false,
        securityRelevant: false,
        infrastructureRelevant: true,
        abuseRelevant: false,
        handlerAllowed: true,
        mutationAllowed: false,
      }
    );
  }
}, { requireCapabilities: [CAPABILITIES.OWNER_VIEW] });
