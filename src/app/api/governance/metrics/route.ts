import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";

export async function GET(request: NextRequest) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Get authenticated user for audit
    const session = await getSession();
    const userId = session?.user.id ?? null;

    // Get days parameter from query
    const daysParam = request.nextUrl.searchParams.get("days");
    const days = daysParam ? Math.min(Math.max(parseInt(daysParam), 1), 90) : 30;

    // Calculate governance metrics from persisted real data only
    const metrics = await calculateGovernanceMetrics({
      workspaceId: workspace.workspaceId,
      days,
    });

    // Log audit event for metrics access
    await logAuditEvent({
      eventName: "GOVERNANCE_METRICS_ACCESSED",
      entityType: "GovernanceMetrics",
      entityId: workspace.workspaceId,
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
    }).catch((auditError) => {
      // Log but don't fail on audit error - observability only
      console.error(`Audit logging failed: ${auditError}`);
    });

    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    if (message.includes("Unauthorized")) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
