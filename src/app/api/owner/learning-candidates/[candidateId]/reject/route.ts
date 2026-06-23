/**
 * POST /api/owner/learning-candidates/[candidateId]/reject
 *
 * Manually reject a non-promoted learning candidate. Promoted (locked) candidates
 * cannot be rejected — service layer enforces this invariant.
 */

import { z } from "zod";
import { withCanonicalEnforcement, type CanonicalAuthContext } from "@/lib/canonical-route-enforcement";
import { canonicalJson } from "@/lib/canonical-json-response";
import { CAPABILITIES } from "@/domain/constants/capabilities";
import { parseRequestBody } from "@/lib/validation";
import { db } from "@/lib/db";
import { rejectLearningCandidate } from "@/services/controlled-learning-candidate.service";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const rejectSchema = z.object({
  reason: z.string().min(1, "reason is required"),
});

export const POST = withCanonicalEnforcement(
  async (ctx: CanonicalAuthContext, params: Record<string, string>) => {
    const candidateId = params.candidateId;
    if (!candidateId) {
      return canonicalJson({ error: "candidateId is required" }, { status: 400 });
    }

    const body = await parseRequestBody(ctx.request!, rejectSchema);

    const result = await rejectLearningCandidate(
      db as any,
      ctx.verifiedWorkspaceId,
      candidateId,
      ctx.verifiedActorId,
      body.reason
    );

    if (!result.rejected) {
      return canonicalJson({ rejected: false, violations: result.violations }, { status: 422 });
    }

    return canonicalJson({ rejected: true, violations: [] }, { status: 200 });
  },
  { requireCapabilities: [CAPABILITIES.OWNER_MANAGE], requireWorkspace: true }
);
