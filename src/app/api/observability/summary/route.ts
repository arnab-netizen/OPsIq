import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getObservabilitySummary } from "@/services/observability/statistics";
import { createEventLogger } from "@/lib/observability/log";
import { classifyOperatorError } from "@/lib/operator-error-governance";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  const workspaceId = ctx.verifiedWorkspaceId;

  // Initialize logger with verified workspace ID
  const logger = createEventLogger("api_observability_summary", workspaceId);

  const userId = ctx.verifiedActorId;

  // Get observability summary from persisted real data only
  const summary = await getObservabilitySummary(workspaceId);

  // Log audit event for observability access
  await logAuditEvent({
    eventName: "OBSERVABILITY_SUMMARY_ACCESSED",
    entityType: "ObservabilitySummary",
    entityId: workspaceId,
    actorId: userId,
    role: null,
    before: null,
    after: null,
    metadata: {
      action: "view_observability_summary",
      last24h_events: summary.period.last24h.lifecycleCounts.reduce((sum, c) => sum + c.count, 0),
      last7d_events: summary.period.last7d.lifecycleCounts.reduce((sum, c) => sum + c.count, 0),
    },
    workspaceId,
  }).catch((auditError) => {
    // Log but don't fail on audit error - observability only
    const governed = classifyOperatorError(auditError instanceof Error ? auditError : new Error(String(auditError)), { context: 'load' });
    logger.error(`Audit logging failed: ${governed.operatorMessage}`);
  });

  logger.success({
    last24h_counts: summary.period.last24h.lifecycleCounts.length,
    last7d_counts: summary.period.last7d.lifecycleCounts.length,
  });

  return summary;
}, { requireWorkspace: true });
