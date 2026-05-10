/**
 * Survival Assessment Interface (Phase 4 Slice 5)
 *
 * Unified domain contract for complete survival assessment combining:
 * - Individual survival factor assessments (Slice 1)
 * - Shock detection analysis (Slice 2)
 * - Resilience scoring (Slice 3)
 * - Gating policy evaluation (Slice 4)
 *
 * Tenant-scoped: workspaceId required for all assessment artifacts.
 */

import { SurvivalFactorAssessment, SurvivalFactor, SurvivalFactorHealth } from "@/domain/reality/survival-factors";
import { ShockSignal } from "@/services/shock-detection-engine";
import { ResilienceScore, ResilienceLevel } from "@/services/org-resilience-scorer";
import { GatingDecision, CrisisState } from "@/domain/survival/gating-policy";

export enum AssessmentStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETE = "COMPLETE",
  PARTIAL = "PARTIAL",
  FAILED = "FAILED",
}

export enum SurvivalRisk {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
  LOW = "LOW",
}

/**
 * Complete survival assessment result
 * Combines validator, shock detection, resilience scoring, gating into single view
 */
export interface SurvivalAssessment {
  // Assessment metadata
  id: string;
  workspaceId: string;
  status: AssessmentStatus;
  assessedAt: Date;
  assessedBy: string; // User ID who triggered assessment

  // Individual factor assessments (from Slice 1: Validator)
  factorAssessments: SurvivalFactorAssessment[];
  healthySummary: {
    count: number;
    factors: SurvivalFactor[];
  };
  warningSummary: {
    count: number;
    factors: SurvivalFactor[];
  };
  criticalSummary: {
    count: number;
    factors: SurvivalFactor[];
  };

  // Shock detection (from Slice 2: Shock Detection Engine)
  shockAnalysis: {
    detected: boolean;
    signal?: ShockSignal;
    criticalFactorCount: number;
    riskEscalation: "stable" | "escalating" | "de-escalating";
  };

  // Resilience scoring (from Slice 3: Org Resilience Scorer)
  resilienceAnalysis: {
    score: ResilienceScore;
    trend: "improving" | "stable" | "declining";
    recoveryEstimate: number; // Days to recover from shock
  };

  // Gating policy (from Slice 4: Survival Gating Policy)
  gatingAnalysis: {
    crisisState: CrisisState;
    growthBlocked: boolean;
    blockedActions: string[];
    permittedActions: string[];
  };

  // Unified risk assessment
  overallRisk: SurvivalRisk;
  recommendations: AssessmentRecommendation[];
  criticalActions: CriticalAction[];

  // Audit trail
  errors?: string[];
  warnings?: string[];
}

export interface AssessmentRecommendation {
  priority: "critical" | "high" | "medium" | "low";
  category: "financial" | "operational" | "market" | "strategic";
  action: string;
  rationale: string;
  timeframe: "immediate" | "week" | "month" | "quarter";
}

export interface CriticalAction {
  id: string;
  category: string;
  description: string;
  consequence: string; // What happens if not done
  deadline?: Date;
}

/**
 * Assessment summary for dashboard/reporting
 * Minimal view of key metrics
 */
export interface AssessmentSummary {
  workspaceId: string;
  assessedAt: Date;
  overallRisk: SurvivalRisk;
  resilienceScore: number;
  resilienceLevel: ResilienceLevel;
  crisisState: CrisisState;
  shockDetected: boolean;
  growthBlocked: boolean;
  criticalFactorCount: number;
  recommendationCount: number;
  healthTrend: "improving" | "stable" | "declining";
}

/**
 * Assessment request parameters
 */
export interface AssessmentRequest {
  workspaceId: string;
  userId: string;
  includeRecommendations?: boolean;
  includeHistorical?: boolean;
  assessmentReason?: string; // Context for audit trail
}

/**
 * Assessment validation rules
 */
export const ASSESSMENT_REQUIREMENTS = {
  minFactorsRequired: 1, // At least one factor must be assessed
  minHealthyForGrowth: 50, // Minimum % of healthy factors needed for growth actions
  criticalFactorThreshold: 1, // One critical factor can trigger crisis assessment
  assessmentRecency: 7 * 24 * 60 * 60 * 1000, // 7 days in ms
};

/**
 * Map resilience level to overall risk
 */
export function classifyOverallRisk(
  resilienceScore: number,
  shockDetected: boolean,
  criticalFactorCount: number
): SurvivalRisk {
  // CRITICAL: shock detected, or very low resilience, or multiple critical factors
  if (shockDetected || resilienceScore < 40 || criticalFactorCount > 1) {
    return SurvivalRisk.CRITICAL;
  }

  // HIGH: low-medium resilience (40-59) or one critical factor
  if (resilienceScore < 60 || criticalFactorCount === 1) {
    return SurvivalRisk.HIGH;
  }

  // MEDIUM: medium resilience (60-79)
  if (resilienceScore < 80) {
    return SurvivalRisk.MEDIUM;
  }

  // LOW: high resilience (80+)
  return SurvivalRisk.LOW;
}

/**
 * Validate assessment has required data
 */
export function validateAssessment(assessment: SurvivalAssessment): boolean {
  // Must have at least one factor assessment
  if (!assessment.factorAssessments || assessment.factorAssessments.length === 0) {
    return false;
  }

  // Must have resilience score
  if (!assessment.resilienceAnalysis?.score) {
    return false;
  }

  // Must have shock analysis
  if (assessment.shockAnalysis === undefined) {
    return false;
  }

  // Must have gating analysis
  if (!assessment.gatingAnalysis) {
    return false;
  }

  // Must have overall risk classification
  if (!assessment.overallRisk) {
    return false;
  }

  return true;
}

/**
 * Assessment result for API responses (DTO)
 * Redacts sensitive internal fields
 */
export interface AssessmentDTO {
  id: string;
  workspaceId: string;
  assessedAt: Date;
  overallRisk: SurvivalRisk;
  resilienceScore: number;
  resilienceLevel: ResilienceLevel;
  crisisState: CrisisState;
  shockDetected: boolean;
  growthBlocked: boolean;
  recommendations: AssessmentRecommendation[];
  criticalActions: CriticalAction[];
  trend: "improving" | "stable" | "declining";
}

/**
 * Convert assessment to DTO for API response
 */
export function assessmentToDTO(assessment: SurvivalAssessment): AssessmentDTO {
  return {
    id: assessment.id,
    workspaceId: assessment.workspaceId,
    assessedAt: assessment.assessedAt,
    overallRisk: assessment.overallRisk,
    resilienceScore: assessment.resilienceAnalysis.score.overallScore,
    resilienceLevel: assessment.resilienceAnalysis.score.level,
    crisisState: assessment.gatingAnalysis.crisisState,
    shockDetected: assessment.shockAnalysis.detected,
    growthBlocked: assessment.gatingAnalysis.growthBlocked,
    recommendations: assessment.recommendations,
    criticalActions: assessment.criticalActions,
    trend: assessment.resilienceAnalysis.trend,
  };
}
