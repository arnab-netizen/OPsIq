import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { acceptDecision, type VerifiedAcceptanceInput } from "@/services/decision-validation/decision-acceptance.service";
import { logger } from "@/infra/logger";
import { z } from "zod";

const AcceptDecisionSchema = z.object({
  engagementId: z.string().uuid(),
  rationale: z.string().optional(),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = nextRequest.headers.get("x-workspace-id");

    // Parse and validate request body
    const body = await ctx.request!.json();
    const parsed = AcceptDecisionSchema.parse(body);

    // Accept decision
    const verifiedInput: VerifiedAcceptanceInput = {
      decisionId,
      engagementId: parsed.engagementId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedActorId: ctx.verifiedActorId,
      rationale: parsed.rationale,
    };
    const result = await acceptDecision(verifiedInput);

    logger.info("Decision acceptance recorded", {
      decisionId,
      engagementId: parsed.engagementId,
      userId: ctx.verifiedActorId,
    });

    return result;
  },
  { requireCapabilities: ["DECISION_ACCEPT"], requireWorkspace: true }
);
