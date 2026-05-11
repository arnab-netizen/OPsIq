/**
 * Public SMB Entity DTOs
 *
 * Safe, redacted data transfer objects for public SMB product.
 * Excludes: cost, profitability, internal business logic, owner-only fields.
 * Includes: engagement status, action tracking, KPI progress, experiment results.
 */

export interface PublicEngagementDTO {
  id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  industry?: string;
  currentStage: string;
  progress: number;
  createdAt: string;
  updatedAt: string;
}

export interface PublicActionDTO {
  id: string;
  name: string;
  description?: string;
  status: "draft" | "assigned" | "in_progress" | "blocked" | "completed" | "verified";
  priority: "low" | "medium" | "high" | "critical";
  dueDate?: string;
  owner?: string;
  engagementId: string;
  createdAt: string;
  updatedAt: string;
}

export interface PublicKPIDTO {
  id: string;
  name: string;
  currentValue?: number;
  targetValue?: number;
  direction: "increase" | "decrease" | "maintain";
  trend: "improving" | "stable" | "deteriorating";
  percentOfTarget?: number;
  lastUpdated?: string;
  engagementId: string;
}

export interface PublicExperimentDTO {
  id: string;
  name: string;
  engagementId: string;
  status: "draft" | "approved" | "active" | "completed" | "analyzed" | "archived";
  hypothesis: {
    statement: string;
    type: string;
    successCriterion: string;
    testDurationWeeks: number;
  };
  primaryMetric: string;
  targetValue?: number;
  actualValue?: number;
  result?: {
    classification: "success" | "partial" | "failure" | "inconclusive";
    successThresholdMet: boolean;
    roi?: number;
  };
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
}

export interface PublicFindingDTO {
  id: string;
  title: string;
  description: string;
  engagementId: string;
  severity: "low" | "medium" | "high" | "critical";
  status: "draft" | "validated" | "resolved" | "archived";
  createdAt: string;
  updatedAt: string;
}

export interface PublicRecommendationDTO {
  id: string;
  title: string;
  description: string;
  engagementId: string;
  priority: "low" | "medium" | "high" | "critical";
  status: "pending" | "approved" | "rejected" | "implemented";
  expectedImpact: {
    metric: string;
    expectedChange?: string;
    timeframe?: string;
  };
  createdAt: string;
  respondedAt?: string;
}

export interface PublicDecisionDTO {
  id: string;
  title: string;
  description: string;
  engagementId: string;
  status: "pending" | "approved" | "rejected" | "completed" | "archived";
  confidence: number;
  decision: string;
  rationale?: string;
  createdAt: string;
  decidedAt?: string;
}

export interface PublicWorkspaceHealthDTO {
  workspaceId: string;
  assessedAt: string;
  overallStatus: "critical" | "at_risk" | "healthy" | "improving";
  engagementCount: number;
  activeEngagements: number;
  completedEngagements: number;
  onTrackKPICount: number;
  totalKPICount: number;
  actionCompletionRate: number;
  averageExecutionCertainty: number;
}

export interface PublicEngagementSummaryDTO {
  id: string;
  name: string;
  status: "active" | "completed" | "cancelled";
  progress: number;
  kpiOnTrackCount: number;
  kpiTotalCount: number;
  actionCompletedCount: number;
  actionTotalCount: number;
  experimentsCount: number;
  experimentsSuccessfulCount: number;
  recommendationsCount: number;
  recommendationsImplementedCount: number;
}

export function validatePublicEngagementDTO(data: PublicEngagementDTO): string[] {
  const errors: string[] = [];
  if (!data.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) {
    errors.push("Invalid engagement ID format");
  }
  if (!data.name || data.name.trim().length === 0) {
    errors.push("Engagement name required");
  }
  if (data.progress < 0 || data.progress > 100) {
    errors.push("Progress must be 0-100");
  }
  return errors;
}

export function validatePublicActionDTO(data: PublicActionDTO): string[] {
  const errors: string[] = [];
  if (!data.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) {
    errors.push("Invalid action ID format");
  }
  if (!data.name || data.name.trim().length === 0) {
    errors.push("Action name required");
  }
  return errors;
}

export function validatePublicKPIDTO(data: PublicKPIDTO): string[] {
  const errors: string[] = [];
  if (!data.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$|^[a-z0-9-]+$/i.test(data.id)) {
    errors.push("Invalid KPI ID format");
  }
  if (!data.name || data.name.trim().length === 0) {
    errors.push("KPI name required");
  }
  return errors;
}

export function validatePublicExperimentDTO(data: PublicExperimentDTO): string[] {
  const errors: string[] = [];
  if (!data.id || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.id)) {
    errors.push("Invalid experiment ID format");
  }
  if (!data.name || data.name.trim().length === 0) {
    errors.push("Experiment name required");
  }
  if (!data.hypothesis?.statement || data.hypothesis.statement.length < 10) {
    errors.push("Hypothesis statement required (min 10 chars)");
  }
  return errors;
}

export function validatePublicWorkspaceHealthDTO(data: PublicWorkspaceHealthDTO): string[] {
  const errors: string[] = [];
  if (!data.workspaceId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(data.workspaceId)) {
    errors.push("Invalid workspace ID format");
  }
  if (data.engagementCount < 0) {
    errors.push("Engagement count must be non-negative");
  }
  if (data.averageExecutionCertainty < 0 || data.averageExecutionCertainty > 100) {
    errors.push("Execution certainty must be 0-100");
  }
  return errors;
}
