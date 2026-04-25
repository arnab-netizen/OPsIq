import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { NotFoundError, ValidationError } from "@/infra/errors";
import { triggerReEvaluation } from "@/services/re-evaluation";
import { getKPIProgress } from "@/services/kpi";

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
  actorId: string
): Promise<ReviewCycle> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  // Get all KPIs and evaluate progress
  const kpis = await db.kPI.findMany({
    where: { engagementId },
    select: {
      id: true,
      currentValue: true,
      baselineValue: true,
      targetValue: true,
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

    const onTrack = kpiProgressions.filter((p) => p.isOnTrack).length;
    kpiProgressSummary = `${onTrack}/${kpis.length} KPIs on track`;
  } else {
    kpiProgressSummary = "No KPIs defined";
  }

  // Count action statuses
  const actions = await db.action.findMany({
    where: { engagementId },
    select: { status: true },
  });

  const actionStatus = {
    completed: actions.filter((a) => a.status === "done").length,
    open: actions.filter((a) => a.status === "open").length,
    inProgress: actions.filter((a) => a.status === "in_progress").length,
    blocked: actions.filter((a) => a.status === "blocked").length,
  };

  const completedActionsCount = actionStatus.completed;
  const blockedActionsCount = actionStatus.blocked;

  // Count finding statuses
  const findings = await db.finding.findMany({
    where: { engagementId },
    select: { status: true },
  });

  const unresolvedFindings = findings.filter(
    (f) => !["closed", "superseded"].includes(f.status)
  );
  const unresolvedFindingsCount = unresolvedFindings.length;

  // Determine overall status
  let cycleStatus: "improving" | "stagnant" | "worsening";
  let rationale: string;

  // Get previous cycle for comparison
  const previousCycle = await db.reviewCycle.findFirst({
    where: { engagementId },
    orderBy: { createdAt: "desc" },
    select: {
      kpiProgressSummary: true,
      unresolvedFindingsCount: true,
      completedActionsCount: true,
    },
  });

  if (!previousCycle) {
    // First cycle - assess current state
    if (kpiProgressions.length > 0) {
      const onTrackPercent =
        (kpiProgressions.filter((p) => p.isOnTrack).length /
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
  } else {
    // Compare to previous cycle
    const findingProgress =
      unresolvedFindingsCount < previousCycle.unresolvedFindingsCount;
    const actionProgress =
      completedActionsCount > previousCycle.completedActionsCount;
    const kpiProgress =
      (kpiProgressions.filter((p) => p.isOnTrack).length /
        Math.max(kpiProgressions.length, 1)) *
        100 >= 60;

    if (findingProgress && actionProgress && kpiProgress) {
      cycleStatus = "improving";
      rationale = "Findings declining, actions completing, KPIs improving";
    } else if (!findingProgress && !actionProgress && !kpiProgress) {
      cycleStatus = "worsening";
      rationale = "Findings increasing, actions stalling, KPIs declining";
    } else {
      cycleStatus = "stagnant";
      rationale = "Mixed progress across findings, actions, and KPIs";
    }
  }

  // Create review cycle
  const cycle = await db.reviewCycle.create({
    data: {
      engagementId,
      status: cycleStatus,
      kpiProgressSummary,
      unresolvedFindingsCount,
      completedActionsCount,
      blockedActionsCount,
      rationale,
      visibilityStatus: "internal",
      createdBy: actorId,
    },
    select: {
      id: true,
      engagementId: true,
      status: true,
      kpiProgressSummary: true,
      unresolvedFindingsCount: true,
      completedActionsCount: true,
      blockedActionsCount: true,
      rationale: true,
      createdAt: true,
    },
  });

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
  visibility?: "internal" | "all"
): Promise<Omit<ReviewCycle, 'visibilityStatus'>[]> {
  // Validate engagement exists
  const engagement = await db.engagement.findUnique({
    where: { id: engagementId },
    select: { id: true },
  });
  if (!engagement) throw new NotFoundError("Engagement", engagementId);

  const cycles = await db.reviewCycle.findMany({
    where: { engagementId },
    select: {
      id: true,
      engagementId: true,
      status: true,
      kpiProgressSummary: true,
      unresolvedFindingsCount: true,
      completedActionsCount: true,
      blockedActionsCount: true,
      rationale: true,
      createdAt: true,
      visibilityStatus: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (visibility === "internal") {
    return cycles
      .filter((c) => c.visibilityStatus === "internal")
      .map(({ visibilityStatus, ...c }) => c as any);
  }

  return cycles.map(({ visibilityStatus, ...c }) => c as any);
}

export async function getLatestReviewCycle(
  engagementId: string,
  visibility?: "internal" | "all"
): Promise<Omit<ReviewCycle, 'visibilityStatus'> | null> {
  const cycle = await db.reviewCycle.findFirst({
    where: { engagementId },
    select: {
      id: true,
      engagementId: true,
      status: true,
      kpiProgressSummary: true,
      unresolvedFindingsCount: true,
      completedActionsCount: true,
      blockedActionsCount: true,
      rationale: true,
      createdAt: true,
      visibilityStatus: true,
    },
    orderBy: { createdAt: "desc" },
  });

  if (!cycle) return null;

  // Check visibility
  if (visibility === "internal" && cycle.visibilityStatus === "client_visible") {
    return null;
  }

  const { visibilityStatus, ...rest } = cycle;
  return rest as any;
}

export async function getReviewCycleStats(
  engagementId: string
): Promise<ReviewCycleStats> {
  // Get KPI stats
  const kpis = await db.kPI.findMany({
    where: { engagementId },
    select: {
      currentValue: true,
      baselineValue: true,
      targetValue: true,
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
    where: { engagementId },
    select: { status: true },
  });

  const actionStatus = {
    completed: actions.filter((a) => a.status === "done").length,
    open: actions.filter((a) => a.status === "open").length,
    inProgress: actions.filter((a) => a.status === "in_progress").length,
    blocked: actions.filter((a) => a.status === "blocked").length,
  };

  // Get finding stats
  const findings = await db.finding.findMany({
    where: { engagementId },
    select: { status: true },
  });

  const findingStatus = {
    unresolved: findings.filter((f) => !["closed", "superseded"].includes(f.status))
      .length,
    validated: findings.filter((f) => f.status === "validated").length,
    disputed: findings.filter((f) => f.status === "disputed").length,
  };

  return {
    totalKPIs: kpis.length,
    onTrackKPIs,
    actionStatus,
    findingStatus,
  };
}

function calculateSimpleProgress(kpi: {
  currentValue: number;
  baselineValue: number;
  targetValue: number;
  direction: string;
}): { isOnTrack: boolean } {
  if (kpi.direction === "up") {
    return {
      isOnTrack: kpi.currentValue >= kpi.baselineValue,
    };
  } else {
    return {
      isOnTrack: kpi.currentValue <= kpi.baselineValue,
    };
  }
}
