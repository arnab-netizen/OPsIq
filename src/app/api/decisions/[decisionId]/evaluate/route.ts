import { NextRequest, NextResponse } from "next/server";
import { requireWorkspaceContext } from "@/services/workspace/context";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getSession } from "@/services/auth";
import { UnauthorizedError } from "@/infra/errors";

/**
 * POST /api/decisions/[decisionId]/evaluate
 *
 * Evaluate a pending decision using the existing /api/run engine.
 *
 * Flow:
 * 1. Fetch stored decision from database
 * 2. Call /api/run with decision inputs
 * 3. Capture evaluation result (approved/blocked + reasons)
 * 4. Update decision record with evaluation payload
 * 5. Log DECISION_EVALUATED audit event
 *
 * Does NOT change decision status - user still decides to approve/reject/override
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ decisionId: string }> }
) {
  try {
    // Get workspace context (fail closed if missing)
    const workspace = await requireWorkspaceContext();

    // Get authenticated user for audit
    const session = await getSession();
    const userId = session?.user.id ?? null;

    if (!userId) {
      throw new UnauthorizedError("Authentication required");
    }

    const { decisionId } = await params;

    // Fetch stored decision
    const decision = await db.operatorItem.findUnique({
      where: { id: decisionId },
    });

    if (!decision) {
      return NextResponse.json(
        { error: "Decision not found" },
        { status: 404 }
      );
    }

    // Verify workspace access
    if (decision.workspaceId !== workspace.workspaceId) {
      throw new UnauthorizedError("Cross-workspace access denied");
    }

    // Only evaluate pending decisions
    if (decision.status !== "pending") {
      return NextResponse.json(
        { error: `Cannot evaluate ${decision.status} decision. Only pending decisions can be evaluated.` },
        { status: 400 }
      );
    }

    // Reconstruct decision input from stored data
    const decisionInput = {
      problem: decision.problem,
      action: decision.action,
      confidence: decision.confidence,
      impactExpected: decision.impactExpected,
      impactLow: decision.impactLow,
      impactHigh: decision.impactHigh,
      ...decision.inputsSnapshot,
    };

    // Call /api/run to evaluate decision using existing engine
    const runResponse = await fetch("http://localhost:3000/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decisionInput),
    });

    if (!runResponse.ok) {
      throw new Error(
        `Evaluation engine failed: ${runResponse.statusText}`
      );
    }

    const evaluationResult = await runResponse.json();

    // Extract evaluation outcome from /api/run result
    const isApproved = evaluationResult.status === "approved" || !evaluationResult.blockStage;
    const blockStage = evaluationResult.blockStage || null;
    const blockReason = evaluationResult.blockReason || null;

    // Update decision with evaluation result
    const updated = await db.operatorItem.update({
      where: { id: decisionId },
      data: {
        // Store evaluation result
        gateResult: evaluationResult.gateResult || null,
        guardrailResult: evaluationResult.guardrailResult || null,
        controlLayerViolations: evaluationResult.controlLayerViolations || null,

        // Store block information (but don't change status yet)
        blockStage: blockStage,
        blockReason: blockReason,

        // Store full evaluation payload for audit trail
        explanation: {
          evaluated_at: new Date().toISOString(),
          evaluated_by: userId,
          recommendation: isApproved ? "approved" : "blocked",
          block_stage: blockStage,
          block_reason: blockReason,
          evaluation_result: evaluationResult,
        },

        updatedAt: new Date(),
      },
    });

    // Log evaluation audit event
    await logAuditEvent({
      eventName: "DECISION_EVALUATED",
      entityType: "Decision",
      entityId: decisionId,
      actorId: userId,
      role: null,
      before: {
        status: decision.status,
        blockStage: decision.blockStage,
      },
      after: {
        status: decision.status, // Status doesn't change from evaluation
        blockStage: updated.blockStage,
        recommendation: isApproved ? "approved" : "blocked",
      },
      metadata: {
        action: "evaluate_decision",
        recommendation: isApproved ? "approved" : "blocked",
        block_stage: blockStage,
        block_reason: blockReason,
        control_layer_violations: evaluationResult.controlLayerViolations,
        timestamp: new Date().toISOString(),
      },
      workspaceId: workspace.workspaceId,
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    return NextResponse.json(
      {
        decisionId,
        recommendation: isApproved ? "approved" : "blocked",
        blockStage,
        blockReason,
        controlLayerViolations: evaluationResult.controlLayerViolations,
        message: isApproved
          ? "Decision evaluated: System recommends APPROVE"
          : `Decision evaluated: System recommends BLOCK (${blockStage})`,
      },
      { status: 200 }
    );
  } catch (error) {
    if (error instanceof UnauthorizedError) {
      return NextResponse.json(
        { error: "Unauthorized" },
        { status: 403 }
      );
    }

    const message = error instanceof Error ? error.message : "Unknown error";
    console.error(`Evaluation failed: ${message}`);

    return NextResponse.json(
      { error: "Evaluation failed", details: message },
      { status: 500 }
    );
  }
}
