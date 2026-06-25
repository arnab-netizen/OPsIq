import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { proofReviewHandler } from "@/services/routes/guided-execution-handlers";
import { GuidedExecutionPermission } from "@/domain/workspace/guided-execution-permissions";

/**
 * POST /api/proof/review — manager/owner reviews a proof.
 * Thin wrapper: active membership + required PROOF_REVIEW_* permission, then the
 * proven reviewProof FSM (human-reviewer-only; reject requires a reason).
 */
export const POST = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  const body = ctx.request ? await ctx.request.json() : {};
  const requiredPermission =
    (body.requiredPermission as GuidedExecutionPermission) ??
    GuidedExecutionPermission.PROOF_REVIEW_LOW_RISK;
  return proofReviewHandler({
    workspaceId,
    actorId,
    requiredPermission,
    command: { ...body.command, workspaceId, actorId },
  });
});
