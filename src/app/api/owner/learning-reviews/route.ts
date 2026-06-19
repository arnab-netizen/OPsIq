import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  createReview,
  listReviewsForWorkspace,
  listReviewsForCandidate,
} from "@/services/controlled-learning-review.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const createReviewSchema = z.object({
  candidateId: z.string().min(1),
  reviewerId: z.string().min(1),
  decision: z.enum(["APPROVED", "REJECTED", "DEFERRED"]),
  reviewNotes: z.string(),
  reviewedAt: z.string().min(1).transform((s) => new Date(s)),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const candidateId = url.searchParams.get("candidateId");
    const data = candidateId
      ? await listReviewsForCandidate(db as any, ctx.verifiedWorkspaceId, candidateId)
      : await listReviewsForWorkspace(db as any, ctx.verifiedWorkspaceId);
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, createReviewSchema);
    const result = await createReview(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      reviewerId: body.reviewerId,
      decision: body.decision,
      reviewNotes: body.reviewNotes,
      reviewedAt: body.reviewedAt,
    });
    if (result.violations?.length) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ reviewId: result.id, review: result }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
