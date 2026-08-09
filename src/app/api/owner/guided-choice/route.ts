import { withCanonicalEnforcement } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { ownerGuidedChoiceHandler } from "@/services/routes/guided-execution-handlers";

/**
 * GET /api/owner/guided-choice — owner guided-choice surface.
 * Thin wrapper: enforces active membership + OWNER dashboard scope + redaction
 * via ownerGuidedChoiceHandler (proven). Employees/managers are denied.
 */
export const GET = withCanonicalEnforcement(async (ctx) => {
  const actorId = ctx.verifiedSessionSnapshot.actorId;
  const workspaceId = ctx.verifiedWorkspaceId;
  const choices = {
    availableActions: [
      "APPROVE",
      "REJECT",
      "ASK_FOR_EVIDENCE",
      "MARK_INFEASIBLE",
      "CONVERT_TO_EXPERIMENT",
      "START_GUIDANCE",
      "SHOW_STEP_BY_STEP_PLAN",
      "ASSIGN_TO_EMPLOYEE",
      "TRACK_PROOF",
      "VERIFY_OUTCOME",
    ],
  };
  return ownerGuidedChoiceHandler({ workspaceId, actorId, choices });
}, { requireWorkspace: true, requireCapabilities: [CAPABILITIES.OWNER_VIEW] });
