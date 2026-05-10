/**
 * Org Resilience Scorer (Phase 4)
 *
 * Calculates org's ability to absorb survival shocks.
 * Resilience = capacity to withstand critical factors + recover from shocks.
 *
 * Scoring: 0-100 scale
 * - 80-100: Highly resilient (can absorb multiple critical factors)
 * - 60-79: Resilient (limited shock absorption)
 * - 40-59: Fragile (vulnerable to cascading failures)
 * - 0-39: At-risk (survival threatened by single shock)
 *
 * Fail-closed: missing data → lower resilience score
 * Tenant-scoped: workspaceId required
 */

import { SurvivalFactorValidator } from "@/services/survival-factor-validator";
import { SurvivalFactorHealth, SurvivalFactorAssessment } from "@/domain/reality/survival-factors";

export enum ResilienceLevel {
  HIGHLY_RESILIENT = "HIGHLY_RESILIENT",
  RESILIENT = "RESILIENT",
  FRAGILE = "FRAGILE",
  AT_RISK = "AT_RISK",
}

export interface ResilienceScore {
  overallScore: number; // 0-100
  level: ResilienceLevel;
  scoreByCategory: Record<string, number>;
  criticalGaps: string[];
  strengthAreas: string[];
  shockAbsorptionCapacity: number; // How many critical factors can be absorbed
  recoveryTimelineDays: number; // Est. time to recover from shock
  workspaceId: string;
  assessedAt: Date;
}

/**
 * Score org resilience based on survival factor assessments
 * Fail-closed: critical factors reduce resilience
 */
export class OrgResilienceScorer {
  static scoreResilience(
    assessments: SurvivalFactorAssessment[],
    workspaceId: string
  ): ResilienceScore {
    // Validate tenant scoping
    if (!workspaceId) {
      throw new Error("OrgResilienceScorer requires workspaceId for tenant scoping");
    }

    // Group assessments by category
    const byCategory = SurvivalFactorValidator.groupByCategory(assessments);

    // Score each category
    const categoryScores: Record<string, number> = {};
    for (const [category, factors] of Object.entries(byCategory)) {
      categoryScores[category] = this.scoreCategoryResilience(factors);
    }

    // Compute overall score (weighted average)
    const overallScore = this.computeOverallScore(categoryScores);
    const level = this.classifyLevel(overallScore);

    // Identify critical gaps (categories with low resilience)
    const criticalGaps = Object.entries(categoryScores)
      .filter(([_, score]) => score < 40)
      .map(([category, score]) => `${category}: ${Math.round(score)}/100`);

    // Identify strength areas (categories with high resilience)
    const strengthAreas = Object.entries(categoryScores)
      .filter(([_, score]) => score >= 70)
      .map(([category, score]) => `${category}: ${Math.round(score)}/100`);

    // Calculate shock absorption capacity based on resilience level
    const shockAbsorption = this.calculateShockAbsorptionCapacity(assessments, level);

    // Estimate recovery timeline
    const recoveryTime = this.estimateRecoveryTimeline(assessments, overallScore);

    return {
      overallScore: Math.round(overallScore),
      level,
      scoreByCategory: Object.fromEntries(
        Object.entries(categoryScores).map(([k, v]) => [k, Math.round(v)])
      ),
      criticalGaps,
      strengthAreas,
      shockAbsorptionCapacity: shockAbsorption,
      recoveryTimelineDays: recoveryTime,
      workspaceId,
      assessedAt: new Date(),
    };
  }

  /**
   * Score resilience for a single category
   * Higher score if more healthy factors, fewer critical factors
   */
  private static scoreCategoryResilience(
    assessments: SurvivalFactorAssessment[]
  ): number {
    if (assessments.length === 0) {
      return 50; // Neutral score for missing data
    }

    const healthy = assessments.filter(
      (a) => a.health === SurvivalFactorHealth.HEALTHY
    ).length;
    const warning = assessments.filter(
      (a) => a.health === SurvivalFactorHealth.WARNING
    ).length;
    const critical = assessments.filter(
      (a) => a.health === SurvivalFactorHealth.CRITICAL
    ).length;

    // Weighted scoring: healthy +30, warning -15, critical -40
    const weightedScore =
      (healthy * 30 - warning * 15 - critical * 40) / assessments.length + 50;

    // Clamp to 0-100
    return Math.max(0, Math.min(100, weightedScore));
  }

