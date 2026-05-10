/**
 * Recommendation Priority Scorer Engine (Phase 6 Slice 3)
 *
 * Scores recommendations based on impact, urgency, confidence, effort, risk,
 * and organizational constraints. Produces composite priority scores that
 * guide action selection and resource allocation.
 *
 * Non-DB foundation: pure TypeScript scoring logic.
 * Tenant-scoped: all scoring bound to workspaceId.
 */

import {
  Recommendation,
  PriorityScore,
  PriorityLevel,
  ImpactAssessment,
  ConstraintFactor,
  ActionItem,
  RECOMMENDATION_THRESHOLDS,
} from "@/domain/recommendation/recommendation";
import { EffortScale } from "@/domain/recommendation/recommendation";

/**
 * Recommendation priority scorer service
 */
export class RecommendationPriorityScorerEngine {
  /**
   * Score a single recommendation
   */
  static scoreRecommendation(recommendation: Recommendation): PriorityScore {
    if (!recommendation.workspaceId) {
      throw new Error("Priority scoring requires workspaceId");
    }

    const impact_score = this.calculateImpactScore(recommendation.impact_assessments);
    const urgency_score = this.calculateUrgencyScore(recommendation.urgency);
    const confidence_score = this.calculateConfidenceScore(recommendation.evidence);
    const effort_score = this.calculateEffortScore(recommendation.action_items);
    const risk_score = this.calculateRiskScore(recommendation.risk_assessment);
    const constraint_friction = this.calculateConstraintFriction(recommendation.constraints);

    // Composite priority = impact × urgency × confidence / (effort × risk × friction)
    const numerator = impact_score * urgency_score * confidence_score;
    const denominator = Math.max(1, effort_score * risk_score * constraint_friction);
    const composite_priority = numerator / denominator;

    const priority_level = this.classifyPriority(composite_priority);

    return {
      impact_score,
      urgency_score,
      confidence_score,
      effort_score,
      risk_score,
      constraint_friction,
      composite_priority,
      priority_level,
    };
  }

  /**
   * Score multiple recommendations and sort by priority
   */
  static scoreAndRankRecommendations(recommendations: Recommendation[]): Recommendation[] {
    const scored = recommendations.map((rec) => ({
      ...rec,
      priority_score: this.scoreRecommendation(rec),
    }));

    return scored.sort((a, b) => b.priority_score.composite_priority - a.priority_score.composite_priority);
  }

  /**
   * Calculate impact score (0-100) from impact assessments
   * Higher impact = higher score
   */
  private static calculateImpactScore(impacts: ImpactAssessment[]): number {
    if (!impacts || impacts.length === 0) {
      return 50; // Default medium if no impact data
    }

    // Average improvement percent across dimensions
    const avgImprovement = impacts.reduce((sum, i) => sum + i.improvement_percent, 0) / impacts.length;

    // Scale to 0-100 based on thresholds
    if (avgImprovement >= RECOMMENDATION_THRESHOLDS.critical_impact_percent) {
      return 100; // Critical impact
    } else if (avgImprovement >= RECOMMENDATION_THRESHOLDS.high_impact_percent) {
      return 85; // High impact
    } else if (avgImprovement >= RECOMMENDATION_THRESHOLDS.medium_impact_percent) {
      return 60; // Medium impact
    } else {
      return Math.min(50, avgImprovement * 5); // Low impact (scale 0-20% → 0-50)
    }
  }

  /**
   * Calculate urgency score (0-100) based on time sensitivity
   * Higher urgency = higher score
   */
  private static calculateUrgencyScore(urgency: { is_time_sensitive: boolean; window_days?: number; penalty_if_delayed_percent?: number; rationale: string }): number {
    if (!urgency.is_time_sensitive) {
      return 20; // Low urgency if not time-sensitive
    }

    const window = urgency.window_days ?? 30;
    const penalty = urgency.penalty_if_delayed_percent ?? 10;

    // CRITICAL: < 7 days
    if (window <= RECOMMENDATION_THRESHOLDS.critical_urgency_days) {
      return 100;
    }
    // HIGH: 7-30 days
    else if (window <= RECOMMENDATION_THRESHOLDS.high_urgency_days) {
      return 80;
    }
    // MEDIUM: 30-90 days
    else if (window <= RECOMMENDATION_THRESHOLDS.medium_urgency_days) {
      return 50;
    }
    // LOW: > 90 days
    else {
      return 20;
    }
  }

