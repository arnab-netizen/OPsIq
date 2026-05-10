/**
 * Recommendation Domain Contract (Phase 6 Slice 1)
 *
 * Defines the canonical recommendation structure combining business context,
 * impact scoring, urgency assessment, and action decomposition.
 *
 * Non-DB foundation: pure TypeScript contracts and types.
 * Tenant-scoped: all recommendations bound to workspaceId.
 */

/**
 * Recommendation category
 */
export enum RecommendationCategory {
  SURVIVAL = "SURVIVAL",
  GROWTH = "GROWTH",
  OPERATIONAL = "OPERATIONAL",
  FINANCIAL = "FINANCIAL",
  MARKET = "MARKET",
  TEAM = "TEAM",
  STRATEGIC = "STRATEGIC",
}

/**
 * Priority level (derived from impact × urgency / effort)
 */
export enum PriorityLevel {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  DEFER = "DEFER",
}

/**
 * Recommendation status lifecycle
 */
export enum RecommendationStatus {
  PENDING = "PENDING",
  REVIEWED = "REVIEWED",
  ACCEPTED = "ACCEPTED",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  FAILED = "FAILED",
  DECLINED = "DECLINED",
  SUPERSEDED = "SUPERSEDED",
}

/**
 * Impact assessment dimensions
 */
export enum ImpactDimension {
  REVENUE = "REVENUE",
  PROFITABILITY = "PROFITABILITY",
  SURVIVAL = "SURVIVAL",
  TEAM_CAPACITY = "TEAM_CAPACITY",
  RISK_REDUCTION = "RISK_REDUCTION",
  MARKET_POSITION = "MARKET_POSITION",
  CUSTOMER_SATISFACTION = "CUSTOMER_SATISFACTION",
}

/**
 * Effort scale for action execution
 */
export enum EffortScale {
  MINIMAL = "MINIMAL",
  SMALL = "SMALL",
  MEDIUM = "MEDIUM",
  LARGE = "LARGE",
  VERY_LARGE = "VERY_LARGE",
}

/**
 * Confidence level in recommendation
 */
export enum ConfidenceLevel {
  VERY_HIGH = "VERY_HIGH",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
  SPECULATIVE = "SPECULATIVE",
}

/**
 * Evidence for recommendation
 */
export interface RecommendationEvidence {
  type: "KPI" | "SURVIVAL_FACTOR" | "FEEDBACK" | "ANALYSIS" | "HISTORICAL" | "PEER_BENCHMARK";
  source: string;
  finding: string;
  measurement?: number;
  measured_at: Date;
  confidence: ConfidenceLevel;
}

/**
 * Impact scoring
 */
export interface ImpactAssessment {
  dimension: ImpactDimension;
  baseline: number;
  projected: number;
  improvement_percent: number;
  confidence: ConfidenceLevel;
  supporting_evidence: RecommendationEvidence[];
}

/**
 * Urgency assessment
 */
export interface UrgencyAssessment {
  is_time_sensitive: boolean;
  window_days?: number;
  penalty_if_delayed_percent?: number;
  rationale: string;
}

/**
 * Resource requirements
 */
export interface ResourceRequirement {
  type: "PEOPLE" | "CAPITAL" | "TIME" | "EXPERTISE" | "TOOLS";
  quantity?: number;
  unit?: string;
  estimated_cost?: number;
  estimated_hours?: number;
  bottleneck_risk: "none" | "low" | "medium" | "high";
}

/**
 * Action item
 */
export interface ActionItem {
  id: string;
  title: string;
  description: string;
  estimated_effort: EffortScale;
  estimated_hours?: number;
  dependencies: string[];
  owner_capability?: string;
  is_parallel_safe: boolean;
  success_criteria: string[];
}

/**
 * Constraint factors
 */
export interface ConstraintFactor {
  type: "OWNER_AVAILABILITY" | "TEAM_CAPACITY" | "FINANCIAL" | "TECHNICAL" | "MARKET" | "REGULATORY";
  severity: "low" | "medium" | "high";
  description: string;
  mitigation?: string;
}

/**
 * Priority scoring formula result
 */
export interface PriorityScore {
  impact_score: number; // 0-100
  urgency_score: number; // 0-100
  confidence_score: number; // 0-100
  effort_score: number; // 0-100 (inverted: higher = less effort)
  risk_score: number; // 0-100 (inverted: higher = less risk)
  constraint_friction: number; // 1.0-10.0 (higher = more friction)
  composite_priority: number; // impact × urgency × confidence / (effort × risk × friction)
  priority_level: PriorityLevel;
}

/**
 * Risk assessment
 */
export interface RiskAssessment {
  execution_risk: "low" | "medium" | "high";
  market_risk: "low" | "medium" | "high";
  financial_risk: "low" | "medium" | "high";
  customer_risk: "low" | "medium" | "high";
  total_risk_level: "low" | "medium" | "high" | "critical";
  mitigations: string[];
}

/**
 * Recommendation request
 */
