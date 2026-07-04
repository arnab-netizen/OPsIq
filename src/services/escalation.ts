import { db } from "@/lib/db";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
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
  /**
   * Honest delivery state (M4). These escalations are DETECTED and written to the audit log only — there is no
   * notification/email/push channel, so the alert is never "delivered" to a human. `"log_only"` says so explicitly
   * instead of letting a returned alert imply it was dispatched.
   */
  delivery: "log_only";
}

/** The escalation detectors persist nothing and dispatch nothing; they detect + audit-log. */
const ESCALATION_DELIVERY: "log_only" = "log_only";

export async function detectHighPriorityOverdueActions(
  engagementId: string,
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<EscalationAlert | null> {
  enforceWorkspaceId(workspaceId, "detectHighPriorityOverdueActions", "escalation");

  const now = new Date();

  // The Action model has no `priority`, `dueDate`, or `workspaceId` column (see prisma/schema.prisma): the field
  // is `dueAt`, workspace scope goes through the `engagement` relation, and "priority" lives on the linked
  // Recommendation. So "critical overdue action" = an overdue, still-open action whose Recommendation is critical.
  // Step 1: overdue, still-open actions in this workspace's engagement that carry a recommendation.
  const overdueOpenActions: Array<{ id: string; title: string; recommendationId: string | null }> =
    await db.action.findMany({
      where: {
        engagementId,
        engagement: { workspaceId },
        dueAt: { lt: now },
        status: { notIn: ["completed", "verified", "cancelled"] },
        recommendationId: { not: null },
      },
      select: { id: true, title: true, recommendationId: true },
    });

  // Step 2: of those, keep only the ones whose Recommendation has critical priority (no Action→Recommendation
  // relation object exists, so this is a two-step lookup by id — no invented column, no fabricated priority).
  const recommendationIds = Array.from(
    new Set(
      overdueOpenActions
        .map((a) => a.recommendationId)
        .filter((id): id is string => id !== null)
    )
  );
  const criticalRecommendations: Array<{ id: string }> = recommendationIds.length
    ? await db.recommendation.findMany({
        where: { id: { in: recommendationIds }, workspaceId, priority: "critical" },
        select: { id: true },
      })
    : [];
  const criticalRecommendationIds = new Set(criticalRecommendations.map((r) => r.id));

  const criticalOverdueActions = overdueOpenActions.filter(
    (a) => a.recommendationId !== null && criticalRecommendationIds.has(a.recommendationId)
  );

  if (criticalOverdueActions.length > 0) {
    const alert: EscalationAlert = {
      type: "high_priority_overdue",
      engagementId,
      severity: "critical",
      description: `${criticalOverdueActions.length} critical action(s) overdue`,
      relatedEntityIds: criticalOverdueActions.map((a) => a.id),
      delivery: ESCALATION_DELIVERY,
    };

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ESCALATION_ALERT_HIGH_PRIORITY_OVERDUE,
      actorId: authContext.session?.user?.id,
      entityType: "escalation",
      entityId: engagementId,
      workspaceId,
      payload: {
        engagementId,
        actionCount: criticalOverdueActions.length,
        actionIds: alert.relatedEntityIds,
        actionTitles: criticalOverdueActions.map((a) => a.title),
        delivery: ESCALATION_DELIVERY,
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
  authContext: CanonicalAuthContext,
  workspaceId: string
): Promise<EscalationAlert | null> {
  const kpis = await db.kPI.findMany({
    // KPI has no workspaceId column — scope via the engagement relation.
    where: { engagementId, engagement: { workspaceId } },
    orderBy: { createdAt: "desc" },
    include: {
      kpiSnapshots: {
        orderBy: { recordedAt: "desc" },
        take: 3,
      },
    },
  });

  const deterioratedKPIs: string[] = [];

  for (const kpi of kpis) {
    if (kpi.kpiSnapshots.length < 2) continue;

    let consecutiveDeteriorations = 0;

    for (let i = 0; i < kpi.kpiSnapshots.length - 1; i++) {
      const current = kpi.kpiSnapshots[i].value;
      const previous = kpi.kpiSnapshots[i + 1].value;

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
      delivery: ESCALATION_DELIVERY,
    };

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.ESCALATION_ALERT_KPI_DETERIORATION_PATTERN,
      actorId: authContext.session?.user?.id,
      entityType: "escalation",
      entityId: engagementId,
      workspaceId,
      payload: {
        engagementId,
        kpiCount: deterioratedKPIs.length,
        kpiIds: deterioratedKPIs,
        delivery: ESCALATION_DELIVERY,
      },
      visibility: "internal",
    });

    logger.warn("Escalation alert: KPI deterioration pattern detected", {
      engagementId,
      kpiCount: deterioratedKPIs.length,
      kpiIds: deterioratedKPIs,
    });

    // REEVAL-01: a sustained KPI-deterioration pattern must route into governed
    // re-evaluation, not just emit an alert. Correlation-idempotent on the KPI set.
    const { triggerReEvaluation } = await import("@/services/re-evaluation");
    await triggerReEvaluation({
      changeType: "kpi_deterioration",
      entityType: "engagement",
      entityId: engagementId,
      engagementId,
      workspaceId,
      severity: "high",
      description: `${deterioratedKPIs.length} KPI(s) showing deterioration pattern`,
      triggeredBy: authContext.session?.user?.id ?? "system",
      correlationId: `kpi-deterioration:${engagementId}:${[...deterioratedKPIs].sort().join(",")}`,
    });

    return alert;
  }

  return null;
}

export async function checkEngagementEscalations(
  engagementId: string,
  authContext: CanonicalAuthContext,
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
    authContext,
    wsId
  );
  if (highPriorityAlert) {
    alerts.push(highPriorityAlert);
  }

  const kpiPatternAlert = await detectKPIDeteriorationPattern(
    engagementId,
    authContext,
    wsId
  );
  if (kpiPatternAlert) {
    alerts.push(kpiPatternAlert);
  }

  return alerts;
}
