/**
 * GET  /api/owner/learning-attribution-reviews — list attribution reviews (OWNER_VIEW)
 * POST /api/owner/learning-attribution-reviews — record an attribution review (OWNER_MANAGE)
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import {
  recordAttributionReview,
  listAttributionReviewsForHarmEvent,
  listAttributionReviewsForCandidate,
} from "@/services/controlled-learning-attribution.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const attributionReviewSchema = z.object({
  candidateId: z.string().min(1),
  harmEventId: z.string().min(1),
  reviewedBy: z.string().min(1),
  reviewedAt: z.string().min(1).transform((s) => new Date(s)),
  verdict: z.enum(["ATTRIBUTED", "NOT_ATTRIBUTED", "PARTIAL", "INCONCLUSIVE"]),
  confidenceScore: z.number().min(0).max(1),
  reviewNotes: z.string(),
});

export const GET = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const url = new URL(ctx.request!.url);
    const harmEventId = url.searchParams.get("harmEventId");
    const candidateId = url.searchParams.get("candidateId");
    let data: object[];
    if (harmEventId) {
      data = await listAttributionReviewsForHarmEvent(db as any, ctx.verifiedWorkspaceId, harmEventId);
    } else if (candidateId) {
      data = await listAttributionReviewsForCandidate(db as any, ctx.verifiedWorkspaceId, candidateId);
    } else {
      data = [];
    }
    return canonicalJson(data, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_VIEW], requireWorkspace: true }
);

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext) => {
    const body = await parseRequestBody(ctx.request!, attributionReviewSchema);
    const result = await recordAttributionReview(db as any, {
      workspaceId: ctx.verifiedWorkspaceId,
      candidateId: body.candidateId,
      harmEventId: body.harmEventId,
      reviewedBy: body.reviewedBy,
      reviewedAt: body.reviewedAt,
      verdict: body.verdict,
      confidenceScore: body.confidenceScore,
      reviewNotes: body.reviewNotes,
    });
    if (!result.recorded) {
      return canonicalJson({ violations: result.violations }, { status: 422 });
    }
    return canonicalJson({ review: result.review }, { status: 201 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
