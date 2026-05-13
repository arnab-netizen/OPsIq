import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { db } from "@/lib/db";
import { logAuditEvent } from "@/services/audit/audit-log";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";

/**
 * POST /api/decisions/[decisionId]/evaluate
 *
 * Evaluate a pending decision using the existing /api/run engine.
 */
export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const { session } = await withAuth();
    if (!session?.user?.id) {
      throw new UnauthorizedError("Unauthorized");
    }

    const userId = session.user.id;
    const decisionId = params.decisionId;

    // Get workspace ID from query or body
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }

    // Enforce workspace scoping
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      throw new UnauthorizedError("Unauthorized or invalid workspace");
    }

    // Check permission to evaluate decisions
    if (!hasPermission(membership.role, "evaluate")) {
      throw new Error("Insufficient permissions to evaluate decisions");
    }

    // Fetch stored decision with workspace scoping
    const decision = await db.operatorItem.findUnique({
      where: { id: decisionId, workspaceId },  // Scope at DB level
    });

    if (!decision) {
      throw new Error("Decision not found in this workspace");
    }

    // Only evaluate pending decisions
    if (decision.status !== "pending") {
      throw new Error(`Cannot evaluate ${decision.status} decision. Only pending decisions can be evaluated.`);
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

    // Update decision with evaluation result (with workspace scoping)
    const updated = await db.operatorItem.update({
      where: { id: decisionId, workspaceId },  // Scope at DB level
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
      workspaceId,
    }).catch((auditError) => {
      console.error(`Audit logging failed: ${auditError}`);
    });

    return {
      decisionId,
      recommendation: isApproved ? "approved" : "blocked",
      blockStage,
      blockReason,
      controlLayerViolations: evaluationResult.controlLayerViolations,
      message: isApproved
        ? "Decision evaluated: System recommends APPROVE"
        : `Decision evaluated: System recommends BLOCK (${blockStage})`,
    };
  }
);
