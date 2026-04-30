import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { getSession } from "@/services/auth";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getObservabilitySummary } from "@/services/observability/statistics";
import { createEventLogger } from "@/lib/observability/log";
import { UnauthorizedError } from "@/infra/errors";

export async function GET(request: NextRequest) {
  let workspace;
  let userId: string | null = null;
  let logger: ReturnType<typeof createEventLogger> | null = null;

  try {
    // Get workspace context early (fail closed if missing)
    workspace = await requireWorkspaceContext();

    // Initialize logger once workspace is available
    logger = createEventLogger("api_observability_summary", workspace.workspaceId);

    // Get session for user identity
    const session = await getSession();
    userId = session?.user.id ?? null;

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
      if (logger) logger.error(`Audit logging failed: ${auditError instanceof Error ? auditError.message : String(auditError)}`);
    });

    if (logger) {
      logger.success({
        last24h_counts: summary.period.last24h.lifecycleCounts.length,
        last7d_counts: summary.period.last7d.lifecycleCounts.length,
      });
    }

    return NextResponse.json(summary);
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      if (logger) {
        logger.error("Unauthorized access");
      }
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }
    const message = error instanceof Error ? error.message : "Unknown error";
    if (logger) {
      logger.error(message);
    }
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
