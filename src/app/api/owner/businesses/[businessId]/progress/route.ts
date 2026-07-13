/**
 * GET /api/owner/businesses/[businessId]/progress — Cross-domain action progress (Workflow 7).
 *
 * Returns a cross-domain progress summary for a single owner business without
 * requiring an `engagementId`. Covers all 5 domain spines: finance, sales,
 * operations, sop, strategy.
 *
 * Query params:
 *   ?review=true — additionally generate a business review (status: improving /
 *                  stagnant / worsening) and emit an audit event.
 *
 * Pure read — no persistence. workspaceId from canonical session only.
 *
 * Auth: OWNER_VIEW capability, workspace-scoped, canonically enforced.
 */
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getOwnerBusinessProgress, generateOwnerBusinessReview } from "@/services/owner-mode/owner-progress.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const businessId = params.businessId;
    const url = new URL(ctx.request!.url);
    const review = url.searchParams.get("review") === "true";

    if (review) {
      const reviewedAt = new Date().toISOString();
      return generateOwnerBusinessReview(
        businessId,
        ctx.verifiedWorkspaceId,
        ctx.verifiedActorId,
        reviewedAt,
        db as never,
      );
    }

    return getOwnerBusinessProgress(businessId, ctx.verifiedWorkspaceId, db as never);
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true },
);
