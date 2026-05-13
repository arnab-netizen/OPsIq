import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { getSession } from "@/services/auth";
import {
  enforceWorkspaceScoping,
  hasPermission,
  canActOnDecision,
} from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import {
  approveDecision,
  rejectDecision,
} from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError, NotFoundError } from "@/infra/errors";
import { z } from "zod";

const UpdateDecisionSchema = z.object({
  status: z.enum(["approved", "rejected"]),
  reason: z.string().optional(),
});

type UpdateDecisionInput = z.infer<typeof UpdateDecisionSchema>;

export const PATCH = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const { session } = await withAuth();
    if (!session?.user?.id) {
      throw new UnauthorizedError("Unauthorized");
    }

    const userId = session.user.id;
    const decisionId = params.decisionId;

    // Get workspace ID from query
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new Error("Workspace ID required");
    }

    // Enforce workspace scoping
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      throw new UnauthorizedError("Unauthorized or invalid workspace");
    }

    // Fetch decision to check current state
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new Error("Decision not found in this workspace");
    }

    // Parse input
    const body = await request.json();
    const input = UpdateDecisionSchema.parse(body);

    // Check permission based on action
    if (!hasPermission(membership.role, input.status === "approved" ? "approve" : "reject")) {
      throw new Error(`Insufficient permissions to ${input.status} decision`);
    }

    // Check if user can act on this decision
    if (!canActOnDecision(userId, membership.role, decision)) {
      throw new Error("Only assigned user can act on this decision");
    }

    try {
      // Route through lifecycle service
      let updated;
      if (input.status === "approved") {
        updated = await approveDecision(decisionId, workspaceId, userId);
      } else {
        if (!input.reason?.trim()) {
          throw new Error("Rejection reason is required");
        }
        updated = await rejectDecision(decisionId, workspaceId, input.reason, userId);
      }

      logger.info("Decision transitioned via API", {
        decisionId,
        action: input.status,
        workspaceId,
        userId,
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
  }
);
