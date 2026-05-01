import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { executeDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";

/**
 * POST /api/decisions/[decisionId]/execute
 *
 * Execute an approved decision (APPROVED → EXECUTED)
 * Enforces: decision must be in APPROVED state
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

    // Check permission to execute
    if (!hasPermission(membership.role, "execute")) {
      return NextResponse.json(
        { error: "Insufficient permissions to execute decision" },
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
      // Execute via lifecycle service
      const updated = await executeDecision(decisionId, workspaceId, userId);

      logger.info("Decision executed via API", {
        decisionId,
        workspaceId,
        userId,
      });

      return NextResponse.json(
        {
          decisionId,
          status: updated.status,
          message: "Decision executed successfully",
        },
        { status: 200 }
      );
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        return NextResponse.json(
          { error: lifecycleError.message },
          { status: 409 } // Conflict - not in APPROVED state
        );
      }
      throw lifecycleError;
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Decision execute API error", {
      decisionId: (await params).decisionId,
      error: message,
    });

    return NextResponse.json(
      { error: "Execution failed", details: message },
      { status: 500 }
    );
  }
}
