import { db } from "@/lib/db";
import { NotFoundError } from "@/infra/errors";
import { logger } from "@/infra/logger";

// ─── Engagement Health Status ──────────────────────────────────────────────────

export type EngagementHealthStatus = "healthy" | "at_risk" | "blocked";

export interface EngagementHealth {
  status: EngagementHealthStatus;
  reasons: string[];
  requiresIntervention: boolean;
  details: {
    criticalFindings: number;
    criticalActions: number;
    overdueActions: number;
    blockedCriticalActions: number;
    highPriorityActions: number;
  };
}

// ─── Health Computation ────────────────────────────────────────────────────────

export async function computeEngagementHealth(engagementId: string): Promise<EngagementHealth> {
  // Fetch engagement
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  // Fetch related data in parallel
  const [findings, actions] = await Promise.all([
    db.finding.findMany({
      where: { engagementId },
    }),
    db.action.findMany({
      where: { engagementId },
    }),
  ]);

  const reasons: string[] = [];
  let status: EngagementHealthStatus = "healthy";

  // Count critical elements
  const criticalFindings = findings.filter((f: typeof findings[0]) => f.severity === "critical");
  const unresolvedCriticalFindings = criticalFindings.filter(
    (f: typeof findings[0]) => f.status !== "resolved" && f.status !== "superseded"
  );
  const criticalActions = actions.filter((a: typeof actions[0]) => a.priority === "critical");
  const overdueActions = actions.filter((a: typeof actions[0]) => {
    if (a.status === "completed" || a.status === "cancelled") return false;
    if (!a.dueDate) return false;
    return a.dueDate < new Date();
  });
  const blockedCriticalActions = actions.filter(
    (a: typeof actions[0]) => a.priority === "critical" && a.status === "blocked"
  );
  const highPriorityActions = actions.filter(
    (a: typeof actions[0]) => (a.priority === "critical" || a.priority === "high") &&
           a.status !== "completed" &&
           a.status !== "cancelled"
  );

  // ─── BLOCKED CONDITIONS ────────────────────────────────────────────────────

  if (unresolvedCriticalFindings.length > 0) {
    status = "blocked";
    reasons.push(
      `${unresolvedCriticalFindings.length} unresolved critical finding(s) blocking progress`
    );
  }

  if (blockedCriticalActions.length > 0) {
    status = "blocked";
    reasons.push(
      `${blockedCriticalActions.length} critical action(s) are blocked and must be resolved`
    );
  }

  if (overdueActions.length > 0) {
    const overdueWithCritical = overdueActions.filter((a: typeof actions[0]) => a.priority === "critical");
    if (overdueWithCritical.length > 0) {
      status = "blocked";
      reasons.push(
        `${overdueWithCritical.length} critical action(s) are overdue and blocking progress`
      );
    }
  }

  // ─── AT_RISK CONDITIONS ────────────────────────────────────────────────────

  if (status !== "blocked") {
    if (highPriorityActions.length > 3) {
      status = "at_risk";
      reasons.push(
        `${highPriorityActions.length} high-priority actions in progress (exceeds safe threshold of 3)`
      );
    }

    if (overdueActions.length > 0 && status === "healthy") {
      status = "at_risk";
      reasons.push(`${overdueActions.length} action(s) past due date`);
    }

    if (unresolvedCriticalFindings.length > 0 && status === "healthy") {
      status = "at_risk";
      reasons.push(
        `${unresolvedCriticalFindings.length} high-severity finding(s) pending resolution`
      );
    }
  }

  // ─── RESULT ────────────────────────────────────────────────────────────────

  const health: EngagementHealth = {
    status,
    reasons,
    requiresIntervention: status === "blocked",
    details: {
      criticalFindings: criticalFindings.length,
      criticalActions: criticalActions.length,
      overdueActions: overdueActions.length,
      blockedCriticalActions: blockedCriticalActions.length,
      highPriorityActions: highPriorityActions.length,
    },
  };

  logger.debug("Engagement health computed", {
    engagementId,
    status: health.status,
    reasonCount: health.reasons.length,
  });

  return health;
}

// ─── Health Enforcement ────────────────────────────────────────────────────────

export async function enforceEngagementHealth(
  engagementId: string,
  desiredStatus: string
): Promise<boolean> {
  const health = await computeEngagementHealth(engagementId);

  // Cannot transition to "completed" if blocked
  if (desiredStatus === "completed" && health.status === "blocked") {
    return false;
  }

  // Cannot transition to "archived" if blocked
  if (desiredStatus === "archived" && health.status === "blocked") {
    return false;
  }

  return true;
}

// ─── Health Monitoring ────────────────────────────────────────────────────────

export async function checkEngagementHealthChange(
  engagementId: string,
  previousHealth: EngagementHealth | null
): Promise<{
  changed: boolean;
  statusTransition?: { from: EngagementHealthStatus; to: EngagementHealthStatus };
  newReasons: string[];
  resolvedReasons: string[];
}> {
  const currentHealth = await computeEngagementHealth(engagementId);

  if (!previousHealth) {
    return {
      changed: true,
      statusTransition: undefined,
      newReasons: currentHealth.reasons,
      resolvedReasons: [],
    };
  }

  const statusChanged = previousHealth.status !== currentHealth.status;
  const reasonsChanged = JSON.stringify(previousHealth.reasons) !== JSON.stringify(currentHealth.reasons);

  const newReasons = currentHealth.reasons.filter((r) => !previousHealth.reasons.includes(r));
  const resolvedReasons = previousHealth.reasons.filter((r) => !currentHealth.reasons.includes(r));

  return {
    changed: statusChanged || reasonsChanged,
    statusTransition: statusChanged
      ? { from: previousHealth.status, to: currentHealth.status }
      : undefined,
    newReasons,
    resolvedReasons,
  };
}

// ─── Health Snapshot for Reporting ────────────────────────────────────────────

export async function getEngagementHealthSnapshot(
  engagementId: string
): Promise<{
  health: EngagementHealth;
  timestamp: string;
  engagementCode: string;
}> {
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { code: true },
  });

  if (!engagement) {
    throw new NotFoundError("Engagement", engagementId);
  }

  const health = await computeEngagementHealth(engagementId);

  return {
    health,
    timestamp: new Date().toISOString(),
    engagementCode: engagement.code,
  };
}
