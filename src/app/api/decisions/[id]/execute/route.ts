import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { executeDecision } from "@/services/execution/execution-service";
import { db } from "@/lib/db";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const userId = session.user.id;
    const { id: decisionId } = await params;

    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      return NextResponse.json(
        { error: "Unauthorized or invalid workspace" },
        { status: 403 }
      );
    }

    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      return NextResponse.json(
        { error: "Decision not found" },
        { status: 404 }
      );
    }

    if (decision.status !== "approved") {
      return NextResponse.json(
        {
          error: `Decision must be approved before execution (current status: ${decision.status})`,
          code: "EXECUTION_REQUIRES_APPROVED",
        },
        { status: 400 }
      );
    }

    if (decision.executionStatus === "running" || decision.executionStatus === "success" || decision.executionStatus === "failed") {
      return NextResponse.json(
        {
          error: `Execution already ${decision.executionStatus} for this decision`,
          code: "DUPLICATE_EXECUTION",
        },
        { status: 409 }
      );
    }

    const updated = await executeDecision(decisionId, workspaceId, userId);

    return NextResponse.json(
      {
        success: true,
        decision: {
          id: updated.id,
          status: updated.status,
          executionStatus: updated.executionStatus,
          startedAt: updated.startedAt,
        },
        message: "Decision execution started successfully",
      },
      { status: 200 }
    );
  } catch (error) {
    console.error("Execute decision error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to execute decision",
      },
      { status: 500 }
    );
  }
}
