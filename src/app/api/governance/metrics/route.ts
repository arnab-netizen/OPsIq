import { classifyOperatorError } from "@/lib/operator-error-governance";

function getSafeErrorMessage(error: unknown): string {
  const classified = classifyOperatorError(error instanceof Error ? error : new Error(String(error)), { context: "load" });
  return classified.operatorMessage;
}

import { NextRequest } from "next/server";
import { withAuth, createServiceCapabilityContext } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";

export const GET = withEnforcementFull(async (request: NextRequest) => {
  const { session } = await withAuth();
  const auditContext = createServiceCapabilityContext({ capability: "mutation" });
  if (!session?.user?.id) {
    throw new UnauthorizedError("Unauthorized");
  }

  const userId = session.user.id;
  const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");

  if (!workspaceIdParam) {
    throw new Error("Workspace ID required");
  }

  // Enforce workspace scoping
  const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
  if (!membership) {
    throw new UnauthorizedError("Unauthorized or invalid workspace");
  }

  const workspaceId = workspaceIdParam;

  // Get days parameter from query
  const daysParam = request.nextUrl.searchParams.get("days");
  const days = daysParam ? Math.min(Math.max(parseInt(daysParam), 1), 90) : 30;

  // Calculate governance metrics from persisted real data only
  const metrics = await calculateGovernanceMetrics({
    workspaceId,
    days,
  });

  // Log audit event for metrics access
  await logAuditEvent({
    eventName: "GOVERNANCE_METRICS_ACCESSED",
    entityType: "GovernanceMetrics",
    entityId: workspaceId,
    actorId: userId,
    role: null,
    before: null,
    after: null,
    metadata: {
      action: "view_governance_metrics",
      days,
      summary: {
        totalDecisions: metrics.summary.totalDecisions,
        approvedCount: metrics.summary.approvedCount,
        blockedCount: metrics.summary.blockedCount,
      },
    },
    context: auditContext,
    workspaceId,
  }).catch((auditError) => {
    // Log but don't fail on audit error - observability only
    console.error(`Audit logging failed: ${getSafeErrorMessage(auditError)}`);
  });

  return metrics;
});
