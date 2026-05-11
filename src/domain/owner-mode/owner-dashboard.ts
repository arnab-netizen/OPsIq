/**
 * Owner Mode Dashboard Domain Contracts
 *
 * Defines workspace health, action queue aggregates, and dashboard configuration
 * visible only to workspace owners and admins.
 */

export enum HealthStatus {
  CRITICAL = "critical",
  AT_RISK = "at_risk",
  HEALTHY = "healthy",
  IMPROVING = "improving",
}

export enum ActionQueuePriority {
  CRITICAL = "critical",
  HIGH = "high",
  MEDIUM = "medium",
  LOW = "low",
}

export interface ActionQueueItem {
  id: string;
  engagementId: string;
  name: string;
  description?: string;
  owner?: string;
  priority: ActionQueuePriority;
  status: "draft" | "assigned" | "in_progress" | "blocked" | "completed" | "verified";
  dueDate?: string;
  assignee?: string;
  blockerCount: number;
  daysOverdue?: number;
}

export interface ActionQueueSummary {
  workspaceId: string;
  totalCount: number;
  byStatus: Record<string, number>;
  byPriority: Record<string, number>;
  overdueCount: number;
  blockedCount: number;
  completedThisWeek: number;
  averageCompletionDays: number;
  criticalActions: ActionQueueItem[];
  dueThisWeek: ActionQueueItem[];
}

export interface KPISummary {
  id: string;
  name: string;
  currentValue?: number;
  targetValue?: number;
  direction: "increase" | "decrease" | "maintain";
  trend: "improving" | "stable" | "deteriorating";
  percentOfTarget?: number;
  lastUpdated?: string;
}

export interface EngagementHealthSnapshot {
  engagementId: string;
  name: string;
  status: HealthStatus;
  kpiOnTrackCount: number;
  kpiTotalCount: number;
  actionCompletionRate: number;
  riskFactors: string[];
  lastReviewDate?: string;
  recommendation?: string;
}

export interface WorkspaceHealth {
  workspaceId: string;
  assessedAt: string;
  overallStatus: HealthStatus;
  engagementCount: number;
  healthyEngagements: number;
  atRiskEngagements: number;
  criticalEngagements: number;
  activeKPICount: number;
  onTrackKPICount: number;
  actionQueueSize: number;
  overdueActionCount: number;
  averageExecutionCertainty: number;
  engagementHealthSnapshots: EngagementHealthSnapshot[];
  topRisks: string[];
  recommendedActions: string[];
}

export interface OwnerDashboardConfig {
  workspaceId: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  showCompletedActions: boolean;
  daysOfHistoryVisible: number;
  actionPriorityThreshold: ActionQueuePriority;
  healthStatusThreshold: HealthStatus;
  enableBulkActions: boolean;
  enableAdvancedFiltering: boolean;
  customFilters?: Record<string, unknown>;
}

export interface OwnerDashboardView {
  workspaceId: string;
  config: OwnerDashboardConfig;
  health: WorkspaceHealth;
  actionQueue: ActionQueueSummary;
  recentKPIs: KPISummary[];
}

export function validateActionQueueItem(item: ActionQueueItem): string[] {
  const errors: string[] = [];
  if (!item.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(item.id)) {
    errors.push("Invalid action ID format");
  }
  if (!item.name || item.name.trim().length === 0) {
    errors.push("Action name required");
  }
  if (item.blockerCount < 0) {
    errors.push("blocker count must be non-negative");
  }
  return errors;
}

export function validateActionQueueSummary(summary: ActionQueueSummary): string[] {
  const errors: string[] = [];
  if (!summary.workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(summary.workspaceId)) {
    errors.push("Invalid workspace ID format");
  }
  if (summary.totalCount < 0) {
    errors.push("Total count must be non-negative");
  }
  if (summary.overdueCount < 0) {
    errors.push("Overdue count must be non-negative");
  }
  if (summary.averageCompletionDays < 0) {
    errors.push("Average completion days must be non-negative");
  }
  return errors;
}

export function validateWorkspaceHealth(health: WorkspaceHealth): string[] {
  const errors: string[] = [];
  if (!health.workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(health.workspaceId)) {
    errors.push("Invalid workspace ID format");
  }
  if (!health.assessedAt) {
    errors.push("Assessment timestamp required");
  }
  if (health.engagementCount < 0) {
    errors.push("Engagement count must be non-negative");
  }
  if (health.healthyEngagements + health.atRiskEngagements + health.criticalEngagements > health.engagementCount) {
    errors.push("Health snapshot counts exceed total engagement count");
  }
  if (health.averageExecutionCertainty < 0 || health.averageExecutionCertainty > 100) {
    errors.push("Execution certainty must be 0-100");
  }
  return errors;
}

export function validateOwnerDashboardConfig(config: OwnerDashboardConfig): string[] {
  const errors: string[] = [];
  if (!config.workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.workspaceId)) {
    errors.push("Invalid workspace ID format");
  }
  if (!config.ownerId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(config.ownerId)) {
    errors.push("Invalid owner ID format");
  }
  if (config.daysOfHistoryVisible <= 0) {
    errors.push("Days of history visible must be positive");
  }
  return errors;
}

export function validateOwnerDashboardView(view: OwnerDashboardView): string[] {
  const errors: string[] = [];
  errors.push(...validateOwnerDashboardConfig(view.config));
  errors.push(...validateWorkspaceHealth(view.health));
  errors.push(...validateActionQueueSummary(view.actionQueue));
  return errors;
}
