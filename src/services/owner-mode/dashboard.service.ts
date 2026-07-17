/**
 * Owner Mode Dashboard Service
 *
 * Calculates workspace health, action queue summaries, and generates owner dashboard views.
 * Workspace-scoped, requires owner capability.
 */

import {
  WorkspaceHealth,
  ActionQueueSummary,
  EngagementHealthSnapshot,
  HealthStatus,
  ActionQueueItem,
  KPISummary,
  OwnerDashboardConfig,
  OwnerDashboardView,
  validateWorkspaceHealth,
  validateActionQueueSummary,
  validateOwnerDashboardView,
} from "@/domain/owner-mode/owner-dashboard";

interface DashboardServiceContext {
  workspaceId: string;
  userId: string;
}

interface ActionData {
  id: string;
  engagementId: string;
  name: string;
  status: string;
  priority: string;
  dueDate?: string;
  assignee?: string;
  blockerCount: number;
}

interface HealthDataSnapshot {
  engagementId: string;
  status: "critical" | "at_risk" | "healthy" | "improving";
  kpiOnTrackCount: number;
  kpiTotalCount: number;
}

export class DashboardServiceError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export async function calculateWorkspaceHealth(
  context: DashboardServiceContext,
  engagementSnapshots: HealthDataSnapshot[]
): Promise<WorkspaceHealth> {
  const now = new Date().toISOString();

  const totalEngagements = engagementSnapshots.length;
  const healthyCount = engagementSnapshots.filter((e) => e.status === "healthy").length;
  const atRiskCount = engagementSnapshots.filter((e) => e.status === "at_risk").length;
  const criticalCount = engagementSnapshots.filter((e) => e.status === "critical").length;

  const totalKPIs = engagementSnapshots.reduce((sum, e) => sum + e.kpiTotalCount, 0);
  const onTrackKPIs = engagementSnapshots.reduce((sum, e) => sum + e.kpiOnTrackCount, 0);

  const overallStatus = determineOverallHealth(healthyCount, atRiskCount, criticalCount, totalEngagements);

  const engagementSnapshots_mapped = engagementSnapshots.map((e): EngagementHealthSnapshot => {
    const statusMap: Record<string, HealthStatus> = {
      critical: HealthStatus.CRITICAL,
      at_risk: HealthStatus.AT_RISK,
      healthy: HealthStatus.HEALTHY,
      improving: HealthStatus.IMPROVING,
    };
    return {
      engagementId: e.engagementId,
      name: `Engagement ${e.engagementId.substring(0, 8)}`,
      status: statusMap[e.status] || HealthStatus.HEALTHY,
      kpiOnTrackCount: e.kpiOnTrackCount,
      kpiTotalCount: e.kpiTotalCount,
      actionCompletionRate: 0.5,
      riskFactors: e.status === "critical" ? ["Critical blockers", "Low execution certainty"] : [],
      lastReviewDate: now,
      recommendation: generateHealthRecommendation(e.status),
    };
  });

  const health: WorkspaceHealth = {
    workspaceId: context.workspaceId,
    assessedAt: now,
    overallStatus,
    engagementCount: totalEngagements,
    healthyEngagements: healthyCount,
    atRiskEngagements: atRiskCount,
    criticalEngagements: criticalCount,
    activeKPICount: totalKPIs,
    onTrackKPICount: onTrackKPIs,
    actionQueueSize: 0,
    overdueActionCount: 0,
    averageExecutionCertainty: 50,
    engagementHealthSnapshots: engagementSnapshots_mapped,
    topRisks: identifyTopRisks(engagementSnapshots),
    recommendedActions: generateRecommendedActions(overallStatus),
  };

  const validationErrors = validateWorkspaceHealth(health);
  if (validationErrors.length > 0) {
    throw new DashboardServiceError("VALIDATION_FAILED", `Workspace health validation failed: ${validationErrors.join("; ")}`);
  }

  return health;
}

export async function summarizeActionQueue(
  context: DashboardServiceContext,
  actions: ActionData[]
): Promise<ActionQueueSummary> {
  const byStatus: Record<string, number> = {};
  const byPriority: Record<string, number> = {};
  let overdueCount = 0;
  let blockedCount = 0;
  let completedThisWeek = 0;
  const priorityScores: number[] = [];

  const now = new Date();
  const oneWeekFromNow = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);

  const criticalActions: ActionQueueItem[] = [];
  const dueThisWeek: ActionQueueItem[] = [];

  for (const action of actions) {
    byStatus[action.status] = (byStatus[action.status] || 0) + 1;
    byPriority[action.priority] = (byPriority[action.priority] || 0) + 1;

    if (action.status === "completed" || action.status === "verified") {
      completedThisWeek++;
    }

    if (action.blockerCount > 0) {
      blockedCount += action.blockerCount;
    }

    const daysOverdue = action.dueDate ? calculateDaysOverdue(action.dueDate, now) : 0;
    if (daysOverdue > 0) {
      overdueCount++;
    }

    if (action.priority === "critical") {
      criticalActions.push(convertToActionQueueItem(action, daysOverdue));
    }

    if (action.dueDate && new Date(action.dueDate) >= now && new Date(action.dueDate) <= oneWeekFromNow) {
      dueThisWeek.push(convertToActionQueueItem(action, daysOverdue));
    }

    priorityScores.push(getPriorityScore(action.priority));
  }

  const avgCompletionDays = priorityScores.length > 0 ? Math.round(actions.length / (priorityScores.length || 1)) : 0;

  const summary: ActionQueueSummary = {
    workspaceId: context.workspaceId,
    totalCount: actions.length,
    byStatus,
    byPriority,
    overdueCount,
    blockedCount,
    completedThisWeek,
    averageCompletionDays: avgCompletionDays,
    criticalActions: criticalActions.slice(0, 5),
    dueThisWeek: dueThisWeek.slice(0, 5),
  };

  const validationErrors = validateActionQueueSummary(summary);
  if (validationErrors.length > 0) {
    throw new DashboardServiceError("VALIDATION_FAILED", `Action queue validation failed: ${validationErrors.join("; ")}`);
  }

  return summary;
}

