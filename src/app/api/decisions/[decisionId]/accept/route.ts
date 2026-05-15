import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { acceptDecision } from "@/services/decision-validation/decision-acceptance.service";
import { logger } from "@/infra/logger";
import { z } from "zod";

const AcceptDecisionSchema = z.object({
  engagementId: z.string().uuid(),
  rationale: z.string().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = ctx.verifiedWorkspaceId;

    // Parse and validate request body
    const body = await ctx.request!.json();
    const parsed = AcceptDecisionSchema.parse(body);

    // Accept decision
    const result = await acceptDecision({
      decisionId,
      engagementId: parsed.engagementId,
      workspaceId,
      acceptedBy: ctx.verifiedActorId,
      rationale: parsed.rationale,
    });

    logger.info("Decision acceptance recorded", {
      decisionId,
      engagementId: parsed.engagementId,
      userId: ctx.verifiedActorId,
    });

    return result;
  },
  { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }
);
