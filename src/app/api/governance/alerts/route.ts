import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";
import { getObservabilitySummary } from "@/services/observability/statistics";
import { evaluateGovernanceAlerts } from "@/services/governance/alerts";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import type { NextRequest } from "next/server";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = ctx.verifiedWorkspaceId;
  const userId = ctx.verifiedActorId;

  // Get period parameter from query
  const nextRequest = ctx.request as NextRequest;
  const periodParam = nextRequest.nextUrl.searchParams.get("period") as "last24h" | "last7d" | null;
  const period = (periodParam === "last7d" ? "last7d" : "last24h") as "last24h" | "last7d";

  // Get governance metrics and observability summary
  const metrics = await calculateGovernanceMetrics({
    workspaceId,
    days: period === "last7d" ? 7 : 1,
  });

  const summary = await getObservabilitySummary(workspaceId);

  // Evaluate governance alerts against real metrics and summary
  const alerts = evaluateGovernanceAlerts(
    workspaceId,
    metrics,
    summary,
    undefined,
    period
  );

  // Log audit event for alerts access
  await emitAuditEvent({
    eventName: AUDIT_EVENTS.GOVERNANCE_ALERTS_ACCESSED,
    entityType: "GovernanceAlerts",
    entityId: workspaceId,
    actorId: userId,
    actorType: "user",
    workspaceId,
    payload: {
      action: "view_governance_alerts",
      period,
      alertCount: alerts.period.alertCount,
      criticalCount: alerts.period.criticalCount,
      warningCount: alerts.period.warningCount,
    },
  }).catch((auditError) => {
    const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: "load" });
    console.error(`Audit logging failed: ${governed.operatorMessage}`);
  });

  return alerts;
}, { requireWorkspace: true });
