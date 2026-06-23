import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { db } from "@/lib/db";
import { getReview } from "@/services/controlled-learning-review.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const reviewId = params.reviewId;
    if (!reviewId) {
      return canonicalJson({ error: "reviewId is required" }, { status: 400 });
    }
    const review = await getReview(db as any, ctx.verifiedWorkspaceId, reviewId);
    if (!review) {
      return canonicalJson({ error: "Review not found" }, { status: 404 });
    }
    return canonicalJson(review, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);
