import {
  ConstraintPriority,
  CONSTRAINT_PRECEDENCE,
  ConstraintConflict,
} from "../../domain/governance/governance-contracts";

/**
 * Constraint precedence engine implements deterministic conflict arbitration.
 * Follows hierarchy: SURVIVAL > COMPLIANCE > CASHFLOW > OPERATIONAL_STABILITY > GROWTH
 */

export interface RecommendationConstraintBinding {
  recommendation_id: string;
  primary_priority: ConstraintPriority;
  active: boolean;
}

/**
 * Arbitrate conflict between two recommendations
 */
export function arbitrateConstraintConflict(
  rec_a: RecommendationConstraintBinding,
  rec_b: RecommendationConstraintBinding
): ConstraintConflict {
  const priority_a = CONSTRAINT_PRECEDENCE[rec_a.primary_priority];
  const priority_b = CONSTRAINT_PRECEDENCE[rec_b.primary_priority];

  // Determine conflict type
  let conflict_type: "COMPATIBLE" | "TENSION" | "DIRECT_CONFLICT" | "MUTUALLY_EXCLUSIVE" =
    "COMPATIBLE";
  if (priority_a !== priority_b) {
    conflict_type = "TENSION";
  }

  // Determine resolution
  const resolution: "SUPPRESS_LOWER" | "ESCALATE" | "BUFFER" | "SEQUENCE" = "SUPPRESS_LOWER";
  let suppressed_recommendation_id: string | undefined;

  if (priority_a > priority_b) {
    // A has higher priority, suppress B
    suppressed_recommendation_id = rec_b.recommendation_id;
  } else if (priority_b > priority_a) {
    // B has higher priority, suppress A
    suppressed_recommendation_id = rec_a.recommendation_id;
  } else {
    // Same priority: deterministic tie-breaking (alphabetical)
    if (rec_a.recommendation_id < rec_b.recommendation_id) {
      suppressed_recommendation_id = rec_b.recommendation_id;
    } else {
      suppressed_recommendation_id = rec_a.recommendation_id;
    }
  }

  return {
    recommendation_id_a: rec_a.recommendation_id,
    recommendation_id_b: rec_b.recommendation_id,
    constraint_priority_a: rec_a.primary_priority,
    constraint_priority_b: rec_b.primary_priority,
    conflict_type,
    resolution,
    suppressed_recommendation_id,
  };
}

/**
 * Check if recommendation should be suppressed due to conflicts
 */
export function isSuppressed(
  recommendation_id: string,
  conflicts: ConstraintConflict[]
): boolean {
  return conflicts.some((c) => c.suppressed_recommendation_id === recommendation_id);
}

/**
 * Get suppression reason
 */
export function getSuppressionReason(
  recommendation_id: string,
  conflicts: ConstraintConflict[]
): string {
  const suppressing = conflicts.find((c) => c.suppressed_recommendation_id === recommendation_id);
  if (!suppressing) {
    return "";
  }

  const winner_priority = suppressing.constraint_priority_a === suppressing.constraint_priority_b
    ? "Lexicographic ordering"
    : `${suppressing.constraint_priority_a} > ${suppressing.constraint_priority_b}`;

  return `Suppressed by constraint precedence: ${winner_priority}`;
}