export interface RecommendationRequest {
  workspaceId: string;
  userId: string;
  context_type: RecommendationCategory;
  current_state: Record<string, unknown>;
  constraints?: ConstraintFactor[];
  desired_outcome?: string;
}

/**
 * Recommendation entity
 */
export interface Recommendation {
  id: string;
  workspaceId: string;
  category: RecommendationCategory;
  status: RecommendationStatus;

  // Content
  title: string;
  summary: string;
  detailed_rationale: string;
  expected_outcome: string;
  success_criteria: string[];

  // Scoring
  priority_score: PriorityScore;
  impact_assessments: ImpactAssessment[];
  urgency: UrgencyAssessment;
  risk_assessment: RiskAssessment;

  // Execution
  action_items: ActionItem[];
  resource_requirements: ResourceRequirement[];
  constraints: ConstraintFactor[];
  estimated_total_hours?: number;
  estimated_total_cost?: number;

  // Supporting data
  evidence: RecommendationEvidence[];
  competing_recommendations?: string[];
  dependencies_on_other_recs?: string[];

  // Metadata
  created_at: Date;
  created_by: string;
  last_reviewed_at?: Date;
  reviewed_by?: string;
  reviewed_feedback?: string;
  accepted_at?: Date;
  started_at?: Date;
  completed_at?: Date;
  outcome_achieved?: boolean;
  outcome_notes?: string;
  version: number;

  // Audit
  is_approved: boolean;
  approved_by?: string;
  approved_at?: Date;
}

/**
 * Recommendation assessment result
 */
export interface RecommendationAssessment {
  workspaceId: string;
  assessed_at: Date;
  total_recommendations: number;
  by_priority: {
    critical: Recommendation[];
    high: Recommendation[];
    medium: Recommendation[];
    low: Recommendation[];
  };
  by_status: {
    pending: Recommendation[];
    accepted: Recommendation[];
    in_progress: Recommendation[];
    completed: Recommendation[];
  };
  highest_priority_recommendation?: Recommendation;
  recommended_next_action?: Recommendation;
}

/**
 * Recommendation thresholds and benchmarks
 */
export const RECOMMENDATION_THRESHOLDS = {
  // Priority scoring
  critical_priority_score: 500, // impact × urgency × confidence / (effort × risk × friction)
  high_priority_score: 200,
  medium_priority_score: 50,
  low_priority_score: 0,

  // Impact thresholds
  critical_impact_percent: 30, // 30% improvement is critical
  high_impact_percent: 15,
  medium_impact_percent: 5,

  // Urgency thresholds
  critical_urgency_days: 7,
  high_urgency_days: 30,
  medium_urgency_days: 90,

  // Confidence levels for recommendation
  confidence_very_high: 90,
  confidence_high: 75,
  confidence_medium: 50,
  confidence_low: 30,

  // Risk thresholds
  critical_risk_level: "critical",
  high_risk_threshold: 80,
  medium_risk_threshold: 50,

  // Effort mapping (hours)
  minimal_hours: 2,
  small_hours: 8,
  medium_hours: 40,
  large_hours: 100,
  very_large_hours: 200,
};

/**
 * Validate recommendation
 */
export function validateRecommendation(rec: Recommendation): boolean {
  if (!rec.id || !rec.workspaceId) return false;
  if (!rec.title || !rec.summary) return false;
  if (!rec.priority_score) return false;
  if (!rec.action_items || rec.action_items.length === 0) return false;
  if (!rec.evidence || rec.evidence.length === 0) return false;
  return true;
}

/**
 * Convert recommendation to DTO for API response
 */
export interface RecommendationDTO {
  id: string;
  workspaceId: string;
  category: RecommendationCategory;
  status: RecommendationStatus;
  title: string;
  summary: string;
  priority_level: PriorityLevel;
  priority_score: number;
  impact_percent: number;
  urgency_days?: number;
  action_count: number;
  estimated_hours?: number;
  risk_level: string;
  is_approved: boolean;
  created_at: Date;
  completed_at?: Date;
}

/**
 * Convert recommendation to DTO
 */
export function recommendationToDTO(rec: Recommendation): RecommendationDTO {
  const primary_impact = rec.impact_assessments?.[0];
  return {
    id: rec.id,
    workspaceId: rec.workspaceId,
    category: rec.category,
    status: rec.status,
    title: rec.title,
    summary: rec.summary,
    priority_level: rec.priority_score.priority_level,
    priority_score: Math.round(rec.priority_score.composite_priority),
    impact_percent: primary_impact?.improvement_percent ?? 0,
    urgency_days: rec.urgency?.window_days,
    action_count: rec.action_items.length,
    estimated_hours: rec.estimated_total_hours,
    risk_level: rec.risk_assessment.total_risk_level,
    is_approved: rec.is_approved,
    created_at: rec.created_at,
    completed_at: rec.completed_at,
  };
}

/**
 * Recommendation assessment summary for dashboards
 */
export interface RecommendationSummary {
  workspaceId: string;
  critical_count: number;
  high_count: number;
  medium_count: number;
  in_progress_count: number;
  completed_count: number;
  top_recommendation?: Recommendation;
  assessed_at: Date;
}
