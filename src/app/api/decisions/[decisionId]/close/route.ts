import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { closeDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";

/**
 * POST /api/decisions/[decisionId]/close
 *
 * Close a decision (OUTCOME_RECORDED → CLOSED)
 * Enforces: decision must be in OUTCOME_RECORDED state
 * Returns: 409 Conflict if transition not allowed
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  try {
    const session = await getSession();
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
    }

    const userId = session.user.id;
    const { decisionId } = await params;

    // Get workspace ID from query
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      return NextResponse.json(
        { error: "Workspace ID required" },
        { status: 400 }
      );
    }

    // Enforce workspace scoping
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      return NextResponse.json(
        { error: "Unauthorized or invalid workspace" },
        { status: 403 }
      );
    }

    // Check permission to close decisions
    if (!hasPermission(membership.role, "close_decision")) {
      return NextResponse.json(
        { error: "Insufficient permissions to close decision" },
        { status: 403 }
      );
    }

    // Fetch decision to verify it exists
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      return NextResponse.json(
        { error: "Decision not found in this workspace" },
        { status: 404 }
      );
    }

    try {
      // Close via lifecycle service
      const updated = await closeDecision(decisionId, workspaceId, userId);

      logger.info("Decision closed via API", {
        decisionId,
        workspaceId,
        userId,
      });

      return NextResponse.json(
        {
          decisionId,
          status: updated.status,
          message: "Decision closed successfully",
        },
        { status: 200 }
      );
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        return NextResponse.json(
          { error: lifecycleError.message },
          { status: 409 } // Conflict - not in OUTCOME_RECORDED state
        );
      }
      throw lifecycleError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Decision close API error", {
      decisionId: (await params).decisionId,
      error: message,
    });

    return NextResponse.json(
      { error: "Close failed", details: message },
      { status: 500 }
    );
  }
}
