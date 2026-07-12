import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ForbiddenError, NotFoundError, ValidationError } from "@/infra/errors";
import {
  hasPermission,
  canActOnDecision,
} from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import {
  approveDecision,
  rejectDecision,
} from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { z } from "zod";

const UpdateDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

export const PATCH = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    const decisionId = params.decisionId;

    // Canonical wrapper verified workspace membership; re-fetch role for hasPermission check
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: actorId },
      select: { role: true },
    });
    if (!membership) {
      throw new UnauthorizedError("Workspace membership not found");
    }

    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });
    if (!decision) {
      throw new NotFoundError("Decision", decisionId);
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const input = UpdateDecisionSchema.parse(body);

    if (!hasPermission(membership.role, input.status === "approved" ? "approve" : "reject")) {
      throw new ForbiddenError(`Insufficient permissions to ${input.status} decision`);
    }

    if (!canActOnDecision(actorId, membership.role, decision)) {
      throw new ForbiddenError("Only assigned user can act on this decision");
    }

    try {
      let updated;
      if (input.status === "approved") {
        updated = await approveDecision(decisionId, workspaceId, actorId, input.reason);
      } else {
        if (!input.reason?.trim()) {
          throw new ValidationError("Rejection reason is required");
        }
        updated = await rejectDecision(decisionId, workspaceId, input.reason, actorId);
      }

      logger.info("Decision transitioned via API", {
        decisionId,
        action: input.status,
        workspaceId,
        userId: actorId,
      });

      return {
        decisionId,
        status: updated.status,
        message: `Decision ${input.status} successfully.`,
      };
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        throw lifecycleError;
      }
      throw lifecycleError;
    }
  },
  { requireWorkspace: true }
);
