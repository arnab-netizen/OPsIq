import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { markFailure } from "@/services/execution/execution-service";
import { db } from "@/lib/db";
import { z } from "zod";

const MarkFailureSchema = z.object({
  reason: z.string().min(10, "Reason must be at least 10 characters"),
});

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

    if (decision.executionStatus !== "running") {
      return NextResponse.json(
        {
          error: `Execution not running (current status: ${decision.executionStatus})`,
          code: "INVALID_EXECUTION_STATE",
        },
        { status: 400 }
      );
    }

    const body = await request.json();
    const input = MarkFailureSchema.parse(body);

    const updated = await markFailure(decisionId, workspaceId, userId, input.reason);

    return NextResponse.json(
      {
        success: true,
        decision: {
          id: updated.id,
          status: updated.status,
          executionStatus: updated.executionStatus,
          blockReason: updated.blockReason,
          executedAt: updated.executedAt,
          completedAt: updated.completedAt,
        },
        message: "Decision execution marked failed",
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Invalid input", details: error.flatten() },
        { status: 400 }
      );
    }
    console.error("Mark failure error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to mark decision failed",
      },
      { status: 500 }
    );
  }
}