  /**
   * Calculate confidence score (0-100) from evidence
   * Higher confidence = higher score
   */
  private static calculateConfidenceScore(evidence: { type: string; confidence: string }[]): number {
    if (!evidence || evidence.length === 0) {
      return 50; // Default medium confidence if no evidence
    }

    // Count high-confidence evidence
    const confidenceWeights = {
      VERY_HIGH: 100,
      HIGH: 85,
      MEDIUM: 60,
      LOW: 30,
      SPECULATIVE: 10,
    };

    const avgConfidence =
      evidence.reduce((sum, e) => sum + (confidenceWeights[e.confidence as keyof typeof confidenceWeights] ?? 50), 0) / evidence.length;

    return Math.round(avgConfidence);
  }

  /**
   * Calculate effort score (1-100: higher = more effort required)
   * Used in denominator: higher effort = lower priority
   */
  private static calculateEffortScore(actions: ActionItem[]): number {
    if (!actions || actions.length === 0) {
      return 50; // Default medium effort
    }

    // Map effort scales to scores (higher = more effort)
    const effortWeights: Record<string, number> = {
      MINIMAL: 1,
      SMALL: 20,
      MEDIUM: 50,
      LARGE: 75,
      VERY_LARGE: 95,
    };

    const avgEffort = actions.reduce((sum, a) => sum + (effortWeights[a.estimated_effort] ?? 50), 0) / actions.length;

    return Math.round(avgEffort);
  }

  /**
   * Calculate risk score (1-100: higher = more risk)
   * Used in denominator: higher risk = lower priority
   */
  private static calculateRiskScore(riskAssessment: {
    execution_risk: string;
    market_risk: string;
    financial_risk: string;
    customer_risk: string;
    total_risk_level: string;
  }): number {
    const riskWeights: Record<string, number> = {
      low: 5,
      medium: 30,
      high: 70,
      critical: 95,
    };

    // Weight by risk type (execution risk most important)
    const executionRiskScore = riskWeights[riskAssessment.execution_risk] ?? 50;
    const marketRiskScore = riskWeights[riskAssessment.market_risk] ?? 50;
    const financialRiskScore = riskWeights[riskAssessment.financial_risk] ?? 50;
    const customerRiskScore = riskWeights[riskAssessment.customer_risk] ?? 50;

    // Weighted average: execution 40%, market 20%, financial 20%, customer 20%
    const avgRisk = executionRiskScore * 0.4 + marketRiskScore * 0.2 + financialRiskScore * 0.2 + customerRiskScore * 0.2;

    return Math.round(avgRisk);
  }

  /**
   * Calculate constraint friction (1.0-10.0)
   * More constraints = higher friction = higher denominator divisor = lower priority
   */
  private static calculateConstraintFriction(constraints: ConstraintFactor[]): number {
    if (!constraints || constraints.length === 0) {
      return 1.0; // No friction if no constraints
    }

    // Weight constraints by severity
    const severityWeights: Record<string, number> = {
      low: 1.2,
      medium: 1.5,
      high: 2.0,
    };

    const totalFriction = constraints.reduce((sum, c) => sum * (severityWeights[c.severity] ?? 1.2), 1.0);

    // Cap at 10.0 (can't be more than 10x friction)
    return Math.min(10.0, totalFriction);
  }

  /**
   * Classify priority level based on composite score
   */
  private static classifyPriority(compositeScore: number): PriorityLevel {
    if (compositeScore >= RECOMMENDATION_THRESHOLDS.critical_priority_score) {
      return PriorityLevel.CRITICAL;
    } else if (compositeScore >= RECOMMENDATION_THRESHOLDS.high_priority_score) {
      return PriorityLevel.HIGH;
    } else if (compositeScore >= RECOMMENDATION_THRESHOLDS.medium_priority_score) {
      return PriorityLevel.MEDIUM;
    } else if (compositeScore > RECOMMENDATION_THRESHOLDS.low_priority_score) {
      return PriorityLevel.LOW;
    } else {
      return PriorityLevel.DEFER;
    }
  }

  /**
   * Filter recommendations by priority level
   */
  static filterByPriority(recommendations: Recommendation[], targetPriority: PriorityLevel): Recommendation[] {
    return recommendations.filter((rec) => rec.priority_score.priority_level === targetPriority);
  }

  /**
   * Get critical and high priority recommendations
   */
  static getCriticalAndHighPriority(recommendations: Recommendation[]): Recommendation[] {
    return recommendations.filter(
      (rec) => rec.priority_score.priority_level === PriorityLevel.CRITICAL || rec.priority_score.priority_level === PriorityLevel.HIGH
    );
  }

  /**
   * Validate workspace scope
   */
  static validateWorkspaceId(workspaceId: string, recommendation: Recommendation): void {
    if (!workspaceId) {
      throw new Error("Priority scoring requires workspaceId");
    }
    if (recommendation.workspaceId !== workspaceId) {
      throw new Error(`Recommendation workspace mismatch: expected ${workspaceId}, got ${recommendation.workspaceId}`);
    }
  }
}
