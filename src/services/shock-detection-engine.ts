/**
 * Shock Detection Engine (Phase 4)
 *
 * Detects org survival shocks by monitoring SurvivalFactor assessments.
 * Shock = one or more survival factors cross CRITICAL health threshold.
 *
 * Fail-closed: missing assessments → no shock signal
 * Tenant-scoped: workspaceId required for all operations
 */

import { SurvivalFactorValidator } from "@/services/survival-factor-validator";
import { SurvivalFactorHealth, SurvivalFactorAssessment } from "@/domain/reality/survival-factors";

export enum ShockSeverity {
  CRITICAL = "CRITICAL",
  HIGH = "HIGH",
  MEDIUM = "MEDIUM",
}

export enum ShockCategory {
  FINANCIAL = "FINANCIAL",
  OPERATIONAL = "OPERATIONAL",
  MARKET = "MARKET",
  STRATEGIC = "STRATEGIC",
}

export interface ShockSignal {
  id: string;
  shockDetected: boolean;
  severity: ShockSeverity;
  category: ShockCategory;
  triggeringFactors: string[];
  recommendedAction: string;
  detectedAt: Date;
  workspaceId: string;
}

/**
 * Detect shock events from survival factor assessments
 * Fail-closed: no critical factors → no shock
 */
export class ShockDetectionEngine {
  static detectShock(
    assessments: SurvivalFactorAssessment[],
    workspaceId: string
  ): ShockSignal {
    // Validate tenant scoping
    if (!workspaceId) {
      throw new Error("ShockDetectionEngine requires workspaceId for tenant scoping");
    }

    // Find critical factors
    const criticalFactors = assessments.filter(
      (a) => a.health === SurvivalFactorHealth.CRITICAL
    );

    // No critical factors → no shock
    if (criticalFactors.length === 0) {
      return {
        id: this.generateId(),
        shockDetected: false,
        severity: ShockSeverity.MEDIUM,
        category: this.inferCategory(assessments),
        triggeringFactors: [],
        recommendedAction: "No immediate shock detected. Continue monitoring.",
        detectedAt: new Date(),
        workspaceId,
      };
    }

    // One+ critical factors → shock
    const severity = this.classifySeverity(criticalFactors.length, assessments);
    const category = this.inferCategory(criticalFactors);

    return {
      id: this.generateId(),
      shockDetected: true,
      severity,
      category,
      triggeringFactors: criticalFactors.map((f) => f.factor),
      recommendedAction: this.recommendAction(category, severity),
      detectedAt: new Date(),
      workspaceId,
    };
  }

  /**
   * Classify shock severity based on number of critical factors
   * and presence of multiple warning factors
   */
  private static classifySeverity(
    criticalCount: number,
    allAssessments: SurvivalFactorAssessment[]
  ): ShockSeverity {
    // Multiple critical factors → CRITICAL
    if (criticalCount >= 2) {
      return ShockSeverity.CRITICAL;
    }

    // One critical + multiple warnings → HIGH
    const warningCount = allAssessments.filter(
      (a) => a.health === SurvivalFactorHealth.WARNING
    ).length;
    if (criticalCount === 1 && warningCount >= 2) {
      return ShockSeverity.HIGH;
    }

    // One critical, few warnings → CRITICAL (survival is at risk)
    return ShockSeverity.CRITICAL;
  }

  /**
   * Infer primary shock category from critical factors
   */
  private static inferCategory(
    factors: SurvivalFactorAssessment[]
  ): ShockCategory {
    if (factors.length === 0) {
      return ShockCategory.FINANCIAL;
    }

    const categoryCounts = {
      financial: 0,
      operational: 0,
      market: 0,
      strategic: 0,
    };

    for (const factor of factors) {
      categoryCounts[factor.category]++;
    }

    // Return most common category
    let maxCount = 0;
    let maxCategory: ShockCategory = ShockCategory.FINANCIAL;

    for (const [category, count] of Object.entries(categoryCounts)) {
      if (count > maxCount) {
        maxCount = count;
        maxCategory = category.toUpperCase() as ShockCategory;
      }
    }

    return maxCategory;
  }

  /**
   * Recommend action based on shock category and severity
   */
  private static recommendAction(category: ShockCategory, severity: ShockSeverity): string {
    const actionMap: Record<ShockCategory, string> = {
      FINANCIAL: "Immediate financial review required. Assess runway, debt obligations, revenue stability.",
      OPERATIONAL: "Critical operational review required. Assess key dependencies, infrastructure, team stability.",
      MARKET: "Urgent market review required. Assess customer concentration, churn, demand trends.",
      STRATEGIC: "Strategic review required. Assess competitive position, tech debt, partnerships.",
    };

    const urgency = severity === ShockSeverity.CRITICAL ? "[URGENT] " : "";
    return urgency + actionMap[category];
  }

  /**
   * Generate unique shock signal ID
   */
  private static generateId(): string {
    return `shock-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Determine if org is in survival mode (any critical factors)
   */
  static isInSurvivalMode(assessments: SurvivalFactorAssessment[]): boolean {
    return SurvivalFactorValidator.hasCriticalFactors(assessments);
  }

  /**
   * Count critical factors by category
   */
  static criticalFactorsByCategory(
    assessments: SurvivalFactorAssessment[]
  ): Record<string, number> {
    const critical = assessments.filter(
      (a) => a.health === SurvivalFactorHealth.CRITICAL
    );

    const counts: Record<string, number> = {
      financial: 0,
      operational: 0,
      market: 0,
      strategic: 0,
    };

    for (const factor of critical) {
      counts[factor.category]++;
    }

    return counts;
  }
}
