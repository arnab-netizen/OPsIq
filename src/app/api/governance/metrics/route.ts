import { NextRequest, NextResponse } from "next/server";
import { calculateGovernanceMetrics } from "@/services/governance/metrics";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";

export async function GET(request: NextRequest) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const userId = session.user.id;
    const workspaceIdParam = request.nextUrl.searchParams.get("workspaceId");

    if (!workspaceIdParam) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Enforce workspace scoping
    const membership = await enforceWorkspaceScoping(request, workspaceIdParam);
    if (!membership) {
      return NextResponse.json(
        { error: "Unauthorized or invalid workspace" },
        { status: 403 }
      );
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
      workspaceId,
    }).catch((auditError) => {
      // Log but don't fail on audit error - observability only
      console.error(`Audit logging failed: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
    });

    return NextResponse.json(metrics);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Failed to fetch governance metrics: ${message}`);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
