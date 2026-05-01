import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import {
  enforceWorkspaceScoping,
  hasPermission,
  canActOnDecision,
} from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import {
  approveDecision,
  rejectDecision,
} from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError, NotFoundError } from "@/infra/errors";
import { z } from "zod";

const UpdateDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

type UpdateDecisionInput = z.infer<typeof UpdateDecisionSchema>;

export async function PATCH(
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

    // Fetch decision to check current state
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      return NextResponse.json(
        { error: "Decision not found in this workspace" },
        { status: 404 }
      );
    }

    // Parse input
    const body = await request.json();
    const input = UpdateDecisionSchema.parse(body);

    // Check permission based on action
    if (!hasPermission(membership.role, input.status === "approved" ? "approve" : "reject")) {
      return NextResponse.json(
        { error: `Insufficient permissions to ${input.status} decision` },
        { status: 403 }
      );
    }

    // Check if user can act on this decision
    if (!canActOnDecision(userId, membership.role, decision)) {
      return NextResponse.json(
        { error: "Only assigned user can act on this decision" },
        { status: 403 }
      );
    }

    try {
      // Route through lifecycle service
      let updated;
      if (input.status === "approved") {
        updated = await approveDecision(decisionId, workspaceId, userId);
      } else {
        if (!input.reason?.trim()) {
          return NextResponse.json(
            { error: "Rejection reason is required" },
            { status: 400 }
          );
        }
        updated = await rejectDecision(decisionId, workspaceId, input.reason, userId);
      }

      logger.info("Decision transitioned via API", {
        decisionId,
        action: input.status,
        workspaceId,
        userId,
      });

      return NextResponse.json(
        {
          decisionId,
          status: updated.status,
          message: `Decision ${input.status} successfully.`,
        },
        { status: 200 }
      );
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        return NextResponse.json(
          { error: lifecycleError.message },
          { status: 409 } // Conflict - invalid state transition
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
    logger.error("Decision update API error", {
      decisionId: (await params).decisionId,
      error: message,
    });

    return NextResponse.json(
      { error: "Update failed", details: message },
      { status: 500 }
    );
  }
}
