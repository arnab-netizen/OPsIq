import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { UnauthorizedError, ValidationError, ForbiddenError } from "@/infra/errors";
import { hasPermission } from "@/middleware/workspace-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { logger } from "@/infra/logger";
import { approveOutcomeVerification } from "@/services/outcome/verification-approval.service";
import {
  checkIdempotencyKey,
  recordIdempotencyResponse,
  recordIdempotencyError,
} from "@/services/idempotency";
import { db } from "@/lib/db";
import { z } from "zod";

const VerifyOutcomeSchema = z.object({
  verificationStatus: z.enum(["verified", "disputed"]),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
});

/**
 * POST /api/decisions/[decisionId]/verify
 *
 * Approve or dispute outcome verification (admin only)
 * State transitions:
 *   unverified → verified | disputed
 *   disputed → verified
 *   verified → disputed
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const workspaceId = ctx.verifiedWorkspaceId;
    const actorId = ctx.verifiedActorId;
    const decisionId = params.decisionId; // FIX: was params.id (bug — path param is [decisionId])

    // Canonical wrapper verified workspace membership; re-fetch role for hasPermission check
    const membership = await db.workspaceMembership.findFirst({
      where: { workspaceId, userId: actorId },
      select: { role: true },
    });
    if (!membership) {
      throw new UnauthorizedError("Workspace membership not found");
    }

    if (!hasPermission(membership.role, "verify_outcome")) {
      throw new ForbiddenError("Insufficient permissions to verify outcome (admin only)");
    }

    const body = ctx.request ? await ctx.request.json() : {};
    const verificationInput = VerifyOutcomeSchema.parse(body);

    const idempotencyKey = ctx.request?.headers.get("idempotency-key");
    if (!idempotencyKey) {
      throw new ValidationError("idempotency-key header is required");
    }

    const idempotencyCheck = await checkIdempotencyKey({
      idempotencyKey,
      operationName: "verifyOutcome",
      actorId,
      workspaceId,
      payload: { decisionId, workspaceId, verificationStatus: verificationInput.verificationStatus },
    });

    if (!idempotencyCheck.isNew && idempotencyCheck.cachedResponse) {
      return idempotencyCheck.cachedResponse.body;
    }
    if (!idempotencyCheck.isNew && idempotencyCheck.cachedError) {
      throw idempotencyCheck.cachedError;
    }

    try {
      const result = await approveOutcomeVerification(
        decisionId,
        workspaceId,
        verificationInput,
        actorId
      );

      logger.info("Outcome verified via API", {
        decisionId,
        workspaceId,
        userId: actorId,
        verificationStatus: verificationInput.verificationStatus,
      });

      const responseBody = {
        success: true,
        decisionId: result.decisionId,
        verificationStatus: result.verificationStatus,
        verifiedAt: result.verifiedAt,
        message: result.message,
      };

      await recordIdempotencyResponse(idempotencyKey, 200, responseBody, workspaceId);
      return responseBody;
    } catch (error) {
      await recordIdempotencyError(
        idempotencyKey,
        error instanceof Error ? error : new Error(String(error)),
        workspaceId
      );
      throw error;
    }
  },
  { requireWorkspace: true, requireCapabilities: [CAPABILITIES.DECISION_UPDATE] }
);
