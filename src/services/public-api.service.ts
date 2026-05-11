/**
 * Public API Service
 *
 * Converts internal entities to safe public SMB DTOs.
 * Ensures no internal/owner/cost fields leak to public endpoints.
 */

import {
  PublicEngagementDTO,
  PublicActionDTO,
  PublicKPIDTO,
  PublicExperimentDTO,
  PublicFindingDTO,
  PublicWorkspaceHealthDTO,
  validatePublicEngagementDTO,
  validatePublicActionDTO,
  validatePublicKPIDTO,
  validatePublicExperimentDTO,
  validatePublicWorkspaceHealthDTO,
} from "@/domain/public/smb-dto";

export class PublicAPIError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

export function toPublicEngagementDTO(engagement: any): PublicEngagementDTO {
  const dto: PublicEngagementDTO = {
    id: engagement.id,
    name: engagement.name,
    status: engagement.status || "active",
    industry: engagement.industry,
    currentStage: engagement.currentStage || "Initial Assessment",
    progress: engagement.progress || 0,
    createdAt: engagement.createdAt || new Date().toISOString(),
    updatedAt: engagement.updatedAt || new Date().toISOString(),
  };

  const errors = validatePublicEngagementDTO(dto);
  if (errors.length > 0) {
    throw new PublicAPIError("INVALID_DTO", `Invalid engagement DTO: ${errors.join("; ")}`);
  }

  return dto;
}

export function toPublicActionDTO(action: any): PublicActionDTO {
  const dto: PublicActionDTO = {
    id: action.id,
    name: action.name,
    description: action.description,
    status: action.status || "draft",
    priority: action.priority || "medium",
    dueDate: action.dueDate,
    owner: action.owner || action.assignee,
    engagementId: action.engagementId,
    createdAt: action.createdAt || new Date().toISOString(),
    updatedAt: action.updatedAt || new Date().toISOString(),
  };

  const errors = validatePublicActionDTO(dto);
  if (errors.length > 0) {
    throw new PublicAPIError("INVALID_DTO", `Invalid action DTO: ${errors.join("; ")}`);
  }

  return dto;
}

export function toPublicKPIDTO(kpi: any): PublicKPIDTO {
  const dto: PublicKPIDTO = {
    id: kpi.id || kpi.slug || "",
    name: kpi.name,
    currentValue: kpi.currentValue,
    targetValue: kpi.targetValue,
    direction: kpi.direction || "increase",
    trend: kpi.trend || "stable",
    percentOfTarget: kpi.percentOfTarget,
    lastUpdated: kpi.lastUpdated || kpi.updatedAt,
    engagementId: kpi.engagementId,
  };

  const errors = validatePublicKPIDTO(dto);
  if (errors.length > 0) {
    throw new PublicAPIError("INVALID_DTO", `Invalid KPI DTO: ${errors.join("; ")}`);
  }

  return dto;
}

export function toPublicExperimentDTO(experiment: any): PublicExperimentDTO {
  const dto: PublicExperimentDTO = {
    id: experiment.id,
    name: experiment.name,
    engagementId: experiment.engagementId,
    status: experiment.status || "draft",
    hypothesis: {
      statement: experiment.plan?.hypothesis?.statement || "",
      type: experiment.plan?.hypothesis?.type || "revenue_growth",
      successCriterion: experiment.plan?.hypothesis?.successCriterion || "",
      testDurationWeeks: experiment.plan?.hypothesis?.testDurationWeeks || 4,
    },
    primaryMetric: experiment.plan?.primaryMetric || "",
    targetValue: experiment.plan?.hypothesis?.successThreshold,
    actualValue: experiment.result?.primaryMetricValue,
    result: experiment.result
      ? {
          classification: experiment.result.classification || "inconclusive",
          successThresholdMet: experiment.result.successThresholdMet || false,
          roi: experiment.result.roi,
        }
      : undefined,
    createdAt: experiment.createdAt || new Date().toISOString(),
    startedAt: experiment.execution?.startedAt,
    completedAt: experiment.execution?.actualEndDate,
  };

  const errors = validatePublicExperimentDTO(dto);
  if (errors.length > 0) {
    throw new PublicAPIError("INVALID_DTO", `Invalid experiment DTO: ${errors.join("; ")}`);
  }

  return dto;
}

export function toPublicFindingDTO(finding: any): PublicFindingDTO {
  return {
    id: finding.id,
    title: finding.title,
    description: finding.description,
    engagementId: finding.engagementId,
    severity: finding.severity || "low",
    status: finding.status || "draft",
    createdAt: finding.createdAt || new Date().toISOString(),
    updatedAt: finding.updatedAt || new Date().toISOString(),
  };
}

export function toPublicWorkspaceHealthDTO(health: any): PublicWorkspaceHealthDTO {
  const dto: PublicWorkspaceHealthDTO = {
    workspaceId: health.workspaceId,
    assessedAt: health.assessedAt || new Date().toISOString(),
    overallStatus: health.overallStatus || "healthy",
    engagementCount: health.engagementCount || 0,
    activeEngagements: health.healthyEngagements + health.atRiskEngagements,
    completedEngagements: 0,
    onTrackKPICount: health.onTrackKPICount || 0,
    totalKPICount: health.activeKPICount || 0,
    actionCompletionRate: (health.completedThisWeek || 0) / Math.max(health.actionQueueSize || 1, 1),
    averageExecutionCertainty: health.averageExecutionCertainty || 50,
  };

  const errors = validatePublicWorkspaceHealthDTO(dto);
  if (errors.length > 0) {
    throw new PublicAPIError("INVALID_DTO", `Invalid health DTO: ${errors.join("; ")}`);
  }

  return dto;
}

export function assertPublicAccess(capability: string, workspaceId: string): void {
  if (!capability || !workspaceId) {
    throw new PublicAPIError("UNAUTHORIZED", "Public access requires valid workspace ID");
  }
}
