import { db } from "@/lib/db";
import type { DriftDetectionResult } from "./execution-drift.service";

export interface RequiredAction {
  type: string;
  entityId: string;
  label: string;
  urgency: "high" | "critical";
  reason: string;
}

export interface ActionCommitment {
  status: "pending" | "acknowledged" | "in_progress" | "completed";
  acknowledgedAt?: string;
  startedAt?: string;
  completedAt?: string;
}

export interface RequiredActionWithCommitment {
  action: RequiredAction;
  commitment: ActionCommitment;
}

interface ScoredAction {
  action: RequiredAction;
  score: number;
  category: string;
}

/**
 * Score drift conditions across multiple dimensions.
 * Higher score = higher priority for action.
 */
function scoreDriftConditions(drift: DriftDetectionResult): ScoredAction[] {
  const scoredActions: ScoredAction[] = [];
  const lowerReasons = drift.reasons.map((r) => r.toLowerCase());

  // Category 1: Time-Critical Issues (Score: 80-100)
  // Overdue critical actions
  if (drift.affectedActions.length > 0) {
    const overdueCount = drift.affectedActions.length;
    scoredActions.push({
      action: {
        type: "action",
        entityId: drift.affectedActions[0],
        label: `Resume or reassign ${overdueCount} overdue critical action(s)`,
        urgency: "critical",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("overdue")) || "Critical actions are overdue",
      },
      score: 95 - Math.min(overdueCount - 1, 5), // 95-90 based on count
      category: "overdue",
    });
  }

  // Category 2: Execution Blockers (Score: 70-90)
  // Critical blockers
  if (lowerReasons.some((r) => r.includes("blocker"))) {
    const blockerCount = drift.reasons.filter((r) => r.toLowerCase().includes("blocker")).length;
    scoredActions.push({
      action: {
        type: "blocker",
        entityId: `blocker-${drift.engagementId}`,
        label: `Resolve ${blockerCount} critical blocker(s)`,
        urgency: "critical",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("blocker")) || "Critical blocker present",
      },
      score: 85 - Math.min(blockerCount - 1, 5), // 85-80
      category: "blocker",
    });
  }

  // Category 3: Health Crisis (Score: 75-85)
  // Critical health
  if (lowerReasons.some((r) => r.includes("health is critical"))) {
    scoredActions.push({
      action: {
        type: "intervention",
        entityId: drift.engagementId,
        label: "Initiate health recovery intervention",
        urgency: "critical",
        reason: "Engagement health has deteriorated to critical",
      },
      score: 85,
      category: "critical_health",
    });
  }

  // At-risk health
  if (lowerReasons.some((r) => r.includes("health is at risk"))) {
    scoredActions.push({
      action: {
        type: "checkin",
        entityId: drift.engagementId,
        label: "Perform engagement health check-in",
        urgency: "high",
        reason: "Engagement health is at risk",
      },
      score: 65,
      category: "at_risk_health",
    });
  }

  // Category 4: Execution Certainty Issues (Score: 60-80)
  // Critically low execution certainty
  if (lowerReasons.some((r) => r.includes("critically low"))) {
    scoredActions.push({
      action: {
        type: "review",
        entityId: drift.engagementId,
        label: "Review and update execution plan immediately",
        urgency: "critical",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("critically low")) || "Execution certainty is critically low",
      },
      score: 80,
      category: "certainty_critical",
    });
  }

  // Low execution certainty
  if (lowerReasons.some((r) => r.includes("execution certainty low")) && !lowerReasons.some((r) => r.includes("critically"))) {
    scoredActions.push({
      action: {
        type: "review",
        entityId: drift.engagementId,
        label: "Review execution plan and improve certainty",
        urgency: "high",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("execution certainty low")) || "Execution certainty is low",
      },
      score: 70,
      category: "certainty_low",
    });
  }

  // Category 5: Unresolved Items (Score: 50-75)
  // Unresolved critical findings
  if (lowerReasons.some((r) => r.includes("critical finding"))) {
    const findingCount = drift.reasons.filter((r) => r.toLowerCase().includes("critical finding")).length;
    scoredActions.push({
      action: {
        type: "finding",
        entityId: `finding-${drift.engagementId}`,
        label: `Create or update action for ${findingCount} critical finding(s)`,
        urgency: "high",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("critical finding")) || "Critical finding unresolved",
      },
      score: 75 - Math.min(findingCount - 1, 5), // 75-70
      category: "critical_finding",
    });
  }

  // Blocked recommendations
  if (lowerReasons.some((r) => r.includes("blocked") && r.includes("recommendation"))) {
    const blockedCount = drift.reasons.filter((r) => r.toLowerCase().includes("blocked") && r.toLowerCase().includes("recommendation")).length;
    scoredActions.push({
      action: {
        type: "recommendation",
        entityId: `recommendation-${drift.engagementId}`,
        label: `Unblock and approve ${blockedCount} pending recommendation(s)`,
        urgency: "high",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("blocked")) || "Recommendation is blocked",
      },
      score: 70 - Math.min(blockedCount - 1, 3), // 70-67
      category: "blocked_rec",
    });
  }

  // Stale recommendations
  if (lowerReasons.some((r) => r.includes("in progress for"))) {
    const staleCount = drift.reasons.filter((r) => r.toLowerCase().includes("in progress")).length;
    scoredActions.push({
      action: {
        type: "recommendation",
        entityId: `recommendation-${drift.engagementId}`,
        label: `Complete ${staleCount} long-pending recommendation(s)`,
        urgency: "high",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("in progress")) || "Recommendation in progress too long",
      },
      score: 60 - Math.min(staleCount - 1, 5), // 60-55
      category: "stale_rec",
    });
  }

  // Category 6: Maintenance (Score: 30-50)
  // Inactivity
  if (lowerReasons.some((r) => r.includes("no updates"))) {
    const daysSinceUpdate = parseInt(drift.reasons.find((r) => r.toLowerCase().includes("no updates"))?.match(/\d+/)?.[0] || "7");
    scoredActions.push({
      action: {
        type: "checkin",
        entityId: drift.engagementId,
        label: "Perform scheduled engagement check-in",
        urgency: "high",
        reason: drift.reasons.find((r) => r.toLowerCase().includes("no updates")) || "No engagement updates recently",
      },
      score: 50 - Math.min(daysSinceUpdate - 7, 10), // 50-40
      category: "inactivity",
    });
  }

  return scoredActions;
}

