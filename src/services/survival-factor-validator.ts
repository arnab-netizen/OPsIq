/**
 * Survival Factor Validator
 *
 * Validates survival factor assessments and provides health classification.
 * Fail-closed: missing data classified as UNKNOWN, not assumed healthy.
 */

import {
  SurvivalFactor,
  SurvivalFactorHealth,
  SurvivalFactorAssessment,
  FACTOR_CATEGORIES,
  SURVIVAL_THRESHOLDS,
  ALL_SURVIVAL_FACTORS,
} from "@/domain/reality/survival-factors";

export class SurvivalFactorValidator {
  /**
   * Validate a single survival factor assessment
   * @throws {Error} if factor is unknown or invalid
   */
  static validateAssessment(assessment: Partial<SurvivalFactorAssessment>): void {
    if (!assessment.factor) {
      throw new Error("Survival factor assessment missing required field: factor");
    }

    if (!ALL_SURVIVAL_FACTORS.includes(assessment.factor as SurvivalFactor)) {
      throw new Error(`Unknown survival factor: ${assessment.factor}`);
    }

    if (assessment.current_value === undefined || assessment.current_value === null) {
      throw new Error(`Assessment for ${assessment.factor} missing current_value`);
    }

    if (typeof assessment.current_value !== "number") {
      throw new Error(
        `Assessment for ${assessment.factor} current_value must be number, got ${typeof assessment.current_value}`
      );
    }

    if (!assessment.last_measured_at) {
      throw new Error(`Assessment for ${assessment.factor} missing last_measured_at`);
    }

    if (
      assessment.measurement_confidence &&
      !["high", "medium", "low"].includes(assessment.measurement_confidence)
    ) {
      throw new Error(
        `Invalid measurement_confidence: ${assessment.measurement_confidence}`
      );
    }
  }

  /**
   * Classify health of a survival factor based on current value
   */
  static classifyHealth(
    factor: SurvivalFactor,
    value: number
  ): SurvivalFactorHealth {
    const thresholds = SURVIVAL_THRESHOLDS[factor];
    if (!thresholds) {
      return SurvivalFactorHealth.UNKNOWN;
    }

    // Health scoring logic: higher values are better for most factors
    // Thresholds are defined as values to avoid (critical_below, warning_below)

    if (value <= thresholds.critical_below) {
      return SurvivalFactorHealth.CRITICAL;
    }

    if (value <= thresholds.warning_below) {
      return SurvivalFactorHealth.WARNING;
    }

    if (value >= thresholds.healthy_above) {
      return SurvivalFactorHealth.HEALTHY;
    }

    // Value is between warning and healthy
    return SurvivalFactorHealth.WARNING;
  }

  /**
   * Get category for a survival factor
   */
  static getCategory(factor: SurvivalFactor) {
    return FACTOR_CATEGORIES[factor];
  }

  /**
   * Get thresholds for a survival factor
   */
  static getThresholds(factor: SurvivalFactor) {
    return SURVIVAL_THRESHOLDS[factor];
  }

  /**
   * Validate that workspace and user are provided for audit trail
   */
  static validateTenantContext(workspaceId?: string, userId?: string): void {
    if (!workspaceId) {
      throw new Error("Survival factor assessment requires workspaceId for tenant scoping");
    }
    if (!userId) {
      throw new Error("Survival factor assessment requires userId for audit trail");
    }
  }

  /**
   * Check if any assessment category is in critical state
   */
  static hasCriticalFactors(assessments: SurvivalFactorAssessment[]): boolean {
    return assessments.some((a) => a.health === SurvivalFactorHealth.CRITICAL);
  }

  /**
   * Check if any assessment category has warnings
   */
  static hasWarningFactors(assessments: SurvivalFactorAssessment[]): boolean {
    return assessments.some((a) => a.health === SurvivalFactorHealth.WARNING);
  }

  /**
   * Get all assessments by category
   */
  static groupByCategory(
    assessments: SurvivalFactorAssessment[]
  ): Record<string, SurvivalFactorAssessment[]> {
    const grouped: Record<string, SurvivalFactorAssessment[]> = {};

    for (const assessment of assessments) {
      const category = assessment.category;
      if (!grouped[category]) {
        grouped[category] = [];
      }
      grouped[category].push(assessment);
    }

    return grouped;
  }

  /**
   * Validate measurement recency (data should be recent)
   */
  static validateMeasurementRecency(
    lastMeasuredAt: Date,
    maxAgeDays: number = 30
  ): boolean {
    const ageDays =
      (Date.now() - lastMeasuredAt.getTime()) / (1000 * 60 * 60 * 24);
    return ageDays <= maxAgeDays;
  }
}
