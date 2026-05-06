import { logger } from "@/infra/logger";
import {
  FrictionCalculation,
  FrictionAdjustment,
  FrictionImpactAnalysis,
  getFrictionDelay,
  getFrictionCategory,
  FRICTION_DELAYS,
} from "@/domain/execution/friction";

export class FrictionModel {
  /**
   * Calculate friction delay for action based on dependency count
   */
  calculateFriction(dependency_count: number): FrictionCalculation {
    const friction_delay_days = getFrictionDelay(dependency_count);
    const adjustment_factor = friction_delay_days > 0 ? 1 + friction_delay_days / 10 : 1;

    logger.debug("Friction calculated", {
      dependency_count,
      friction_delay_days,
      adjustment_factor,
    });

    return {
      dependency_count,
      friction_delay_days,
      adjustment_factor,
    };
  }

  /**
   * Adjust action duration based on friction
   */
  adjustDuration(
    action_id: string,
    effort_hours: number,
    dependency_count: number
  ): FrictionAdjustment {
    const friction_delay_days = getFrictionDelay(dependency_count);
    const adjusted_duration = effort_hours + friction_delay_days;

    const category = getFrictionCategory(dependency_count);
    const adjustment_reason =
      category === "low"
        ? "Minimal coordination overhead"
        : category === "medium"
          ? "Moderate coordination overhead"
          : category === "high"
            ? "High coordination overhead"
            : "Critical coordination overhead (many dependencies)";

    logger.info("Action duration adjusted", {
      action_id,
      effort_hours,
      friction_delay_days,
      adjusted_duration,
      category,
    });

    return {
      action_id,
      base_effort_hours: effort_hours,
      friction_delay_days,
      adjusted_duration,
      adjustment_reason,
    };
  }

  /**
   * Analyze friction impact on action timeline and downstream effects
   */
  analyzeFrictionImpact(
    action_id: string,
    base_timeline_days: number,
    dependency_count: number
  ): FrictionImpactAnalysis {
    const friction_timeline_days =
      base_timeline_days + getFrictionDelay(dependency_count);
    const timeline_increase_percent =
      base_timeline_days > 0
        ? ((friction_timeline_days - base_timeline_days) / base_timeline_days) * 100
        : 0;
    const downstream_delay_impact = getFrictionDelay(dependency_count);

    logger.debug("Friction impact analyzed", {
      action_id,
      base_timeline_days,
      friction_timeline_days,
      timeline_increase_percent,
      downstream_delay_impact,
    });

    return {
      action_id,
      base_timeline_days,
      friction_timeline_days,
      timeline_increase_percent,
      downstream_delay_impact,
    };
  }

  /**
   * Get friction category name for dependency count
   */
  getFrictionCategory(dependency_count: number): "low" | "medium" | "high" | "critical" {
    return getFrictionCategory(dependency_count);
  }

  /**
   * Calculate total friction across all actions
   */
  calculateTotalFriction(
    actions: Array<{ action_id: string; dependency_count: number }>
  ): {
    total_friction_days: number;
    avg_friction_days: number;
    max_friction_days: number;
    actions_with_high_friction: string[];
  } {
    const frictions = actions.map((a) => ({
      action_id: a.action_id,
      friction: getFrictionDelay(a.dependency_count),
    }));

    const total_friction_days = frictions.reduce((sum, f) => sum + f.friction, 0);
    const avg_friction_days =
      frictions.length > 0 ? total_friction_days / frictions.length : 0;
    const max_friction_days = Math.max(...frictions.map((f) => f.friction), 0);

    const actions_with_high_friction = frictions
      .filter((f) => f.friction >= 10)
      .map((f) => f.action_id);

    return {
      total_friction_days,
      avg_friction_days,
      max_friction_days,
      actions_with_high_friction,
    };
  }

  /**
   * Validate friction values
   */
  validateFrictionCalculation(calculation: FrictionCalculation): boolean {
    // Friction delay must be non-negative
    if (calculation.friction_delay_days < 0) {
      logger.warn("Invalid friction delay (negative)", {
        friction_delay_days: calculation.friction_delay_days,
      });
      return false;
    }

    // Adjustment factor must be >= 1
    if (calculation.adjustment_factor < 1) {
      logger.warn("Invalid adjustment factor (< 1)", {
        adjustment_factor: calculation.adjustment_factor,
      });
      return false;
    }

    // Friction delay should be bounded
    if (calculation.friction_delay_days > 30) {
      logger.warn("Unusually high friction delay", {
        friction_delay_days: calculation.friction_delay_days,
      });
      // Don't fail, just warn
    }

    return true;
  }

  /**
   * Get recommended mitigation strategies for high friction
   */
  getMitigationStrategies(
    dependency_count: number
  ): {
    friction_category: string;
    recommended_strategies: string[];
  } {
    const category = getFrictionCategory(dependency_count);
    const strategies: Record<string, string[]> = {
      low: [
        "Standard execution, minimal coordination",
        "No special mitigation needed",
      ],
      medium: [
        "Establish clear communication channels",
        "Schedule check-ins with stakeholders",
        "Create dependency documentation",
      ],
      high: [
        "Assign dedicated coordination role",
        "Implement daily sync meetings",
        "Create critical path timeline",
        "Establish escalation procedure",
      ],
      critical: [
        "Consider breaking into smaller sub-projects",
        "Assign project manager for coordination",
        "Implement multiple communication channels",
        "Create detailed dependency map",
        "Plan for potential delays (add buffer)",
        "Have contingency plans for key dependencies",
      ],
    };

    return {
      friction_category: category,
      recommended_strategies: strategies[category] || [],
    };
  }
}

export const frictionModel = new FrictionModel();