/**
 * Select the highest-priority action from all drift conditions.
 */
export function mapDriftToRequiredAction(drift: DriftDetectionResult): RequiredAction | null {
  if (!drift.driftDetected) {
    return null;
  }

  const scoredActions = scoreDriftConditions(drift);

  if (scoredActions.length === 0) {
    return null;
  }

  // Sort by score (descending) and return the highest
  scoredActions.sort((a, b) => b.score - a.score);
  return scoredActions[0].action;
}

/**
 * Derive commitment status from related action state in database.
 * Status progression: pending → in_progress → completed
 * "acknowledged" is a user-initiated state (would require DB, so we skip it for now)
 */
export async function deriveCommitmentStatus(action: RequiredAction, workspaceId: string): Promise<ActionCommitment> {
  // Default commitment state
  const commitment: ActionCommitment = {
    status: "pending",
  };

  // Only check for action-type requiredActions
  if (action.type !== "action") {
    return commitment;
  }

  try {
    // Look up the action in the database
    const dbAction = await db.action.findFirst({
      where: { id: action.entityId, engagement: { workspaceId } },
      select: { status: true, startedAt: true, updatedAt: true },
    });

    if (!dbAction) {
      return commitment;
    }

    // Derive status from action's current state
    if (dbAction.status === "completed" || dbAction.status === "verified") {
      commitment.status = "completed";
      commitment.completedAt = dbAction.updatedAt?.toISOString();
    } else if (dbAction.status === "in_progress") {
      commitment.status = "in_progress";
      commitment.startedAt = dbAction.startedAt?.toISOString() || dbAction.updatedAt?.toISOString();
    } else if (dbAction.status === "pending" || dbAction.status === "blocked") {
      commitment.status = "pending";
    }
  } catch {
    // If action lookup fails, return default pending status
  }

  return commitment;
}

/**
 * Get required action with commitment status.
 */
export async function getRequiredActionWithCommitment(
  drift: DriftDetectionResult,
  workspaceId: string
): Promise<RequiredActionWithCommitment | null> {
  const action = mapDriftToRequiredAction(drift);

  if (!action) {
    return null;
  }

  const commitment = await deriveCommitmentStatus(action, workspaceId);

  return {
    action,
    commitment,
  };
}
