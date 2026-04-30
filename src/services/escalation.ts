import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { logger } from "@/infra/logger";
import { enforceWorkspaceId } from "@/lib/workspace-validation";

export interface EscalationAlert {
  type: "high_priority_overdue" | "kpi_deterioration_pattern";
  engagementId: string;
  severity: "high" | "critical";
  description: string;
  relatedEntityIds: string[];
}

export async function detectHighPriorityOverdueActions(
  engagementId: string,
  actorId: string,
  workspaceId: string
): Promise<EscalationAlert | null> {
  enforceWorkspaceId(workspaceId, "detectHighPriorityOverdueActions", "escalation");

  const now = new Date();

  const criticalOverdueActions = await db.action.findMany({
    where: {
      engagementId,
      workspaceId,
      priority: "critical",
      dueDate: { lt: now },
      status: { notIn: ["completed", "verified", "cancelled"] },
    },
    select: { id: true, title: true },
  });

  if (criticalOverdueActions.length > 0) {
    const alert: EscalationAlert = {
      type: "high_priority_overdue",
      engagementId,
      severity: "critical",
      description: `${criticalOverdueActions.length} critical action(s) overdue`,
      relatedEntityIds: criticalOverdueActions.map((a: any) => a.id),
    };

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE,
      actorId,
      entityType: "escalation",
      entityId: engagementId,
      payload: {
        engagementId,
        actionCount: criticalOverdueActions.length,
        actionIds: alert.relatedEntityIds,
        actionTitles: criticalOverdueActions.map((a: any) => a.title),
      },
      visibility: "internal",
    });

    logger.warn("Escalation alert: critical actions overdue", {
      engagementId,
      actionCount: criticalOverdueActions.length,
      actionIds: alert.relatedEntityIds,
    });

    return alert;
  }

  return null;
}

export async function detectKPIDeteriorationPattern(
  engagementId: string,
  actorId: string
): Promise<EscalationAlert | null> {
  const kpis = await db.kPI.findMany({
    where: { engagementId },
    include: {
      snapshots: {
        orderBy: { recordedAt: "desc" },
        take: 3,
      },
    },
  });

  const deterioratedKPIs: string[] = [];

  for (const kpi of kpis) {
    if (kpi.snapshots.length < 2) continue;

    let consecutiveDeteriorations = 0;

    for (let i = 0; i < kpi.snapshots.length - 1; i++) {
      const current = kpi.snapshots[i].value;
      const previous = kpi.snapshots[i + 1].value;

      // Default to "up" is better (e.g., revenue, margin, growth)
      const isWorsening = current < previous;

      if (isWorsening) {
        consecutiveDeteriorations++;
      } else {
        break;
      }
    }

    if (consecutiveDeteriorations >= 2) {
      deterioratedKPIs.push(kpi.id);
    }
  }

  if (deterioratedKPIs.length > 0) {
    const alert: EscalationAlert = {
      type: "kpi_deterioration_pattern",
      engagementId,
      severity: "high",
      description: `${deterioratedKPIs.length} KPI(s) showing deterioration pattern`,
      relatedEntityIds: deterioratedKPIs,
    };

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ESCALATION_ALERT_KPI_DETERIORATION_PATTERN,
      actorId,
      entityType: "escalation",
      entityId: engagementId,
      payload: {
        engagementId,
        kpiCount: deterioratedKPIs.length,
        kpiIds: deterioratedKPIs,
      },
      visibility: "internal",
    });

    logger.warn("Escalation alert: KPI deterioration pattern detected", {
      engagementId,
      kpiCount: deterioratedKPIs.length,
      kpiIds: deterioratedKPIs,
    });

    return alert;
  }

  return null;
}

export async function checkEngagementEscalations(
  engagementId: string,
  actorId: string,
  workspaceId?: string
): Promise<EscalationAlert[]> {
  // Fetch workspaceId from engagement if not provided
  const wsId = workspaceId || (await (async () => {
    const engagement = await db.engagement.findUnique({
      where: { id: engagementId },
      select: { workspaceId: true },
    });
    if (!engagement) {
      throw new Error(`Engagement ${engagementId} not found`);
    }
    return engagement.workspaceId;
  })());

  const alerts: EscalationAlert[] = [];

  const highPriorityAlert = await detectHighPriorityOverdueActions(
    engagementId,
    actorId,
    wsId
  );
  if (highPriorityAlert) {
    alerts.push(highPriorityAlert);
  }

  const kpiPatternAlert = await detectKPIDeteriorationPattern(
    engagementId,
    actorId
  );
  if (kpiPatternAlert) {
    alerts.push(kpiPatternAlert);
  }

  return alerts;
}
