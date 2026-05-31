import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { generateReviewCycle } from "@/services/review-cycle";
import { classifyOperatorError } from "@/lib/operator-error-governance";
import { z } from "zod/v4";

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
        return canonicalJson(
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

      return canonicalJson(reviewCycle, { status: 201 });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return canonicalJson(
          { error: "Validation error", details: error.issues },
          { status: 400 }
        );
      }

      if (error instanceof Error) {
        return canonicalJson({ error: classifyOperatorError(error, { context: "load" }).operatorMessage }, { status: 400 });
      }

      return canonicalJson(
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
export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    return {
      cycles: [],
      note: "Review cycle history not yet implemented - cycles are generated on-demand",
    };
  },
  {
    requireCapabilities: [CAPABILITIES.ENGAGEMENT_VIEW],
    requireWorkspace: true,
  }
);
