import { NextRequest } from "next/server";
import { withEnforcementFull } from "@/lib/enforced-route";
import { requireAuthForCapability } from "@/lib/auth-guard";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { acceptDecision } from "@/services/decision-validation/decision-acceptance.service";
import { ValidationError, NotFoundError, ForbiddenError } from "@/infra/errors";
import { logger } from "@/infra/logger";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { z } from "zod";

const AcceptDecisionSchema = z.object({
  engagementId: z.string().uuid(),
  rationale: z.string().optional(),
});

export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const decisionId = params.decisionId;

    // Extract workspace from header
    const workspaceId = request.headers.get("x-workspace-id");
    if (!workspaceId) {
      throw new Error("Workspace ID required (x-workspace-id header)");
    }

    // Enforce workspace membership
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      throw new Error("Unauthorized");
    }

    // Enforce DECISION_ACCEPT capability
    const auth = await requireAuthForCapability(CAPABILITIES.DECISION_ACCEPT, undefined, workspaceId);

    // Parse and validate request body
    const body = await request.json();
    const parsed = AcceptDecisionSchema.parse(body);

    // Accept decision
    const result = await acceptDecision({
      decisionId,
      engagementId: parsed.engagementId,
      workspaceId,
      acceptedBy: auth.session.user.id,
      rationale: parsed.rationale,
    });

    logger.info("Decision acceptance recorded", {
      decisionId,
      engagementId: parsed.engagementId,
      userId: auth.session.user.id,
    });

    return result;
  }
);
