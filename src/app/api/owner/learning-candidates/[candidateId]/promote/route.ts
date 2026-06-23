/**
 * POST /api/owner/learning-candidates/[candidateId]/promote
 *
 * Promote an eligible learning candidate. SEC-005: human approvedBy + approvedAt required.
 * Promoted candidates are locked (immutable). No AI actor may call this endpoint.
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import { promoteLearningCandidate } from "@/services/controlled-learning-candidate.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const promoteSchema = z.object({
  approvedBy: z.string().min(1, "approvedBy (human identity) is required"),
  approvedAt: z.string().min(1, "approvedAt timestamp is required"),
  sourceLabel: z.enum([
    "SYNTHETIC_ONLY_CANDIDATE",
    "HUMAN_VERIFIED_CANDIDATE",
    "REAL_SOURCE_BACKED_CANDIDATE",
  ]),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const candidateId = params.candidateId;
    if (!candidateId) {
      return canonicalJson({ error: "candidateId is required" }, { status: 400 });

    }

    const body = await parseRequestBody(ctx.request!, promoteSchema);

    const result = await promoteLearningCandidate(db as any, ctx.verifiedWorkspaceId, candidateId, {
      approvedBy: body.approvedBy,
      approvedAt: body.approvedAt,
      sourceLabel: body.sourceLabel,
    });

    if (!result.promoted) {
      return canonicalJson({ promoted: false, violations: result.violations }, { status: 422 });
    }

    return canonicalJson({ promoted: true, violations: [] }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
