import { emitAuditEvent } from '@/infra/audit';
import { AUDIT_EVENTS } from '@/domain/constants/audit-events';
import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { getSession } from "@/services/auth";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { recordDecisionOutcome } from "@/services/decisions/decision-lifecycle.service";
import { db } from "@/lib/db";
import { ValidationError } from "@/infra/errors";
import { z } from "zod";

const RecordOutcomeSchema = z.object({
  actualOutcome: z.string().optional(),
  actualOutcomeValue: z.number().optional(),
  decisionAccuracy: z.number().optional(),
  decisionError: z.number().optional(),
  outcomeDelta: z.number().optional(),
  outcomeNotes: z.string().optional(),
});

type RecordOutcomeInput = z.infer<typeof RecordOutcomeSchema>;

/**
 * POST /api/decisions/[decisionId]/record-outcome
 *
 * Record outcome for executed decision (EXECUTED → OUTCOME_RECORDED)
 * Enforces: decision must be in EXECUTED state
 * Returns: 409 Conflict if transition not allowed
 */
export const POST = withEnforcementFull(
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

    // Check permission to record outcomes
    if (!hasPermission(membership.role, "record_outcome")) {
      throw new Error("Insufficient permissions to record decision outcome");
    }

    // Fetch decision to verify it exists
    const decision = await db.operatorItem.findFirst({
      where: { id: decisionId, workspaceId },
    });

    if (!decision) {
      throw new Error("Decision not found in this workspace");
    }

    // Parse and validate input
    const body = await request.json();
    const outcomeData = RecordOutcomeSchema.parse(body);

    try {
      // Record outcome via lifecycle service
      const updated = await recordDecisionOutcome(
        decisionId,
        workspaceId,
        outcomeData,
        userId
      );

      logger.info("Decision outcome recorded via API", {
        decisionId,
        workspaceId,
        userId,
        actualOutcome: outcomeData.actualOutcome,
        actualOutcomeValue: outcomeData.actualOutcomeValue,
      });

      return {
        decisionId,
        status: updated.status,
        message: "Decision outcome recorded successfully",
        outcome: outcomeData,
      };
    } catch (lifecycleError) {
      if (lifecycleError instanceof ValidationError) {
        throw lifecycleError;
      }
      throw lifecycleError;
    }
  }
);
