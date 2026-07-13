import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ForbiddenError } from "@/infra/errors";
import { hasPermission } from "@/middleware/workspace-enforcement";
import { db } from "@/lib/db";
import { emitAuditEvent } from "@/infra/audit";
import { AUDIT_EVENTS } from "@/domain/constants/audit-events";

/**
 * POST /api/decisions/[decisionId]/evaluate
 *
 * Evaluate a pending decision using the existing /api/run engine.
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    const decisionId = params.decisionId;

    // Canonical wrapper verified workspace membership; re-fetch role for hasPermission check
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: actorId },
      select: { role: true },
    });
    if (!membership) {
      throw new UnauthorizedError("Workspace membership not found");
    }

    if (!hasPermission(membership.role, "evaluate")) {
      throw new ForbiddenError("Insufficient permissions to evaluate decisions");
    }

    const decision = await db.operatorItem.findUnique({
      where: { id: decisionId, workspaceId },
    });
    if (!decision) {
      throw new ForbiddenError("Decision not found in this workspace");
    }

    if (decision.status !== "pending") {
      throw new Error(`Cannot evaluate ${decision.status} decision. Only pending decisions can be evaluated.`);
    }

    const decisionInput = {
      problem: decision.problem,
      action: decision.action,
      confidence: decision.confidence,
      impactExpected: decision.impactExpected,
      impactLow: decision.impactLow,
      impactHigh: decision.impactHigh,
      ...decision.inputsSnapshot,
    };

    const runResponse = await fetch("http://localhost:3000/api/run", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(decisionInput),
    });

    if (!runResponse.ok) {
      throw new Error(`Evaluation engine failed: ${runResponse.statusText}`);
    }

    const evaluationResult = await runResponse.json();

    const isApproved = evaluationResult.status === "approved" || !evaluationResult.blockStage;
    const blockStage = evaluationResult.blockStage || null;
    const blockReason = evaluationResult.blockReason || null;

    const updated = await db.operatorItem.update({
      where: { id: decisionId, workspaceId },
      data: {
        gateResult: evaluationResult.gateResult || null,
        guardrailResult: evaluationResult.guardrailResult || null,
        controlLayerViolations: evaluationResult.controlLayerViolations || null,
        blockStage,
        blockReason,
        explanation: {
          evaluated_at: new Date().toISOString(),
          evaluated_by: actorId,
          recommendation: isApproved ? "approved" : "blocked",
          block_stage: blockStage,
          block_reason: blockReason,
          evaluation_result: evaluationResult,
        },
        updatedAt: new Date(),
      },
    });

    await emitAuditEvent({
      eventName: AUDIT_EVENTS.DECISION_EVALUATED,
      entityType: "Decision",
      entityId: decisionId,
      actorId,
      actorType: "user",
      workspaceId,
      payload: {
        before: {
          status: decision.status,
          blockStage: decision.blockStage,
        },
        after: {
          status: updated.status,
          blockStage: updated.blockStage,
          recommendation: isApproved ? "approved" : "blocked",
        },
        action: "evaluate_decision",
        recommendation: isApproved ? "approved" : "blocked",
        block_stage: blockStage,
        block_reason: blockReason,
        control_layer_violations: evaluationResult.controlLayerViolations,
        timestamp: new Date().toISOString(),
      },
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
  },
  { requireWorkspace: true }
);
