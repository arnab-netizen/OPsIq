/**
 * GET /api/owner/goals/trajectory — compute trajectory for active goal.
 * Returns projectedMonthsToGoal, confidence, gapToClose, TRAJECTORY_MISS alert.
 * Returns 200 with null trajectory when no active goal exists.
 * OWNER_VIEW required.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { computeActiveGoalTrajectory } from "@/services/owner-strategy/goal.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const result = await computeActiveGoalTrajectory(ctx.verifiedWorkspaceId);
    return canonicalJson({ result }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