  /**
   * Compute overall resilience score from category scores
   * Equal weight to all categories (can be adjusted based on org priorities)
   */
  private static computeOverallScore(categoryScores: Record<string, number>): number {
    const scores = Object.values(categoryScores);
    if (scores.length === 0) {
      return 50; // Neutral if no data
    }
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  }

  /**
   * Classify resilience level from score
   */
  private static classifyLevel(score: number): ResilienceLevel {
    if (score >= 80) return ResilienceLevel.HIGHLY_RESILIENT;
    if (score >= 60) return ResilienceLevel.RESILIENT;
    if (score >= 40) return ResilienceLevel.FRAGILE;
    return ResilienceLevel.AT_RISK;
  }

  /**
   * Calculate how many critical factors org can absorb before survival mode
   * Based on resilience level: higher resilience = more capacity
   */
  private static calculateShockAbsorptionCapacity(
    assessments: SurvivalFactorAssessment[],
    resilienceLevel?: ResilienceLevel
  ): number {
    // If level provided, use it directly
    if (resilienceLevel) {
      switch (resilienceLevel) {
        case ResilienceLevel.HIGHLY_RESILIENT:
          return 3;
        case ResilienceLevel.RESILIENT:
          return 2;
        case ResilienceLevel.FRAGILE:
          return 1;
        case ResilienceLevel.AT_RISK:
          return 0;
      }
    }

    // Fallback: estimate from assessments
    const healthy = assessments.filter(
      (a) => a.health === SurvivalFactorHealth.HEALTHY
    ).length;
    const unhealthy = assessments.filter(
      (a) =>
        a.health === SurvivalFactorHealth.WARNING ||
        a.health === SurvivalFactorHealth.CRITICAL
    ).length;

    if (unhealthy === 0) return 3;
    if (unhealthy <= healthy) return 2;
    if (unhealthy <= healthy * 2) return 1;
    return 0;
  }

  /**
   * Estimate time to recover from critical shock based on resilience
   * Better resilience = faster recovery
   */
  private static estimateRecoveryTimeline(
    assessments: SurvivalFactorAssessment[],
    overallScore: number
  ): number {
    // Base recovery time: 90 days
    let baseRecovery = 90;

    // Adjust based on critical factors
    const criticalCount = assessments.filter(
      (a) => a.health === SurvivalFactorHealth.CRITICAL
    ).length;
    baseRecovery += criticalCount * 30; // Each critical factor adds 30 days

    // Adjust based on resilience: higher resilience = faster recovery
    const recoveryFactor = (100 - overallScore) / 50; // 0.2x to 2x
    return Math.round(baseRecovery * recoveryFactor);
  }

  /**
   * Determine if org is in resilience crisis (score < 40)
   */
  static isInResilienceCrisis(assessments: SurvivalFactorAssessment[]): boolean {
    // Simple heuristic: >50% critical or warning factors = crisis
    const unhealthyCount = assessments.filter(
      (a) =>
        a.health === SurvivalFactorHealth.CRITICAL ||
        a.health === SurvivalFactorHealth.WARNING
    ).length;
    return unhealthyCount > assessments.length / 2;
  }

  /**
   * Get detailed resilience breakdown by category
   */
  static getDetailedBreakdown(
    assessments: SurvivalFactorAssessment[],
    workspaceId: string
  ): Record<string, { score: number; level: ResilienceLevel; factors: string[] }> {
    if (!workspaceId) {
      throw new Error("OrgResilienceScorer requires workspaceId");
    }

    const byCategory = SurvivalFactorValidator.groupByCategory(assessments);
    const breakdown: Record<
      string,
      { score: number; level: ResilienceLevel; factors: string[] }
    > = {};

    for (const [category, factors] of Object.entries(byCategory)) {
      const score = this.scoreCategoryResilience(factors);
      breakdown[category] = {
        score: Math.round(score),
        level: this.classifyLevel(score),
        factors: factors.map((f) => `${f.factor} (${f.health})`),
      };
    }

    return breakdown;
  }
}