export async function buildOwnerDashboardView(
  context: DashboardServiceContext,
  config: OwnerDashboardConfig,
  health: WorkspaceHealth,
  actionQueue: ActionQueueSummary,
  kpis: KPISummary[]
): Promise<OwnerDashboardView> {
  const view: OwnerDashboardView = {
    workspaceId: context.workspaceId,
    config,
    health,
    actionQueue,
    recentKPIs: kpis.slice(0, 10),
  };

  const validationErrors = validateOwnerDashboardView(view);
  if (validationErrors.length > 0) {
    throw new DashboardServiceError("VALIDATION_FAILED", `Dashboard view validation failed: ${validationErrors.join("; ")}`);
  }

  return view;
}

function determineOverallHealth(healthy: number, atRisk: number, critical: number, total: number): HealthStatus {
  if (critical > 0) {
    return HealthStatus.CRITICAL;
  }
  if (atRisk >= total * 0.3) {
    return HealthStatus.AT_RISK;
  }
  if (healthy >= total * 0.8) {
    return HealthStatus.IMPROVING;
  }
  return HealthStatus.HEALTHY;
}

function generateHealthRecommendation(status: string): string {
  switch (status) {
    case "critical":
      return "Immediate action required. Review blockers and escalate to leadership.";
    case "at_risk":
      return "Monitor closely. Address at-risk KPIs in next review cycle.";
    case "healthy":
      return "On track. Continue current execution plan.";
    case "improving":
      return "Positive momentum. Maintain focus and document wins.";
    default:
      return "Status unknown.";
  }
}

function identifyTopRisks(snapshots: HealthDataSnapshot[]): string[] {
  const risks: string[] = [];
  const criticalCount = snapshots.filter((e) => e.status === "critical").length;
  const atRiskCount = snapshots.filter((e) => e.status === "at_risk").length;

  if (criticalCount > 0) {
    risks.push(`${criticalCount} engagement(s) in critical status`);
  }
  if (atRiskCount > 2) {
    risks.push(`${atRiskCount} engagement(s) at risk of deterioration`);
  }

  const onTrackRatio = snapshots.reduce((sum, e) => sum + e.kpiOnTrackCount, 0) / Math.max(snapshots.reduce((sum, e) => sum + e.kpiTotalCount, 0), 1);
  if (onTrackRatio < 0.7) {
    risks.push(`Only ${Math.round(onTrackRatio * 100)}% of KPIs on track`);
  }

  return risks.slice(0, 5);
}

function generateRecommendedActions(status: HealthStatus): string[] {
  switch (status) {
    case HealthStatus.CRITICAL:
      return [
        "Schedule emergency triage meeting",
        "Review all critical-priority actions",
        "Identify and remove blockers",
        "Escalate to stakeholders",
      ];
    case HealthStatus.AT_RISK:
      return ["Review KPI trends", "Increase review cadence", "Strengthen at-risk engagements", "Add buffer capacity"];
    case HealthStatus.HEALTHY:
      return ["Continue execution", "Document best practices", "Prepare for next phase", "Update roadmap"];
    case HealthStatus.IMPROVING:
      return ["Celebrate wins", "Reinforce successful practices", "Scale what works", "Share learnings across team"];
    default:
      return [];
  }
}

function calculateDaysOverdue(dueDate: string, now: Date): number {
  const due = new Date(dueDate);
  const diff = now.getTime() - due.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  return Math.max(0, days);
}

function convertToActionQueueItem(action: ActionData, daysOverdue: number): ActionQueueItem {
  return {
    id: action.id,
    engagementId: action.engagementId,
    name: action.name,
    owner: action.assignee,
    priority: (action.priority.toLowerCase() as any) || "medium",
    status: (action.status as any) || "draft",
    dueDate: action.dueDate,
    assignee: action.assignee,
    blockerCount: action.blockerCount,
    daysOverdue: daysOverdue > 0 ? daysOverdue : undefined,
  };
}

function getPriorityScore(priority: string): number {
  switch (priority?.toLowerCase()) {
    case "critical":
      return 4;
    case "high":
      return 3;
    case "medium":
      return 2;
    case "low":
      return 1;
    default:
      return 0;
  }
}
