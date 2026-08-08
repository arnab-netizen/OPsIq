import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { CAPABILITIES } from "@/domain/constants/capabilities";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;

    const daysParam = ctx.request?.nextUrl.searchParams.get("days");
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam), 1), 90) : 30;

    const metrics = await calculateGovernanceMetrics({
      workspaceId,
      days,
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.GOVERNANCE_METRICS_ACCESSED,
      entityType: "GovernanceMetrics",
      entityId: workspaceId,
      actorId,
      actorType: "user",
      workspaceId,
      payload: {
        action: "view_governance_metrics",
        days,
        summary: {
          totalDecisions: metrics.summary.totalDecisions,
          approvedCount: metrics.summary.approvedCount,
          blockedCount: metrics.summary.blockedCount,
        },
      },
    }).catch((auditError) => {
      const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: 'load' });
      console.error(`Audit logging failed: ${governed.operatorMessage}`);
    });

    return metrics;
  }, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.SYSTEM_VIEW_AUDIT] }
);
