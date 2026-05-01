import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { recordDecisionOutcome } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";
import { z } from "zod";

const RecordOutcomeSchema = z.object({
  actualOutcome: z.string().optional(),
  actualOutcomeValue: z.number().optional(),
  decisionAccuracy: z.number().optional(),
  decisionError: z.number().optional(),
  outcomeDelta: z.number().optional(),
  outcomeNotes: z.string().optional(),
});

type RecordOutcomeInput = z.infer<typeof RecordOutcomeSchema>;

/**
 * POST /api/decisions/[decisionId]/record-outcome
 *
 * Record outcome for executed decision (EXECUTED → OUTCOME_RECORDED)
 * Enforces: decision must be in EXECUTED state
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

    // Check permission to record outcomes
    if (!hasPermission(membership.role, "record_outcome")) {
      return NextResponse.json(
        { error: "Insufficient permissions to record decision outcome" },
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
    const outcomeData = RecordOutcomeSchema.parse(body);

    try {
      // Record outcome via lifecycle service
      const updated = await recordDecisionOutcome(
        decisionId,
        workspaceId,
        outcomeData,
        userId
      );

      logger.info("Decision outcome recorded via API", {
        decisionId,
        workspaceId,
        userId,
        actualOutcome: outcomeData.actualOutcome,
        actualOutcomeValue: outcomeData.actualOutcomeValue,
      });

      return NextResponse.json(
        {
          decisionId,
          status: updated.status,
          message: "Decision outcome recorded successfully",
          outcome: outcomeData,
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
    logger.error("Decision outcome recording API error", {
      decisionId: (await params).decisionId,
      error: message,
    });

    return NextResponse.json(
      { error: "Outcome recording failed", details: message },
      { status: 500 }
    );
  }
}
