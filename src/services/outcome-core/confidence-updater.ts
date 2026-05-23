import { logger } from "@/infra/logger";
import {
  ConfidenceUpdateInput,
  ConfidenceUpdateResult,
  MAX_CONFIDENCE,
  MIN_CONFIDENCE,
  CONFIDENCE_RULES,
} from "@/domain/outcome/confidence";

export class ConfidenceUpdater {
  /**
   * Update confidence from outcome evidence
   * Fail-closed: invalid input returns no change
   */
  updateConfidence(input: ConfidenceUpdateInput): ConfidenceUpdateResult {
    // Validate input
    if (
      input.current_confidence < 0 ||
      input.current_confidence > 100 ||
      input.measurement_confidence < 0 ||
      input.measurement_confidence > 100
    ) {
      logger.warn("Confidence update failed validation", {
        current_confidence: input.current_confidence,
        measurement_confidence: input.measurement_confidence,
      });

      return {
        new_confidence: input.current_confidence,
        confidence_change: 0,
        update_reason: "Invalid input: confidence values must be 0-100%",
        capped_due_to_measurement: false,
        repeated_failure_penalty: false,
      };
    }

    let confidence_change = 0;
    let capped_due_to_measurement = false;
    let repeated_failure_penalty = false;
    const reason_parts: string[] = [];

    // Determine base confidence change from variance
    if (input.variance_pct > 0) {
      // Positive variance: increase confidence
      const variance_pct = input.variance_pct;
      const max_increase = CONFIDENCE_RULES.positive_variance_max;

      // Scale increase based on variance magnitude
      // Every 10% variance gives proportional increase (capped at 20%)
      const base_increase = Math.min((Math.abs(variance_pct) / 10) * 4, max_increase);

      confidence_change = base_increase;
      reason_parts.push(`Positive outcome: +${base_increase.toFixed(1)}%`);
    } else if (input.variance_pct < 0) {
      // Negative variance: decrease confidence
      const variance_pct = input.variance_pct;
      const max_decrease = CONFIDENCE_RULES.negative_variance_max;

      // Scale decrease based on variance magnitude
      // Every 10% negative variance gives proportional decrease (capped at 30%)
      const base_decrease = Math.min((Math.abs(variance_pct) / 10) * 6, max_decrease);

      confidence_change = -base_decrease;
      reason_parts.push(`Negative outcome: -${base_decrease.toFixed(1)}%`);
    } else {
      // Zero variance: neutral
      confidence_change = 0;
      reason_parts.push("Neutral outcome: no change");
    }

    // Apply repeated failure penalty
    if (input.previous_outcome === "failure" && input.variance_pct < 0) {
      confidence_change -= CONFIDENCE_RULES.repeated_failure_penalty;
      repeated_failure_penalty = true;
      reason_parts.push(
        `Repeated failure: additional -${CONFIDENCE_RULES.repeated_failure_penalty}%`
      );
    }

    // Cap update if measurement confidence is low
    if (input.measurement_confidence < CONFIDENCE_RULES.measurement_confidence_threshold) {
      const max_cap = CONFIDENCE_RULES.low_measurement_confidence_cap;
      if (Math.abs(confidence_change) > max_cap) {
        const original_change = confidence_change;
        confidence_change = Math.sign(confidence_change) * max_cap;
        capped_due_to_measurement = true;
        reason_parts.push(
          `Low measurement confidence (${input.measurement_confidence}%): capped from ${original_change.toFixed(1)}% to ±${max_cap}%`
        );
      }
    }

    // Calculate new confidence (clamped to 0-100)
    const new_confidence = Math.max(
      MIN_CONFIDENCE,
      Math.min(MAX_CONFIDENCE, input.current_confidence + confidence_change)
    );

    // If we hit a boundary, adjust the change to reflect actual change
    const actual_change = new_confidence - input.current_confidence;

    const result: ConfidenceUpdateResult = {
      new_confidence,
      confidence_change: actual_change,
      update_reason: reason_parts.join("; "),
      capped_due_to_measurement,
      repeated_failure_penalty,
    };

    logger.info("Confidence updated", {
      previous_confidence: input.current_confidence,
      new_confidence,
      confidence_change: actual_change,
      variance_pct: input.variance_pct,
      measurement_confidence: input.measurement_confidence,
      previous_outcome: input.previous_outcome,
    });

    return result;
  }

  /**
   * Check if confidence is sufficient to act (>50%)
   */
  isSufficientConfidence(confidence: number): boolean {
    return confidence > 50;
  }

  /**
   * Check if confidence is high (>70%)
   */
  isHighConfidence(confidence: number): boolean {
    return confidence > 70;
  }

  /**
   * Check if confidence is low (<50%)
   */
  isLowConfidence(confidence: number): boolean {
    return confidence < 50;
  }

  /**
   * Get confidence trend description
   */
  getConfidenceTrend(
    previous_confidence: number,
    new_confidence: number
  ): "improving" | "declining" | "stable" {
    const change = new_confidence - previous_confidence;
    if (change > 5) return "improving";
    if (change < -5) return "declining";
    return "stable";
  }
}

export const confidenceUpdater = new ConfidenceUpdater();
