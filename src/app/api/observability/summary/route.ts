import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import type { CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import type { NextRequest } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getObservabilitySummary } from "@/services/observability/statistics";
import { createEventLogger } from "@/lib/observability/log";

export const GET = withCanonicalEnforcement(async (ctx: CanonicalAuthContext) => {
  // Get workspace context early (fail closed if missing)
  const workspace = await requireWorkspaceContext();

  // Initialize logger once workspace is available
  const logger = createEventLogger("api_observability_summary", workspace.workspaceId);

  const userId = ctx.verifiedActorId;

  // Get observability summary from persisted real data only
  const summary = await getObservabilitySummary(workspace.workspaceId);

  // Log audit event for observability access
  await logAuditEvent({
    eventName: "OBSERVABILITY_SUMMARY_ACCESSED",
    entityType: "ObservabilitySummary",
    entityId: workspace.workspaceId,
    actorId: userId,
    role: null,
    before: null,
    after: null,
    metadata: {
      action: "view_observability_summary",
      last24h_events: summary.period.last24h.lifecycleCounts.reduce((sum, c) => sum + c.count, 0),
      last7d_events: summary.period.last7d.lifecycleCounts.reduce((sum, c) => sum + c.count, 0),
    },
    workspaceId: workspace.workspaceId,
  }).catch((auditError) => {
    // Log but don't fail on audit error - observability only
    logger.error(`Audit logging failed: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
  });

  logger.success({
    last24h_counts: summary.period.last24h.lifecycleCounts.length,
    last7d_counts: summary.period.last7d.lifecycleCounts.length,
  });

  return summary;
}, { requireWorkspace: true });
