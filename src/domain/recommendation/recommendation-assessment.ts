/**
 * Recommendation Assessment Interface (Phase 6 Slice 5)
 *
 * Unified domain contract for comprehensive recommendation assessment.
 * Combines all Phase 6 components: domain contract (Slice 1), generator (Slice 2),
 * priority scorer (Slice 3), and action selection (Slice 4).
 *
 * Non-DB foundation: pure TypeScript interfaces and types.
 * Tenant-scoped: all assessments bound to workspaceId.
 */

import {
  Recommendation,
  RecommendationAssessment,
  RecommendationCategory,
  PriorityLevel,
  RecommendationStatus,
} from "@/domain/recommendation/recommendation";
import { PriorityScore } from "@/domain/recommendation/recommendation";
import { ActionExecutionPlan, SelectedRecommendation, ExecutionPhase } from "@/services/action-selection-engine";

/**
 * Recommendation assessment request
 */
export interface RecommendationAssessmentRequest {
  workspaceId: string;
  userId: string;

  // Business context
  survival_health?: string;
  financial_health?: string;
  current_cash_runway_months?: number;
  monthly_burn_rate?: number;
  customer_churn_rate?: number;
  team_retention_risk?: number;
  market_opportunity?: number;
  competitive_pressure?: number;
  regulatory_risk?: number;

  // Execution constraints
  available_effort_hours_per_day?: number;
  available_budget?: number;
  time_horizon_days?: number;

  // Strategy
  focus_priority?: PriorityLevel;
  resolve_dependencies?: boolean;
}

/**
 * Recommendation assessment response
 */
export interface RecommendationAssessmentResponse {
  workspaceId: string;
  assessment_id: string;
  assessed_at: Date;
  assessed_by: string;

  // Generation summary
  total_generated: number;
  by_category: {
    survival: Recommendation[];
    growth: Recommendation[];
    operational: Recommendation[];
    financial: Recommendation[];
    market: Recommendation[];
    team: Recommendation[];
    strategic: Recommendation[];
  };

  // Scoring summary
  by_priority: {
    critical: ScoredRecommendation[];
    high: ScoredRecommendation[];
    medium: ScoredRecommendation[];
    low: ScoredRecommendation[];
    defer: ScoredRecommendation[];
  };

  // Selection summary
  total_selected: number;
  selected_recommendations: SelectedRecommendation[];

  // Execution plan
  action_plan: ActionExecutionPlan;

  // Assessment insights
  insights: AssessmentInsight[];

  // Risk and feasibility
  overall_feasibility: "FEASIBLE" | "CHALLENGING" | "INFEASIBLE";
  critical_blockers: string[];
  execution_confidence: number; // 0-100
}

/**
 * Scored recommendation with context
 */
export interface ScoredRecommendation {
  id: string;
  title: string;
  category: RecommendationCategory;
  priority: PriorityLevel;
  priority_score: PriorityScore;
  summary: string;
  estimated_effort_hours?: number;
  estimated_cost?: number;
  dependencies?: string[];
  is_selected_for_action?: boolean;
  selection_reason?: string;
}

/**
 * Assessment insight
 */
export interface AssessmentInsight {
  type:
    | "CRITICAL_THREAT"
    | "STRATEGIC_OPPORTUNITY"
    | "EXECUTION_RISK"
    | "CAPACITY_CONSTRAINT"
    | "DEPENDENCY_CHAIN"
    | "QUICK_WIN"
    | "LONG_TERM_INVESTMENT";
  title: string;
  description: string;
  affected_recommendations: string[];
  recommended_action?: string;
  urgency: "IMMEDIATE" | "HIGH" | "MEDIUM" | "LOW";
}

/**
 * Recommendation assessment summary (for dashboard)
 */
export interface RecommendationAssessmentSummary {
  workspaceId: string;
  assessment_date: Date;

  // At a glance
  total_recommendations: number;
  critical_count: number;
  high_count: number;

  // Key metrics
  recommended_effort_hours: number;
  recommended_budget: number;
  plan_feasibility: "FEASIBLE" | "CHALLENGING" | "INFEASIBLE";

  // Top actions
  top_3_recommendations: ScoredRecommendation[];

