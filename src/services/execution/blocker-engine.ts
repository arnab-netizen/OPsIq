/**
 * PHASE H-5: EXECUTION BLOCKER ENGINE
 *
 * Detect, classify, and escalate execution blockers.
 * Blocked execution must not remain silently active.
 */

export type BlockerClass =
  | "CASH"
  | "PEOPLE"
  | "TIME"
  | "SKILL"
  | "APPROVAL"
  | "TOOLING"
  | "EVIDENCE"
  | "DEPENDENCY"
  | "EXTERNAL"
  | "REGULATORY";

export type BlockerSeverity = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface BlockerAnalysis {
  execution_id: string;
  blocker_class: BlockerClass;
  blocker_description: string;
  severity: BlockerSeverity;
  days_blocked: number;
  unblock_path: string;
  requires_escalation: boolean;
  escalation_owner: string | null;
  blocking: boolean;
}

/**
 * Detect and classify blocker
 */
export function detectBlocker(
  execution_id: string,
  days_since_blocked: number,
  cash_available: boolean,
  people_available: boolean,
  time_available: boolean,
  skill_available: boolean,
  approval_obtained: boolean,
  tooling_available: boolean,
  evidence_available: boolean,
  dependencies_available: boolean,
  external_dependency: boolean,
  regulatory_requirement: boolean
): BlockerAnalysis | null {
  // Determine blocker class
  let blocker_class: BlockerClass | null = null;
  let blocker_description = "";

  if (!cash_available) {
    blocker_class = "CASH";
    blocker_description = "Insufficient budget";
  } else if (!people_available) {
    blocker_class = "PEOPLE";
    blocker_description = "Required people unavailable";
  } else if (!time_available) {
    blocker_class = "TIME";
    blocker_description = "Timeline overcommitted";
  } else if (!skill_available) {
    blocker_class = "SKILL";
    blocker_description = "Required skill unavailable";
  } else if (!approval_obtained) {
    blocker_class = "APPROVAL";
    blocker_description = "Required approval pending";
  } else if (!tooling_available) {
    blocker_class = "TOOLING";
    blocker_description = "Required tools/systems unavailable";
  } else if (!evidence_available) {
    blocker_class = "EVIDENCE";
    blocker_description = "Required evidence not available";
  } else if (!dependencies_available) {
    blocker_class = "DEPENDENCY";
    blocker_description = "Dependencies not resolved";
  } else if (external_dependency) {
    blocker_class = "EXTERNAL";
    blocker_description = "External dependency pending";
  } else if (regulatory_requirement) {
    blocker_class = "REGULATORY";
    blocker_description = "Regulatory requirement not met";
  }

  if (!blocker_class) {
    return null; // No blocker
  }

  // Determine severity
  let severity: BlockerSeverity = "MEDIUM";
  if (days_since_blocked > 14) {
    severity = "CRITICAL";
  } else if (days_since_blocked > 7) {
    severity = "HIGH";
  } else if (days_since_blocked > 3) {
    severity = "MEDIUM";
  } else {
    severity = "LOW";
  }

  // Determine unblock path
  let unblock_path = "";
  switch (blocker_class) {
    case "CASH":
      unblock_path = "Request emergency budget allocation";
      break;
    case "PEOPLE":
      unblock_path = "Rescope or defer dependent tasks";
      break;
    case "TIME":
      unblock_path = "Reduce scope or extend timeline";
      break;
    case "SKILL":
      unblock_path = "Hire contractor or provide training";
      break;
    case "APPROVAL":
      unblock_path = "Escalate approval request";
      break;
    case "TOOLING":
      unblock_path = "Procure tools or use workaround";
      break;
    case "EVIDENCE":
      unblock_path = "Collect missing evidence";
      break;
    case "DEPENDENCY":
      unblock_path = "Resolve dependent task";
      break;
    case "EXTERNAL":
      unblock_path = "Follow up with external party";
      break;
    case "REGULATORY":
      unblock_path = "Engage compliance team";
      break;
  }

  const requires_escalation = severity === "CRITICAL" || days_since_blocked > 10;
  const escalation_owner = requires_escalation ? "operations" : null;

  return {
    execution_id,
    blocker_class,
    blocker_description,
    severity,
    days_blocked: days_since_blocked,
    unblock_path,
    requires_escalation,
    escalation_owner,
    blocking: true,
  };
}

/**
 * Detect blocker cascade
 */
export function detectBlockerCascade(blockers: BlockerAnalysis[]): number {
  // More than 3 critical blockers = cascade
  const critical_count = blockers.filter((b) => b.severity === "CRITICAL").length;
  return critical_count > 3 ? critical_count : 0;
}

/**
 * Get blocker summary
 */
export function getBlockerSummary(blocker: BlockerAnalysis): string {
  return `${blocker.blocker_class}: ${blocker.blocker_description} (${blocker.days_blocked}d blocked) → ${blocker.unblock_path}`;
}
