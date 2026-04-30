import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { enforceWorkspaceId } from "@/lib/workspace-validation";

export interface ReviewCycle {
  id: string;
  engagementId: string;
  status: "improving" | "stagnant" | "worsening";
  kpiProgressSummary: string;
  unresolvedFindingsCount: number;
  completedActionsCount: number;
  blockedActionsCount: number;
  rationale: string;
  createdAt: Date;
}

export interface ReviewCycleStats {
  totalKPIs: number;
  onTrackKPIs: number;
  actionStatus: {
    completed: number;
    open: number;
    inProgress: number;
    blocked: number;
  };
  findingStatus: {
    unresolved: number;
    validated: number;
    disputed: number;
  };
}

export async function generateReviewCycle(
  engagementId: string,
  actorId: string,
  workspaceId: string
): Promise<ReviewCycle> {
  enforceWorkspaceId(workspaceId, "generateReviewCycle", "review_cycle");

  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  // Get all KPIs and evaluate progress
  const kpis = await db.kPI.findMany({
    where: { engagementId, workspaceId },
    select: {
      id: true,
      currentValue: true,
      target: true,
      direction: true,
    },
  });

  const kpiProgressions: Array<{ isOnTrack: boolean }> = [];
  let kpiProgressSummary = "";

  if (kpis.length > 0) {
    for (const kpi of kpis) {
      const progress = calculateSimpleProgress(kpi);
      kpiProgressions.push({ isOnTrack: progress.isOnTrack });
    }

    const onTrack = kpiProgressions.filter((p: any) => p.isOnTrack).length;
    kpiProgressSummary = `${onTrack}/${kpis.length} KPIs on track`;
  } else {
    kpiProgressSummary = "No KPIs defined";
  }

  // Count action statuses
  const actions = await db.action.findMany({
    where: { engagementId, workspaceId },
    select: { status: true },
  });

  const actionStatus = {
    completed: actions.filter((a: any) => a.status === "done").length,
    open: actions.filter((a: any) => a.status === "open").length,
    inProgress: actions.filter((a: any) => a.status === "in_progress").length,
    blocked: actions.filter((a: any) => a.status === "blocked").length,
  };

  const completedActionsCount = actionStatus.completed;
  const blockedActionsCount = actionStatus.blocked;

  // Count findings (all considered unresolved since status is not tracked)
  const findings = await db.finding.findMany({
    where: { engagementId, workspaceId },
    select: { id: true },
  });

  const unresolvedFindingsCount = findings.length;

  // Determine overall status
  let cycleStatus: "improving" | "stagnant" | "worsening";
  let rationale: string;

  // Assess current state (simplified without previous cycle history)
  if (kpiProgressions.length > 0) {
    const onTrackPercent =
      (kpiProgressions.filter((p: any) => p.isOnTrack).length /
        kpiProgressions.length) *
      100;
    if (onTrackPercent >= 75) {
      cycleStatus = "improving";
      rationale = "Strong KPI progress and good action completion rate";
    } else if (onTrackPercent >= 50) {
      cycleStatus = "stagnant";
      rationale = "Moderate KPI progress with mixed results";
    } else {
      cycleStatus = "worsening";
      rationale = "Poor KPI progress and declining metrics";
    }
  } else {
    cycleStatus = "stagnant";
    rationale = "No KPIs defined yet for assessment";
  }

  // Placeholder for comparison to previous cycle (when model exists)
  // Note: ReviewCycle model does not exist in schema - cycle history not persisted

  // Note: ReviewCycle model does not exist in schema - returning cycle data in memory
  const cycle = {
    id: `cycle-${engagementId}-${Date.now()}`,
    engagementId,
    status: cycleStatus,
    kpiProgressSummary,
    unresolvedFindingsCount,
    completedActionsCount,
    blockedActionsCount,
    rationale,
    createdAt: new Date(),
  };

  // Emit audit event
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.REVIEW_CYCLE_STARTED,
    actorId,
    entityType: "ReviewCycle",
    entityId: cycle.id,
    payload: {
      engagementId,
      status: cycleStatus,
      kpiProgressSummary,
      unresolvedFindingsCount,
      completedActionsCount,
      blockedActionsCount,
    },
  });

  // Trigger re-evaluation based on cycle status
  if (cycleStatus === "worsening") {
    await triggerReEvaluation({
      changeType: "risk_escalation",
      entityType: "ReviewCycle",
      entityId: cycle.id,
      engagementId,
      severity: "high",
      description: `Review cycle status worsening: ${rationale}`,
      triggeredBy: actorId,
    });
  } else if (cycleStatus === "improving") {
    await emitAuditEvent({
      eventName: AUDIT_EVENTS.REVIEW_CYCLE_COMPLETED,
      actorId,
      entityType: "ReviewCycle",
      entityId: cycle.id,
      payload: {
        engagementId,
        status: cycleStatus,
        rationale,
      },
    });
  }

  return cycle as ReviewCycle;
}

export async function listReviewCyclesForEngagement(
  engagementId: string,
  workspaceId: string,
  visibility?: "internal" | "all"
): Promise<Omit<ReviewCycle, 'visibilityStatus'>[]> {
  enforceWorkspaceId(workspaceId, "listReviewCyclesForEngagement", "review_cycle");

  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId, workspaceId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  // Note: ReviewCycle model does not exist in schema - returning empty list
  return [];
}

export async function getLatestReviewCycle(
  engagementId: string,
  visibility?: "internal" | "all"
): Promise<Omit<ReviewCycle, 'visibilityStatus'> | null> {
  // Note: ReviewCycle model does not exist in schema - returning null
  return null;
}

export async function getReviewCycleStats(
  engagementId: string,
  workspaceId: string
): Promise<ReviewCycleStats> {
  enforceWorkspaceId(workspaceId, "getReviewCycleStats", "review_cycle");

  // Get KPI stats
  const kpis = await db.kPI.findMany({
    where: { engagementId, workspaceId },
    select: {
      currentValue: true,
      target: true,
      direction: true,
    },
  });

  let onTrackKPIs = 0;
  for (const kpi of kpis) {
    const progress = calculateSimpleProgress(kpi);
    if (progress.isOnTrack) onTrackKPIs++;
  }

  // Get action stats
  const actions = await db.action.findMany({
    where: { engagementId, workspaceId },
    select: { status: true },
  });

  const actionStatus = {
    completed: actions.filter((a: any) => a.status === "done").length,
    open: actions.filter((a: any) => a.status === "open").length,
    inProgress: actions.filter((a: any) => a.status === "in_progress").length,
    blocked: actions.filter((a: any) => a.status === "blocked").length,
  };

  // Get finding stats (status not tracked in schema, so count all as unresolved)
  const findings = await db.finding.findMany({
    where: { engagementId, workspaceId },
    select: { id: true },
  });

  const findingStatus = {
    unresolved: findings.length,
    validated: 0,
    disputed: 0,
  };

  return {
    totalKPIs: kpis.length,
    onTrackKPIs,
    actionStatus,
    findingStatus,
  };
}

function calculateSimpleProgress(kpi: {
  currentValue: number | null;
  target: number | null;
  direction: string;
}): { isOnTrack: boolean } {
  // If no current value, consider it off track
  if (kpi.currentValue === null) {
    return { isOnTrack: false };
  }
  // If no target, consider it on track
  if (kpi.target === null) {
    return { isOnTrack: true };
  }
  // Compare current against target based on direction
  if (kpi.direction === "up") {
    return {
      isOnTrack: kpi.currentValue >= kpi.target,
    };
  } else {
    return {
      isOnTrack: kpi.currentValue <= kpi.target,
    };
  }
}