  // Timeline
  estimated_start_date: Date;
  estimated_completion_date: Date;

  // Health
  execution_confidence_percent: number;
  top_blockers: string[];
}

/**
 * DTO for external API responses
 */
export interface RecommendationAssessmentDTO {
  assessment_id: string;
  assessed_at: string; // ISO 8601
  total_generated: number;
  total_selected: number;

  critical_recommendations: {
    count: number;
    titles: string[];
  };

  execution_plan: {
    is_feasible: boolean;
    total_effort_hours: number;
    total_cost: number;
    phases: number;
    estimated_completion_days: number;
  };

  feasibility: "FEASIBLE" | "CHALLENGING" | "INFEASIBLE";
  execution_confidence_percent: number;

  critical_blockers: string[];

  // Permissions
  can_export?: boolean;
  can_execute?: boolean;
}

/**
 * Assessment validation errors
 */
export interface AssessmentValidationError {
  field: string;
  error: string;
  severity: "FATAL" | "WARNING";
}

/**
 * Helper to validate assessment request
 */
export function validateRecommendationAssessmentRequest(
  req: RecommendationAssessmentRequest
): AssessmentValidationError[] {
  const errors: AssessmentValidationError[] = [];

  if (!req.workspaceId) {
    errors.push({
      field: "workspaceId",
      error: "workspaceId is required",
      severity: "FATAL",
    });
  }

  if (!req.userId) {
    errors.push({
      field: "userId",
      error: "userId is required",
      severity: "FATAL",
    });
  }

  if (req.available_effort_hours_per_day && req.available_effort_hours_per_day <= 0) {
    errors.push({
      field: "available_effort_hours_per_day",
      error: "Must be positive",
      severity: "WARNING",
    });
  }

  if (req.available_budget && req.available_budget < 0) {
    errors.push({
      field: "available_budget",
      error: "Cannot be negative",
      severity: "WARNING",
    });
  }

  if (req.time_horizon_days !== undefined && req.time_horizon_days <= 0) {
    errors.push({
      field: "time_horizon_days",
      error: "Must be positive",
      severity: "WARNING",
    });
  }

  if (req.team_retention_risk && (req.team_retention_risk < 0 || req.team_retention_risk > 1)) {
    errors.push({
      field: "team_retention_risk",
      error: "Must be between 0 and 1",
      severity: "WARNING",
    });
  }

  return errors;
}

/**
 * Helper to convert to DTO for external APIs
 */
export function toRecommendationAssessmentDTO(response: RecommendationAssessmentResponse): RecommendationAssessmentDTO {
  return {
    assessment_id: response.assessment_id,
    assessed_at: response.assessed_at.toISOString(),
    total_generated: response.total_generated,
    total_selected: response.total_selected,

    critical_recommendations: {
      count: response.by_priority.critical.length,
      titles: response.by_priority.critical.map((r) => r.title),
    },

    execution_plan: {
      is_feasible: response.action_plan.is_feasible,
      total_effort_hours: response.action_plan.total_effort_hours,
      total_cost: response.action_plan.total_cost,
      phases: response.action_plan.execution_phases.length,
      estimated_completion_days:
        response.action_plan.execution_phases.length > 0
          ? response.action_plan.execution_phases[response.action_plan.execution_phases.length - 1]
              .estimated_start_day + response.action_plan.execution_phases[response.action_plan.execution_phases.length - 1].estimated_duration_days
          : 0,
    },

    feasibility: response.overall_feasibility,
    execution_confidence_percent: response.action_plan.is_feasible ? 100 : 50,

    critical_blockers: response.critical_blockers,
  };
}

/**
 * Assessment thresholds
 */
export const ASSESSMENT_THRESHOLDS = {
  // Confidence scoring
  high_confidence_min: 80, // 80+ = HIGH confidence
  medium_confidence_min: 60,
  low_confidence_min: 40,

  // Critical action threshold
  critical_count_threshold: 3, // 3+ critical = urgent
  high_count_threshold: 5, // 5+ high = concerning

  // Feasibility thresholds
  feasible_effort_utilization: 0.8, // 80% of capacity is reasonable
  infeasible_effort_utilization: 1.2, // >120% is infeasible

  // Execution confidence
  ideal_confidence_percent: 85,
};
