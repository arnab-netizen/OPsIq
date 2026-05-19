import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";
import { getObservabilitySummary } from "@/services/observability/statistics";
import { evaluateGovernanceAlerts } from "@/services/governance/alerts";
import { logAuditEvent } from "@/services/audit/audit-log";
import type { NextRequest } from "next/server";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  // Get workspace context (fail closed if missing)
  const workspace = await requireWorkspaceContext();

  const userId = ctx.verifiedActorId;

  // Get period parameter from query
  const nextRequest = ctx.request as NextRequest;
  const periodParam = nextRequest.nextUrl.searchParams.get("period") as "last24h" | "last7d" | null;
  const period = (periodParam === "last7d" ? "last7d" : "last24h") as "last24h" | "last7d";

  // Get governance metrics and observability summary
  const metrics = await calculateGovernanceMetrics({
    workspaceId: workspace.workspaceId,
    days: period === "last7d" ? 7 : 1,
  });

  const summary = await getObservabilitySummary(workspace.workspaceId);

  // Evaluate governance alerts against real metrics and summary
  const alerts = evaluateGovernanceAlerts(
    workspace.workspaceId,
    metrics,
    summary,
    undefined,
    period
  );

  // Log audit event for alerts access
  await logAuditEvent({
    eventName: "GOVERNANCE_ALERTS_ACCESSED",
    entityType: "GovernanceAlerts",
    entityId: workspace.workspaceId,
    actorId: userId,
    role: null,
    before: null,
    after: null,
    metadata: {
      action: "view_governance_alerts",
      period,
      alertCount: alerts.period.alertCount,
      criticalCount: alerts.period.criticalCount,
      warningCount: alerts.period.warningCount,
    },
  }).catch((auditError) => {
    // Log but don't fail on audit error - observability only
    console.error(`Audit logging failed: ${auditError}`);
  });

  return alerts;
}, { requireCapabilities: [CAPABILITIES.RISK_VIEW], requireWorkspace: true });
