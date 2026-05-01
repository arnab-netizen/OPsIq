import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { failDecision } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";
import { z } from "zod";

const FailDecisionSchema = z.object({
  reason: z.string().min(1, "Failure reason is required"),
});

type FailDecisionInput = z.infer<typeof FailDecisionSchema>;

/**
 * POST /api/decisions/[decisionId]/fail
 *
 * Mark decision as failed (EXECUTED → FAILED)
 * Enforces: decision must be in EXECUTED state
 * Requires: reason for failure (mandatory)
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

    // Check permission to mark decisions as failed
    if (!hasPermission(membership.role, "fail_decision")) {
      return NextResponse.json(
        { error: "Insufficient permissions to mark decision as failed" },
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

    // Parse and validate input
    const body = await request.json();
    const input = FailDecisionSchema.parse(body);

    try {
      // Mark as failed via lifecycle service
      const updated = await failDecision(
        decisionId,
        workspaceId,
        input.reason,
        userId
      );

      logger.info("Decision marked as failed via API", {
        decisionId,
        workspaceId,
        userId,
        reason: input.reason,
      });

      return NextResponse.json(
        {
          decisionId,
          status: updated.status,
          message: "Decision marked as failed",
          reason: input.reason,
        },
        { status: 200 }
      );
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        return NextResponse.json(
          { error: lifecycleError.message },
          { status: 409 } // Conflict - not in EXECUTED state
        );
      }
      throw lifecycleError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        {
          error: "Invalid input",
          details: error.issues.map((e) => ({
            field: e.path.join("."),
            message: e.message,
          })),
        },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    logger.error("Decision fail API error", {
      decisionId: (await params).decisionId,
      error: message,
    });

    return NextResponse.json(
      { error: "Failed to mark decision as failed", details: message },
      { status: 500 }
    );
  }
}
