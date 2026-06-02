import { NextRequest } from "next/server";
import { withAuth } from "@/lib/auth-guard";
import { UnauthorizedError, ValidationError } from "@/infra/errors";
import { withEnforcementFull } from "@/lib/enforced-route";
import { enforceWorkspaceScoping, hasPermission } from "@/middleware/workspace-enforcement";
import { logger } from "@/infra/logger";
import { approveOutcomeVerification } from "@/services/outcome/verification-approval.service";
import { z } from "zod";

const VerifyOutcomeSchema = z.object({
  verificationStatus: z.enum(["verified", "disputed"]),
  reason: z.string().min(5, "Reason must be at least 5 characters"),
});

type VerifyOutcomeInput = z.infer<typeof VerifyOutcomeSchema>;

/**
 * POST /api/decisions/[id]/verify
 *
 * Approve or dispute outcome verification (admin only)
 * State transitions:
 *   unverified → verified | disputed
 *   disputed → verified
 *   verified → disputed
 *
 * Returns: 200 on success, 400 on validation error, 409 on invalid transition
 */
export const POST = withEnforcementFull(
  async (request: NextRequest, ctx, params) => {
    const { session } = await withAuth();
    if (!session?.user?.id) {
      throw new UnauthorizedError("Unauthorized");
    }

    const userId = session.user.id;
    const decisionId = params.id;

    // Get workspace ID from query
    const workspaceId = request.nextUrl.searchParams.get("workspaceId");
    if (!workspaceId) {
      throw new ValidationError("Workspace ID required");
    }

    // Enforce workspace scoping
    const membership = await enforceWorkspaceScoping(request, workspaceId);
    if (!membership) {
      throw new UnauthorizedError("Unauthorized or invalid workspace");
    }

    // Check admin permission to verify outcomes
    if (!hasPermission(membership.role, "verify_outcome")) {
      throw new UnauthorizedError("Insufficient permissions to verify outcome (admin only)");
    }

    // Parse and validate input
    const body = await request.json();
    const verificationInput = VerifyOutcomeSchema.parse(body);

    try {
      // Approve/verify outcome
      const result = await approveOutcomeVerification(
        decisionId,
        workspaceId,
        verificationInput,
        userId
      );

      logger.info("Outcome verified via API", {
        decisionId,
        workspaceId,
        userId,
        verificationStatus: verificationInput.verificationStatus,
      });

      return {
        success: true,
        decisionId: result.decisionId,
        verificationStatus: result.verificationStatus,
        verifiedAt: result.verifiedAt,
        message: result.message,
      };
    } catch (error) {
      if (error instanceof ValidationError) {
        throw error;
      }
      throw error;
    }
  }
);
