import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { withEnforcementFull } from "@/lib/enforced-route";
import { withAuth } from "@/lib/auth-guard";
import { enforceWorkspaceScoping } from "@/middleware/workspace-enforcement";
import { ForbiddenError } from "@/infra/errors";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateReviewCycle } from "@/services/review-cycle";
import { z } from "zod/v4";
import type { NextRequest } from "next/server";

const generateReviewSchema = z.object({
  engagementId: z.string().uuid(),
});

/**
 * POST /api/engagements/[engagementId]/review-cycles
 *
 * Generate a weekly review cycle for engagement
 * Wire: review-cycle.generateReviewCycle()
 * Assesses: KPI progress, action completion, findings, overall health
 */
export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    try {
      const { engagementId } = params;

      if (!engagementId) {
        return Response.json(
          { error: "Engagement ID required in path" },
          { status: 400 }
        );
      }

      const validated = generateReviewSchema.parse({ engagementId });

      const reviewCycle = await generateReviewCycle(
        validated.engagementId,
        ctx,
        ctx.verifiedWorkspaceId
      );

      return Response.json(reviewCycle, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return Response.json(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        );
      }

      if (error instanceof Error) {
        return Response.json({ error: error.message }, { status: 400 });
      }

      return Response.json(
        { error: "Internal server error" },
        { status: 500 }
      );
    }
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_UPDATE],
    requireWorkspace: true,
  }
);

/**
 * GET /api/engagements/[engagementId]/review-cycles
 *
 * List historical review cycles for engagement
 * Note: Currently review cycles are not persisted; returns empty array
 */
export const GET = withEnforcementFull(async (request) => {
  await withAuth({
    capability: CAPABILITIES.ENGAGEMENT_VIEW,
  });

  const nextRequest = request as NextRequest;
  const workspaceId = nextRequest.headers.get("x-workspace-id");
  if (!workspaceId) {
    return Response.json(
      { error: "Workspace ID required (x-workspace-id header)" },
      { status: 400 }
    );
  }

  const membership = await enforceWorkspaceScoping(nextRequest, workspaceId);
  if (!membership) {
    throw new ForbiddenError("Unauthorized");
  }

  // TODO: Implement history retrieval when ReviewCycle persistence is added to schema
  // For now, return empty array indicating no persisted cycles yet
  return Response.json({
    cycles: [],
    note: "Review cycle history not yet implemented - cycles are generated on-demand",
  });
});
