/**
 * PHASE G-10: RECOMMENDATION CONFLICT ENGINE
 *
 * Detect and manage conflicts between active recommendations.
 * Mutually exclusive recommendations cannot both be DO_NOW.
 */

export type ConflictType =
  | "COMPATIBLE"
  | "TENSION"
  | "DIRECT_CONFLICT"
  | "MUTUALLY_EXCLUSIVE";

export interface ConflictAnalysis {
  rec_a_id: string;
  rec_b_id: string;
  conflict_type: ConflictType;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  blocking: boolean;
  conflict_reasons: string[];
  required_resolution: "NONE" | "ESCALATE" | "SUPPRESS_LOWER" | "SEQUENCE";
}

/**
 * Detect conflict between two recommendations
 */
export function detectConflict(
  rec_a_id: string,
  rec_a_target_outcome: string,
  rec_a_priority: "SURVIVAL" | "COMPLIANCE" | "CASHFLOW" | "OPERATIONAL_STABILITY" | "GROWTH",
  rec_a_required_budget: number,
  rec_a_required_staff: number,
  rec_a_required_timeline_weeks: number,

  rec_b_id: string,
  rec_b_target_outcome: string,
  rec_b_priority: string,
  rec_b_required_budget: number,
  rec_b_required_staff: number,
  rec_b_required_timeline_weeks: number,

  available_budget: number,
  available_staff: number
): ConflictAnalysis {
  const conflict_reasons: string[] = [];
  let conflict_type: ConflictType = "COMPATIBLE";
  let severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL" = "LOW";
  let blocking = false;

  // Check resource conflicts
  const combined_budget = rec_a_required_budget + rec_b_required_budget;
  const combined_staff = rec_a_required_staff + rec_b_required_staff;

  if (combined_budget > available_budget) {
    conflict_reasons.push(
      `Budget conflict: ${combined_budget} required, ${available_budget} available`
    );
    conflict_type = conflict_type === "COMPATIBLE" ? "TENSION" : conflict_type;
    severity = "HIGH";
  }

  if (combined_staff > available_staff) {
    conflict_reasons.push(
      `Staffing conflict: ${combined_staff} required, ${available_staff} available`
    );
    conflict_type = conflict_type === "COMPATIBLE" ? "TENSION" : conflict_type;
    severity = "HIGH";
  }

  // Check timeline conflicts
  if (
    rec_a_required_timeline_weeks > 0 &&
    rec_b_required_timeline_weeks > 0 &&
    rec_a_required_timeline_weeks + rec_b_required_timeline_weeks > 52
  ) {
    conflict_reasons.push(
      `Timeline conflict: combined ${rec_a_required_timeline_weeks + rec_b_required_timeline_weeks} weeks exceeds annual window`
    );
    conflict_type = "TENSION";
    severity = "MEDIUM";
  }

  // Check KPI conflicts
  if (
    (rec_a_target_outcome === "GROWTH" && rec_b_target_outcome === "COST_REDUCTION") ||
    (rec_a_target_outcome === "COST_REDUCTION" && rec_b_target_outcome === "GROWTH")
  ) {
    conflict_reasons.push(
      `KPI conflict: growth vs cost reduction are conflicting objectives`
    );
    conflict_type = "DIRECT_CONFLICT";
    severity = "HIGH";
    blocking = true;
  }

  // Check priority conflicts (same priority = potential suppression)
  if (
    rec_a_priority === rec_b_priority &&
    (conflict_reasons.length > 0 || combined_budget > available_budget)
  ) {
    conflict_reasons.push(
      `Same priority conflict: both ${rec_a_priority} but resource constrained`
    );
    conflict_type = "DIRECT_CONFLICT";
    severity = "HIGH";
    blocking = true;
  }

  // Mutually exclusive check
  if (
    combined_budget > available_budget * 1.5 ||
    combined_staff > available_staff * 1.5
  ) {
    conflict_reasons.push("Resources severely constrained - recommendations mutually exclusive");
    conflict_type = "MUTUALLY_EXCLUSIVE";
    severity = "CRITICAL";
    blocking = true;
  }

  const required_resolution =
    conflict_type === "MUTUALLY_EXCLUSIVE"
      ? "SUPPRESS_LOWER"
      : conflict_type === "DIRECT_CONFLICT"
        ? "ESCALATE"
        : conflict_type === "TENSION"
          ? "SEQUENCE"
          : "NONE";

  return {
    rec_a_id,
    rec_b_id,
    conflict_type,
    severity,
    blocking,
    conflict_reasons,
    required_resolution,
  };
}

/**
 * Check if two recommendations can both be active DO_NOW
 */
export function canCoexistAsDoNow(analysis: ConflictAnalysis): boolean {
  return !analysis.blocking && analysis.conflict_type !== "MUTUALLY_EXCLUSIVE";
}

/**
 * Get conflict summary
 */
export function getConflictSummary(analysis: ConflictAnalysis): string {
  if (analysis.conflict_type === "COMPATIBLE") {
    return "No conflicts detected";
  } else if (analysis.conflict_type === "MUTUALLY_EXCLUSIVE") {
    return `MUTUALLY EXCLUSIVE: ${analysis.conflict_reasons.join("; ")}`;
  } else if (analysis.conflict_type === "DIRECT_CONFLICT") {
    return `DIRECT CONFLICT: ${analysis.conflict_reasons.join("; ")}`;
  } else {
    return `TENSION: ${analysis.conflict_reasons.join("; ")}`;
  }
}
