import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { proofReviewHandler } from "@/services/routes/guided-execution-handlers";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";

/**
 * POST /api/proof/review — manager/owner reviews a proof.
 * Thin wrapper: active membership + required PROOF_REVIEW_LOW_RISK permission,
 * then the proven reviewProof FSM (human-reviewer-only; reject requires a reason).
 *
 * DC-A7.7-DC07 FIX: requiredPermission is server-selected (PROOF_REVIEW_LOW_RISK).
 * Callers cannot supply a weaker permission via request body.
 */
export const POST = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  const body = ctx.request ? await ctx.request.json() : {};
  return proofReviewHandler({
    workspaceId,
    actorId,
    requiredPermission: GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK,
    command: { ...body.command, workspaceId, actorId },
  });
});
