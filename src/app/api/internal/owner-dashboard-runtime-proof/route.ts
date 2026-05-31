/**
 * GET /api/internal/owner-dashboard-runtime-proof
 *
 * Protected diagnostic endpoint to trace owner dashboard handler execution
 * stage-by-stage for new empty workspaces.
 *
 * Protected by x-opsiq-diagnostic-key header.
 */

import { NextRequest, NextResponse } from "next/server";
import { db } from "@/lib/db";
import { z } from "zod/v4";
import { calculateWorkspaceHealth, summarizeActionQueue, buildOwnerDashboardView } from "@/services/owner-mode/dashboard.service";
import { OwnerDashboardConfig, HealthStatus, ActionQueuePriority } from "@/domain/owner-mode/owner-dashboard";

function maskId(id: string): string {
  if (!id || id.length < 8) return "***";
  return `${id.substring(0, 4)}...${id.substring(id.length - 4)}`;
}

export const GET = async (request: NextRequest) => {
  // Verify diagnostic key
  const diagnosticKey = request.headers.get("x-opsiq-diagnostic-key");
  const expectedKey = process.env.OPSIQ_DIAGNOSTIC_KEY;

  if (!diagnosticKey || !expectedKey || diagnosticKey !== expectedKey) {
    return new NextResponse(JSON.stringify({ error: "Unauthorized" }), {
      status: 404,
    });
  }

  const stages: any[] = [];

  try {
    // Stage 1: Resolve user
    stages.push({ stage: "resolve_user", succeeded: false });
    const latestUser = await db.user.findFirst({
      where: { email: { contains: "opsiq-smoke" } },
      orderBy: { createdAt: "desc" },
    });

    if (!latestUser) {
      return NextResponse.json({
        stage: "resolve_user",
        serviceCallSucceeded: false,
        errorName: "UserNotFound",
        safeErrorMessage: "No test user found",
        classification: "no_test_user",
      });
    }
    stages[0].succeeded = true;
    stages[0].userIdMasked = maskId(latestUser.id);

    // Stage 2: Resolve workspace
    stages.push({ stage: "resolve_workspace", succeeded: false });
    const workspace = await db.workspace.findFirst({
      where: { createdBy: latestUser.id, isActive: true },
      orderBy: { createdAt: "desc" },
    });

    if (!workspace) {
      return NextResponse.json({
        stages,
        stage: "resolve_workspace",
        serviceCallSucceeded: false,
        errorName: "WorkspaceNotFound",
        safeErrorMessage: "No workspace found for user",
        classification: "no_workspace",
      });
    }
    stages[1].succeeded = true;
    stages[1].workspaceIdMasked = maskId(workspace.id);

    // Stage 3: Enforce membership (already done by canonical auth, but check here)
    stages.push({ stage: "enforce_membership", succeeded: false });
    const membership = await db.workspaceMembership.findFirst({
      where: { userId: latestUser.id, workspaceId: workspace.id, isActive: true },
    });

    if (!membership) {
      return NextResponse.json({
        stages,
        stage: "enforce_membership",
        serviceCallSucceeded: false,
        errorName: "MembershipNotFound",
        safeErrorMessage: "User is not member of workspace",
        classification: "no_membership",
      });
    }
    stages[2].succeeded = true;
    stages[2].role = membership.role;

    // Stage 4: Query engagements
    stages.push({ stage: "query_engagements", succeeded: false });
    const engagements = await db.engagement.findMany({
      where: { workspaceId: workspace.id },
      include: { kpis: true, actions: true },
    });
    stages[3].succeeded = true;
    stages[3].engagementCount = engagements.length;

    // Stage 5: Query actions
    stages.push({ stage: "query_actions", succeeded: false });
    const engagementIds = engagements.map((e: any) => e.id);
    const actions = await db.action.findMany({
      where: { engagementId: { in: engagementIds } },
      include: {
        engagement: { select: { id: true, title: true } },
        assignedTo: { select: { id: true, name: true, email: true } },
      },
    });
    stages[4].succeeded = true;
    stages[4].actionCount = actions.length;

    // Stage 6: Query KPIs
    stages.push({ stage: "query_kpis", succeeded: false });
    const kpis = await db.kpi.findMany({
      where: { engagementId: { in: engagementIds } },
      include: { engagement: { select: { id: true } } },
    });
    stages[5].succeeded = true;
    stages[5].kpiCount = kpis.length;

    // Stage 7: Build engagement snapshots
    stages.push({ stage: "build_engagement_snapshots", succeeded: false });
    type DashboardEngagement = {
      id: string;
      workspaceId: string;
      title: string;
      status: string;
      healthStatus: string | null;
      createdAt: Date;
      updatedAt: Date;
      kpis: any[];
      actions: any[];
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
    stages[6].succeeded = true;
    stages[6].engagementSnapshotCount = engagementSnapshots.length;

    // Stage 8: Build action data
    stages.push({ stage: "build_action_data", succeeded: false });
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

    const actionData = actions.map((action: DashboardAction) => ({
      id: action.id,
      engagementId: action.engagementId,
      name: action.title,
      status: action.status || "draft",
      priority: action.priority || "medium",
      dueDate: action.dueAt?.toISOString(),
      assignee: action.assignedTo?.email,
      blockerCount: 0,
    }));
    stages[7].succeeded = true;
    stages[7].actionDataCount = actionData.length;

    // Stage 9: Build real KPIs
    stages.push({ stage: "build_real_kpis", succeeded: false });
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
    stages[8].succeeded = true;
    stages[8].realKpiCount = realKPIs.length;

    // Stage 10: Calculate workspace health
    stages.push({ stage: "calculate_workspace_health", succeeded: false });
    const context = { workspaceId: workspace.id, userId: latestUser.id };
    const health = await calculateWorkspaceHealth(context, engagementSnapshots);
    stages[9].succeeded = true;
    stages[9].engagementCount = health.engagementCount;
    stages[9].healthyEngagements = health.healthyEngagements;
    stages[9].atRiskEngagements = health.atRiskEngagements;
    stages[9].criticalEngagements = health.criticalEngagements;

    // Stage 11: Summarize action queue
    stages.push({ stage: "summarize_action_queue", succeeded: false });
    const actionQueue = await summarizeActionQueue(context, actionData);
    stages[10].succeeded = true;
    stages[10].totalCount = actionQueue.totalCount;
    stages[10].overdueCount = actionQueue.overdueCount;

    // Stage 12: Build owner dashboard view
    stages.push({ stage: "build_owner_dashboard_view", succeeded: false });
    const config: any = {
      workspaceId: workspace.id,
      ownerId: latestUser.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      showCompletedActions: true,
      daysOfHistoryVisible: 30,
      actionPriorityThreshold: "medium",
      healthStatusThreshold: "at_risk",
      enableBulkActions: true,
      enableAdvancedFiltering: true,
    };

    const dashboard = await buildOwnerDashboardView(
      context,
      config,
      health,
      actionQueue,
      realKPIs
    );
    stages[11].succeeded = true;
    stages[11].dashboardAvailable = !!dashboard;

    // Stage 13: Convert to DTO
    stages.push({ stage: "to_owner_dashboard_dto", succeeded: false });
    const dto = {
      workspaceId: dashboard.workspaceId,
      assessedAt: dashboard.config?.createdAt || new Date().toISOString(),
      overallStatus: dashboard.health?.overallStatus || "healthy",
      engagementCount: dashboard.health?.engagementCount || 0,
      healthyEngagements: dashboard.health?.healthyEngagements || 0,
      atRiskEngagements: dashboard.health?.atRiskEngagements || 0,
      criticalEngagements: dashboard.health?.criticalEngagements || 0,
      actionQueueSize: dashboard.actionQueue?.totalCount || 0,
      overdueActionCount: dashboard.actionQueue?.overdueCount || 0,
      actionsByStatus: dashboard.actionQueue?.byStatus || {},
      actionsByPriority: dashboard.actionQueue?.byPriority || {},
      topRisks: dashboard.health?.topRisks || [],
      recommendedActions: dashboard.health?.recommendedActions || [],
      criticalActions: dashboard.actionQueue?.criticalActions || [],
      dueThisWeek: dashboard.actionQueue?.dueThisWeek || [],
    };
    stages[12].succeeded = true;
    stages[12].dtoReady = true;
    stages[12].topLevelKeys = Object.keys(dto);

    // Stage 14: Ready for response
    stages.push({ stage: "response_ready", succeeded: true });

    return NextResponse.json({
      stages,
      engagementCount: engagements.length,
      actionCount: actions.length,
      kpiCount: kpis.length,
      classification: "owner_dashboard_runtime_success",
      emptyStateSafe: engagements.length === 0 && actions.length === 0 && kpis.length === 0,
    });
  } catch (error) {
    const errorName = error instanceof Error ? error.constructor.name : "UnknownError";
    const errorMessage = error instanceof Error ? error.message : String(error);

    return NextResponse.json({
      stages,
      stage: stages[stages.length - 1]?.stage || "unknown",
      serviceCallSucceeded: false,
      errorName,
      safeErrorMessage: errorMessage,
      classification: "owner_dashboard_runtime_error",
      emptyStateSafe: false,
    });
  }
};
