import type { DriftDetectionResult } from "./execution-drift.service";

export interface RequiredAction {
  type: string;
  entityId: string;
  label: string;
  urgency: "high" | "critical";
  reason: string;
}

export function mapDriftToRequiredAction(drift: DriftDetectionResult): RequiredAction | null {
  // No action needed if no drift detected
  if (!drift.driftDetected) {
    return null;
  }

  const lowerReasons = drift.reasons.map((r) => r.toLowerCase());

  // Priority 1: Overdue critical actions (most time-sensitive)
  if (drift.affectedActions.length > 0) {
    return {
      type: "action",
      entityId: drift.affectedActions[0],
      label: "Resume or reassign overdue critical action",
      urgency: "critical",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("overdue")) || "Critical action is overdue",
    };
  }

  // Priority 2: Critical blockers blocking execution (prevent progress)
  if (lowerReasons.some((r) => r.includes("blocker"))) {
    return {
      type: "blocker",
      entityId: `blocker-${drift.engagementId}`,
      label: "Resolve critical blocker preventing execution",
      urgency: "critical",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("blocker")) || "Critical blocker present",
    };
  }

  // Priority 3: Execution certainty critically low (systemic issue)
  if (lowerReasons.some((r) => r.includes("critically low"))) {
    return {
      type: "review",
      entityId: drift.engagementId,
      label: "Review and update execution plan",
      urgency: "critical",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("critically low")) || "Execution certainty is critically low",
    };
  }

  // Priority 4: Health status critical (immediate intervention needed)
  if (lowerReasons.some((r) => r.includes("health is critical"))) {
    return {
      type: "intervention",
      entityId: drift.engagementId,
      label: "Initiate health recovery intervention",
      urgency: "critical",
      reason: "Engagement health has deteriorated to critical",
    };
  }

  // Priority 5: Execution certainty low (investigate and improve)
  if (lowerReasons.some((r) => r.includes("execution certainty low"))) {
    return {
      type: "review",
      entityId: drift.engagementId,
      label: "Review execution plan and improve certainty",
      urgency: "high",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("execution certainty low")) || "Execution certainty is low",
    };
  }

  // Priority 6: Blocked recommendations (unblock progress)
  if (lowerReasons.some((r) => r.includes("blocked"))) {
    return {
      type: "recommendation",
      entityId: `recommendation-${drift.engagementId}`,
      label: "Unblock and approve pending recommendation",
      urgency: "high",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("blocked")) || "Recommendation is blocked",
    };
  }

  // Priority 7: Unresolved critical findings (create action)
  if (lowerReasons.some((r) => r.includes("critical finding"))) {
    return {
      type: "finding",
      entityId: `finding-${drift.engagementId}`,
      label: "Create or update action for critical finding",
      urgency: "high",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("critical finding")) || "Critical finding unresolved",
    };
  }

  // Priority 8: Stale recommendations (push to completion)
  if (lowerReasons.some((r) => r.includes("in progress for"))) {
    return {
      type: "recommendation",
      entityId: `recommendation-${drift.engagementId}`,
      label: "Complete long-pending recommendation",
      urgency: "high",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("in progress")) || "Recommendation in progress too long",
    };
  }

  // Priority 9: At-risk health (proactive management)
  if (lowerReasons.some((r) => r.includes("health is at risk"))) {
    return {
      type: "checkin",
      entityId: drift.engagementId,
      label: "Perform engagement health check-in",
      urgency: "high",
      reason: "Engagement health is at risk",
    };
  }

  // Priority 10: Inactivity (maintain engagement rhythm)
  if (lowerReasons.some((r) => r.includes("no updates"))) {
    return {
      type: "checkin",
      entityId: drift.engagementId,
      label: "Perform scheduled engagement check-in",
      urgency: "high",
      reason: drift.reasons.find((r) => r.toLowerCase().includes("no updates")) || "No engagement updates recently",
    };
  }

  // Fallback: something detected but not categorized
  if (drift.severity === "critical") {
    return {
      type: "review",
      entityId: drift.engagementId,
      label: "Investigate and address critical drift",
      urgency: "critical",
      reason: "Critical drift detected",
    };
  }

  // Default to high urgency review if any drift at all
  if (drift.driftDetected) {
    return {
      type: "review",
      entityId: drift.engagementId,
      label: "Review engagement status",
      urgency: "high",
      reason: "Execution drift detected",
    };
  }

  return null;
}
