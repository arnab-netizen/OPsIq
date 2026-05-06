import { logger } from "@/infra/logger";
import {
  ImpactTrackerInput,
  ImpactResult,
  ImpactDirection,
  MeasurementQuality,
  MEASUREMENT_CONFIDENCE_THRESHOLD,
} from "@/domain/outcome/impact";

export class ImpactTracker {
  /**
   * Track impact of action: measure actual vs baseline
   * Fail-closed: missing baseline or actual returns invalid result
   */
  trackImpact(input: ImpactTrackerInput): ImpactResult {
    const errors: string[] = [];

    // 1. Validate baseline exists (fail-closed)
    if (!input.baseline_metric) {
      errors.push("Baseline metric is required but missing (fail-closed)");
    }

    // 2. Validate actual outcome is measured (not projected)
    if (!input.actual_outcome) {
      errors.push("Actual outcome is required but missing (fail-closed)");
    }

    // 3. Validate measurement confidence
    if (input.measurement_confidence < 0 || input.measurement_confidence > 100) {
      errors.push("Measurement confidence must be between 0-100%");
    }

    const isValid = errors.length === 0;

    if (!isValid) {
      logger.warn("Impact tracking failed validation", {
        action_id: input.action_id,
        errors,
      });

      return {
        action_id: input.action_id,
        decision_id: input.decision_id,
        workspace_id: input.workspace_id,
        baseline_value: 0,
        actual_value: 0,
        variance: 0,
        variance_pct: 0,
        impact_direction: ImpactDirection.NEUTRAL,
        measurement_quality: MeasurementQuality.LOW,
        is_valid: false,
        validation_errors: errors,
      };
    }

    const baseline = input.baseline_metric!;
    const actual = input.actual_outcome!;

    // Calculate variance and variance_pct
    const variance = actual.actual_value - baseline.baseline_value;
    const variance_pct = baseline.baseline_value !== 0
      ? (variance / baseline.baseline_value) * 100
      : 0;

    // Determine impact direction
    const impact_direction = this.determineDirection(variance);

    // Determine measurement quality
    const measurement_quality = this.determineMeasurementQuality(
      input.measurement_confidence
    );

    const result: ImpactResult = {
      action_id: input.action_id,
      decision_id: input.decision_id,
      workspace_id: input.workspace_id,
      baseline_value: baseline.baseline_value,
      actual_value: actual.actual_value,
      variance,
      variance_pct,
      impact_direction,
      measurement_quality,
      is_valid: true,
      validation_errors: [],
    };

    logger.info("Impact tracked", {
      action_id: input.action_id,
      variance,
      variance_pct,
      impact_direction,
      measurement_confidence: input.measurement_confidence,
    });

    return result;
  }

  /**
   * Determine impact direction from variance
   */
  private determineDirection(variance: number): ImpactDirection {
    if (variance > 0) {
      return ImpactDirection.POSITIVE;
    } else if (variance < 0) {
      return ImpactDirection.NEGATIVE;
    }
    return ImpactDirection.NEUTRAL;
  }

  /**
   * Determine measurement quality based on confidence
   */
  private determineMeasurementQuality(confidence: number): MeasurementQuality {
    if (confidence >= 80) {
      return MeasurementQuality.HIGH;
    } else if (confidence >= 60) {
      return MeasurementQuality.MEDIUM;
    }
    return MeasurementQuality.LOW;
  }

  /**
   * Check if measurement quality is sufficient for evidence
   */
  isSufficientEvidence(confidence: number): boolean {
    return confidence >= MEASUREMENT_CONFIDENCE_THRESHOLD;
  }

  /**
   * Get impact magnitude (absolute value)
   */
  getImpactMagnitude(result: ImpactResult): number {
    return Math.abs(result.variance);
  }

  /**
   * Get impact magnitude percentage
   */
  getImpactMagnitudePct(result: ImpactResult): number {
    return Math.abs(result.variance_pct);
  }

  /**
   * Validate baseline and actual have same unit
   */
  validateMetricCompatibility(
    baseline_metric: any,
    actual_metric: any
  ): boolean {
    if (!baseline_metric || !actual_metric) {
      return false;
    }
    return baseline_metric.unit === actual_metric.unit;
  }
}

export const impactTracker = new ImpactTracker();
