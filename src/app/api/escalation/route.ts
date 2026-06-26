import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { raiseEscalationHandler } from "@/services/routes/guided-execution-handlers";

/**
 * POST /api/escalation — employee/manager raises a blocker/escalation.
 * Thin wrapper: active membership, then the proven routeEscalation + persistence
 * (refund/discount-beyond-boundary/lost-damaged/safety → owner, etc.).
 */
export const POST = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  const body = ctx.request ? await ctx.request.json() : {};
  return raiseEscalationHandler({
    workspaceId,
    actorId,
    command: { ...body.command, workspaceId, createdByUserId: actorId },
  });
});
