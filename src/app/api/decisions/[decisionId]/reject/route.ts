import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { rejectDecision, type VerifiedRejectionInput } from "@/services/decision-validation/decision-acceptance.service";
import { logger } from "@/infra/logger";
import { z } from "zod";

const RejectDecisionSchema = z.object({
  engagementId: z.string().uuid(),
  reason: z.string().min(10, "Rejection reason must be at least 10 characters"),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params) => {
    const decisionId = params.decisionId;
    const workspaceId = ctx.verifiedWorkspaceId;

    // Parse and validate request body
    const body = await ctx.request!.json();
    const parsed = RejectDecisionSchema.parse(body);

    // Reject decision
    const verifiedInput: VerifiedRejectionInput = {
      decisionId,
      engagementId: parsed.engagementId,
      verifiedWorkspaceId: ctx.verifiedWorkspaceId,
      verifiedActorId: ctx.verifiedActorId,
      reason: parsed.reason,
    };
    const result = await rejectDecision(verifiedInput);

    logger.info("Decision rejection recorded", {
      decisionId,
      engagementId: parsed.engagementId,
      userId: ctx.verifiedActorId,
      reason: parsed.reason,
    });

    return result;
  },
  { requireCapabilities: ["DECISION_REJECT"], requireWorkspace: true }
);
