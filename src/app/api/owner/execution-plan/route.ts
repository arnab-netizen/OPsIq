import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { ownerGuidedChoiceHandler } from "@/services/routes/guided-execution-handlers";

/**
 * GET /api/owner/execution-plan — the owner's guided execution plan / guidance
 * start surface. Thin wrapper: active membership + OWNER dashboard scope, then the
 * owner-scoped delegated-task plan (real, workspace-scoped data) passed through
 * `scopedResponse` redaction. Employees/managers are denied at the scope gate.
 */
export const GET = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;

  const tasks = await db.delegatedTask.findMany({
    where: { workspaceId },
    select: {
      id: true,
      title: true,
      status: true,
      priority: true,
      assignedRole: true,
      assignedUserId: true,
      dueAt: true,
    },
    orderBy: { dueAt: "asc" },
  });

  const plan = {
    guidanceStartActions: ["START_GUIDANCE", "SHOW_STEP_BY_STEP_PLAN", "ASSIGN_TO_EMPLOYEE", "TRACK_PROOF"],
    tasks,
  };

  return ownerGuidedChoiceHandler({ workspaceId, actorId, choices: plan });
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] });
